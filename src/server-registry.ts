import { McpServerConfig } from './types';
import { defaultLogger, LoggerInterface } from './logger';
import { ServerNotFoundError } from './errors'; // Remove StorageError
import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureDir } from 'fs-extra'; // Using fs-extra for ensureDir

/**
 * Manages the registration and configuration of MCP servers.
 * Manages the registration and configuration of MCP servers.
 * (Internal storage logic will be added later).
 */
export class ServerRegistry {
  private logger: LoggerInterface;
  private servers: Map<string, McpServerConfig> = new Map();
  private isInitialized = false;
  private storagePath: string; // Path for the JSON file

  constructor(storageDir?: string, logger: LoggerInterface = defaultLogger) {
    this.logger = logger;
    // Determine storage path: use provided dir or default to cwd/.mcp-manager
    const effectiveStorageDir = storageDir || path.join(process.cwd(), '.mcp-manager');
    this.storagePath = path.join(effectiveStorageDir, 'servers.json');
    this.logger.info(`ServerRegistry using storage path: ${this.storagePath}`);
  }

  /**
   * Initializes the registry by loading server configurations from the storage adapter.
   * Should be called once after instantiation.
   * @throws {StorageError} If loading from storage fails.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('ServerRegistry already initialized.');
      return;
    }

    this.logger.info(`Initializing ServerRegistry from ${this.storagePath}...`);
    try {
      // Ensure directory exists
      await ensureDir(path.dirname(this.storagePath));
      // Try reading the file
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const storedServers = JSON.parse(data);
      // Basic validation: ensure it's an object
      if (typeof storedServers === 'object' && storedServers !== null) {
        this.servers = new Map(Object.entries(storedServers));
        this.logger.info(`Loaded ${this.servers.size} servers from ${this.storagePath}.`);
      } else {
        this.logger.warn(`Invalid data format in ${this.storagePath}, starting empty.`);
        this.servers = new Map();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info(`Storage file not found at ${this.storagePath}, starting with empty registry.`);
        this.servers = new Map();
      } else {
        this.logger.error(`Failed to load servers from ${this.storagePath}:`, error);
        // Decide: throw or start empty? Start empty for resilience.
        this.servers = new Map();
        // Optionally re-throw if loading is critical: throw new Error(`Failed to initialize registry: ${error.message}`);
      }
    }
    this.isInitialized = true;
    this.logger.info('ServerRegistry initialized.');
  }

  /**
   * Registers a new server or updates an existing one.
   * Persists the change using the storage adapter if available.
   * @param name - The unique name of the server.
   * @param config - The server configuration.
   * @throws {StorageError} If saving to storage fails.
   */
  async registerServer(name: string, config: McpServerConfig): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Registry not initialized. Call initialize() first.');
      // Or throw an error? For now, just log and proceed in-memory.
    }
    this.logger.info(`Registering or updating server "${name}"...`);
    this.servers.set(name, config);
    this.logger.debug(`Server "${name}" config set in memory:`, config);

    await this._persistRegistry(); // Persist changes
    // Consider emitting an event here: 'serverRegistered' or 'serverConfigUpdated'
  }

  /**
   * Unregisters a server.
   * Removes the server from the registry and persists the change using the storage adapter.
   * @param name - The name of the server to unregister.
   * @throws {ServerNotFoundError} If the server is not found.
   * @throws {StorageError} If removing from storage fails.
   */
  async unregisterServer(name: string): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Registry not initialized. Call initialize() first.');
    }
    this.logger.info(`Unregistering server "${name}"...`);
    if (!this.servers.has(name)) {
      throw new ServerNotFoundError(name);
    }

    this.servers.delete(name);
    this.logger.debug(`Server "${name}" removed from memory.`);

    await this._persistRegistry(); // Persist changes
    // Consider emitting an event here: 'serverUnregistered'
  }

  /**
   * Retrieves the configuration for a specific server.
   * @param name - The name of the server.
   * @returns The server configuration or undefined if not found.
   */
  getServerConfig(name: string): McpServerConfig | undefined {
    if (!this.isInitialized) {
      this.logger.warn('Registry not initialized. Call initialize() first. Returning in-memory state.');
    }
    return this.servers.get(name);
  }

  /**
   * Retrieves the configurations for all registered servers.
   * @returns A record mapping server names to their configurations.
   */
  getAllServers(): Record<string, McpServerConfig> {
    if (!this.isInitialized) {
      this.logger.warn('Registry not initialized. Call initialize() first. Returning in-memory state.');
    }
    // Return a copy to prevent external modification of the internal map
    return Object.fromEntries(this.servers.entries());
  }

  /**
   * Updates the configuration for an existing server. Alias for registerServer.
   * @param name - The name of the server to update.
   * @param config - The new configuration.
   * @throws {StorageError} If saving to storage fails.
   */
  async updateServerConfig(name: string, config: McpServerConfig): Promise<void> {
    // Currently identical to registerServer, but provides semantic clarity
    await this.registerServer(name, config);
    // Consider emitting 'serverConfigUpdated' event specifically
    await this._persistRegistry(); // Persist after update
  }

  /**
   * Writes the current server registry map to the JSON storage file.
   * @private
   */
  private async _persistRegistry(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Attempted to persist registry before initialization, skipping.');
      return;
    }
    this.logger.debug(`Persisting registry to ${this.storagePath}...`);
    try {
      const registryObject = Object.fromEntries(this.servers.entries());
      const data = JSON.stringify(registryObject, null, 2); // Pretty print JSON
      // Ensure directory exists before writing
      await ensureDir(path.dirname(this.storagePath));
      await fs.writeFile(this.storagePath, data, 'utf-8');
      this.logger.debug(`Registry successfully persisted ${this.servers.size} servers.`);
    } catch (error: any) {
      this.logger.error(`Failed to persist registry to ${this.storagePath}:`, error);
      // Decide how to handle persistence errors - throw? log?
      // For now, just log the error.
    }
  }
}
