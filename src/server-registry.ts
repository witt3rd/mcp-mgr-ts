import { McpServerConfig } from './types';
import { defaultLogger, LoggerInterface } from './logger';
import { ServerNotFoundError } from './errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureDir } from 'fs-extra';

/**
 * Manages the registration and configuration of MCP servers.
 */
export class ServerRegistry {
    private logger: LoggerInterface;
    private servers: Map<string, McpServerConfig> = new Map();
    private isInitialized = false;
    private storagePath: string;

    constructor(storageDir?: string, logger: LoggerInterface = defaultLogger) {
        this.logger = logger;
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
            await ensureDir(path.dirname(this.storagePath));
            const data = await fs.readFile(this.storagePath, 'utf-8');
            const storedServers = JSON.parse(data);
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
                this.servers = new Map();
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
        }
        this.logger.info(`Registering or updating server "${name}"...`);
        this.servers.set(name, config);
        this.logger.debug(`Server "${name}" config set in memory:`, config);

        await this._persistRegistry();
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

        await this._persistRegistry();
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
        return Object.fromEntries(this.servers.entries());
    }

    /**
     * Updates the configuration for an existing server. Alias for registerServer.
     * @param name - The name of the server to update.
     * @param config - The new configuration.
     * @throws {StorageError} If saving to storage fails.
     */
    async updateServerConfig(name: string, config: McpServerConfig): Promise<void> {
        await this.registerServer(name, config);
        await this._persistRegistry();
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
            const data = JSON.stringify(registryObject, null, 2);
            await ensureDir(path.dirname(this.storagePath));
            await fs.writeFile(this.storagePath, data, 'utf-8');
            this.logger.debug(`Registry successfully persisted ${this.servers.size} servers.`);
        } catch (error: any) {
            this.logger.error(`Failed to persist registry to ${this.storagePath}:`, error);
        }
    }
}
