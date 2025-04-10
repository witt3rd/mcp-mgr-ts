import { ToolDefinition } from './types';
import { defaultLogger, LoggerInterface } from './logger'; // Import LoggerInterface from logger.ts
import { ConnectionManager } from './connection-manager';
import { ServerNotFoundError, ConnectionError } from './errors';

/**
 * Manages fetching and caching of tool schemas from connected MCP servers.
 */
export class SchemaManager {
  private logger: LoggerInterface;
  private connectionManager: ConnectionManager;
  private schemaCache: Map<string, Map<string, ToolDefinition>> = new Map(); // serverName -> toolName -> ToolDefinition

  constructor(connectionManager: ConnectionManager, logger: LoggerInterface = defaultLogger) {
    this.connectionManager = connectionManager;
    this.logger = logger;
    // TODO: Consider adding listeners to ConnectionManager events to invalidate cache on disconnect/error?
  }

  /**
   * Retrieves all tool definitions for a specific server.
   * Fetches from the server if not cached, otherwise returns cached schemas.
   * @param serverName - The name of the server.
   * @returns A map of tool names to their definitions.
   * @throws {ServerNotFoundError} If the server is not registered or found.
   * @throws {ConnectionError} If the server is not connected or the listTools call fails.
   */
  async listTools(serverName: string): Promise<Map<string, ToolDefinition>> {
    this.logger.debug(`Listing tools for server "${serverName}"...`);

    // Check cache first
    if (this.schemaCache.has(serverName)) {
      this.logger.debug(`Returning cached schemas for server "${serverName}".`);
      return new Map(this.schemaCache.get(serverName)!); // Return a copy
    }

    const client = this.connectionManager.getClient(serverName);
    if (!client) {
      // Check if the server exists but isn't connected
      if (this.connectionManager.getStatus(serverName) !== 'disconnected') {
        throw new ConnectionError(serverName, `Server is not connected (status: ${this.connectionManager.getStatus(serverName)}). Cannot list tools.`);
      } else {
        // If truly not found/registered via connection manager status
        throw new ServerNotFoundError(serverName); // Or maybe ConnectionError is better?
      }
    }

    try {
      this.logger.debug(`Fetching tools from server "${serverName}"...`);
      const response = await client.listTools();
      const toolsMap = new Map<string, ToolDefinition>();

      if (response.tools && response.tools.length > 0) {
        response.tools.forEach(tool => {
          // Basic validation/transformation if needed
          const toolDef: ToolDefinition = {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema || {}, // Ensure inputSchema exists
            // Explicitly check type for memoizable
            memoizable: typeof tool.memoizable === 'boolean' ? tool.memoizable : undefined,
          };
          toolsMap.set(tool.name, toolDef);
        });
        this.logger.info(`Fetched ${toolsMap.size} tools for server "${serverName}".`);
      } else {
        this.logger.warn(`Server "${serverName}" reported no tools.`);
      }

      // Update cache
      this.schemaCache.set(serverName, toolsMap);
      return new Map(toolsMap); // Return a copy

    } catch (error: any) {
      this.logger.error(`Failed to list tools for server "${serverName}":`, error);
      // Invalidate cache entry on error? Or keep stale? Invalidate for now.
      this.schemaCache.delete(serverName);
      throw new ConnectionError(serverName, `Failed to list tools: ${error.message}`, error);
    }
  }

  /**
   * Retrieves the definition for a specific tool on a specific server.
   * Uses the cached listTools result if available.
   * @param serverName - The name of the server.
   * @param toolName - The name of the tool.
   * @returns The tool definition or undefined if not found.
   * @throws {ServerNotFoundError | ConnectionError} If listing tools fails.
   */
  async getToolSchema(serverName: string, toolName: string): Promise<ToolDefinition | undefined> {
    this.logger.debug(`Getting schema for tool "${toolName}" on server "${serverName}"...`);
    // Ensure cache is populated or fetch fresh
    const serverTools = await this.listTools(serverName);
    return serverTools.get(toolName);
  }

  /**
   * Invalidates the schema cache for a specific server.
   * @param serverName - The name of the server whose cache should be cleared.
   */
  invalidateCache(serverName: string): void {
    this.logger.info(`Invalidating schema cache for server "${serverName}".`);
    this.schemaCache.delete(serverName);
  }

  /**
   * Clears the entire schema cache.
   */
  clearCache(): void {
    this.logger.info('Clearing all schema caches.');
    this.schemaCache.clear();
  }
}
