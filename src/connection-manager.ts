import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EventEmitter } from 'events';
import { ConnectionError, ProcessError, ServerNotFoundError } from './errors';
import { defaultLogger, LoggerInterface } from './logger'; // Import LoggerInterface from logger.ts
import { ServerRegistry } from './server-registry';
import { McpConnection } from './types'; // Removed McpServerConfig import

/**
 * Manages connections to MCP servers using the MCP SDK.
 * Handles transport lifecycle and updates connection status.
 */
export class ConnectionManager extends EventEmitter {
  private logger: LoggerInterface;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, McpConnection> = new Map();

  constructor(
    serverRegistry: ServerRegistry,
    logger: LoggerInterface = defaultLogger
  ) {
    super();
    this.serverRegistry = serverRegistry;
    this.logger = logger;
  }

  /**
   * Establishes a connection to a registered MCP server.
   * The transport will start the server process.
   * @param serverName - The name of the server to connect to.
   * @throws {ServerNotFoundError} If the server is not registered.
   * @throws {ConnectionError} If the MCP connection or process start fails.
   */
  async connect(serverName: string): Promise<void> {
    const existingConnection = this.connections.get(serverName);
    if (existingConnection?.status === 'connected' || existingConnection?.status === 'connecting') {
      this.logger.warn(`Server "${serverName}" is already ${existingConnection.status}.`);
      return;
    }

    if (existingConnection) {
      await this.disconnect(serverName); // Clean up previous state
    }

    this.logger.info(`Connecting to server "${serverName}"...`);
    this._updateStatus(serverName, 'connecting');

    const config = this.serverRegistry.getServerConfig(serverName);
    if (!config) {
      const error = new ServerNotFoundError(serverName);
      this._updateStatus(serverName, 'error', error);
      throw error;
    }

    const client = new Client({ name: 'mcp-manager-consumer', version: '1.0.0' }); // TODO: Allow consumer app name/version?

    // Prepare environment for transport
    const env = {
      ...process.env,
      ...(config.env || {}),
    };
    const filteredEnv: Record<string, string> = {};
    for (const key in env) {
      if (env[key] !== undefined) {
        filteredEnv[key] = env[key] as string;
      }
    }

    let transport: StdioClientTransport;
    try {
      // Instantiate transport with config - it handles process spawning
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: filteredEnv,
        cwd: config.workingDir,
      });
      this.logger.debug(`StdioClientTransport created for "${serverName}".`);
    } catch (error: any) {
      this.logger.error(`Failed to create StdioClientTransport for "${serverName}":`, error);
      const processError = new ProcessError(serverName, `Transport creation failed: ${error.message}`, error);
      this._updateStatus(serverName, 'error', processError);
      throw processError;
    }


    // Store partial connection info early
    const connection: McpConnection = {
      serverName,
      client,
      transport,
      // process: undefined, // Removed
      status: 'connecting',
      config,
    };
    this.connections.set(serverName, connection);

    // --- Set up listeners on the transport ---
    // The transport itself might emit events related to the underlying process,
    // but the SDK abstracts much of this. We primarily rely on connect/close results.
    // If the SDK/Transport exposes process exit/error events, listen here.
    // For now, we rely on the connect promise rejection and close method.

    // --- Attempt connection ---
    try {
      this.logger.debug(`Attempting client.connect() for "${serverName}"...`);
      await client.connect(transport);
      this.logger.info(`Successfully connected to server "${serverName}".`);
      this._updateStatus(serverName, 'connected');
    } catch (error: any) {
      this.logger.error(`Failed to establish MCP connection to server "${serverName}":`, error);
      // Transport might handle process termination on connection failure,
      // but explicitly close to be sure.
      await transport.close().catch(closeErr => this.logger.warn(`Error closing transport after connection failure for "${serverName}":`, closeErr));
      const connectionError = new ConnectionError(serverName, `MCP connection failed: ${error.message}`, error);
      this._updateStatus(serverName, 'error', connectionError);
      this.connections.delete(serverName); // Remove failed connection attempt
      throw connectionError;
    }
  }

  /**
   * Disconnects from a specific server and stops its process via the transport.
   * @param serverName - The name of the server to disconnect.
   */
  async disconnect(serverName: string): Promise<void> {
    this.logger.info(`Disconnecting from server "${serverName}"...`);
    const connection = this.connections.get(serverName);

    if (!connection) {
      this.logger.warn(`Server "${serverName}" not found or not connected/connecting.`);
      // No process to stop directly here, transport handles it.
      return;
    }

    // Only attempt to close if connecting or connected
    if (connection.status === 'connecting' || connection.status === 'connected') {
      try {
        // Attempt to close the transport gracefully (this should terminate the process)
        await connection.transport.close();
        this.logger.debug(`Transport closed for server "${serverName}".`);
      } catch (error: any) {
        this.logger.error(`Error closing transport for server "${serverName}": ${error.message}. Status will be updated.`);
        // Update status to error if closing failed, otherwise it becomes disconnected
        this._updateStatus(serverName, 'error', new ConnectionError(serverName, `Failed to close transport: ${error.message}`, error));
        this.connections.delete(serverName); // Remove from active connections
        return; // Exit early as closing failed
      }
    }

    // If we reach here, closing was successful or wasn't needed (already disconnected/errored)
    this._updateStatus(serverName, 'disconnected');
    this.connections.delete(serverName); // Remove from active connections
    this.logger.info(`Disconnected from server "${serverName}".`);
  }


  /**
   * Disconnects from all currently connected or connecting servers.
   */
  async disconnectAll(): Promise<void> {
    this.logger.info(`Disconnecting from all (${this.connections.size}) servers...`);
    const disconnectPromises = Array.from(this.connections.keys()).map(name =>
      this.disconnect(name).catch(error => {
        // Log error but don't let one failure stop others
        this.logger.error(`Error disconnecting server "${name}" during disconnectAll:`, error);
      })
    );
    await Promise.all(disconnectPromises);
    this.logger.info('Finished disconnecting all servers.');
  }

  /**
   * Gets the current status of a server connection.
   * @param serverName - The name of the server.
   * @returns The connection status, or 'disconnected' if not tracked.
   */
  getStatus(serverName: string): McpConnection['status'] {
    return this.connections.get(serverName)?.status ?? 'disconnected';
  }

  /**
   * Gets the McpConnection object for a connected server.
   * @param serverName - The name of the server.
   * @returns The McpConnection object or undefined if not connected.
   */
  getConnection(serverName: string): McpConnection | undefined {
    const conn = this.connections.get(serverName);
    // Return only if truly connected
    return conn?.status === 'connected' ? conn : undefined;
  }

  /**
   * Gets the MCP SDK Client instance for a connected server.
   * Useful for direct SDK interactions if needed.
   * @param serverName - The name of the server.
   * @returns The Client instance or undefined if not connected.
   */
  getClient(serverName: string): Client | undefined {
    return this.getConnection(serverName)?.client;
  }

  /**
   * Lists the names of all servers currently connected.
   */
  listConnectedServers(): string[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected')
      .map(conn => conn.serverName);
  }

  /**
   * Updates the status of a connection and emits an event.
   */
  private _updateStatus(serverName: string, status: McpConnection['status'], error?: Error): void {
    const connection = this.connections.get(serverName);
    if (connection) {
      // Don't update status if it's already the same, unless there's a new error
      if (connection.status === status && connection.lastError === error) return;
      connection.status = status;
      connection.lastError = error;
    } else if (status === 'disconnected' || status === 'error') {
      // If connection doesn't exist but we're setting final state, still emit.
      this.emit('connectionStatusChanged', serverName, status, error);
      this.logger.debug(`Status for untracked server "${serverName}" set to: ${status}${error ? ` (Error: ${error.message})` : ''}`);
      return;
    } else {
      // Should not happen if called correctly, but log if it does
      this.logger.warn(`Attempted to update status for non-existent connection "${serverName}" to ${status}`);
      return;
    }

    this.emit('connectionStatusChanged', serverName, status, error);
    this.logger.debug(`Status for server "${serverName}" updated to: ${status}${error ? ` (Error: ${error.message})` : ''}`);
  }
}
