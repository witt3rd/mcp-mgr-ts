import { EventEmitter } from 'events';
import { ConnectionManager } from './connection-manager';
import { ServerNotFoundError } from './errors';
import { ConsoleLogger } from './logger';
import { SchemaManager } from './schema-manager';
import { ServerRegistry } from './server-registry';
import { ToolInvoker } from './tool-invoker';
import {
    McpConnection,
    McpManagerEvent,
    McpManagerOptions, // Import the options interface
    McpServerConfig,
    StreamUpdate,
    ToolCallResult,
    ToolDefinition,
} from './types';
import { LoggerInterface } from './logger';

/**
 * Main class for managing MCP server interactions.
 * Provides a unified API for server registration, connection, and tool invocation.
 */
export class McpManager extends EventEmitter {
    private logger: LoggerInterface;
    private serverRegistry: ServerRegistry;
    private connectionManager: ConnectionManager;
    private schemaManager: SchemaManager;
    private toolInvoker: ToolInvoker;
    private isInitialized = false;

    constructor(options?: McpManagerOptions) { // Accept options
        super();
        this.logger = new ConsoleLogger();

        // Instantiate components, passing dependencies
        this.serverRegistry = new ServerRegistry(options?.storageDir, this.logger);
        this.connectionManager = new ConnectionManager(this.serverRegistry, this.logger);
        this.schemaManager = new SchemaManager(this.connectionManager, this.logger);
        this.toolInvoker = new ToolInvoker(this.connectionManager, this.logger);

        // Forward events from ConnectionManager
        this.connectionManager.on('connectionStatusChanged', (serverName, status, error) => {
            this.emit('connectionStatusChanged', serverName, status, error);
            // Invalidate schema cache on disconnect or error
            if (status === 'disconnected' || status === 'error') {
                this.schemaManager.invalidateCache(serverName);
            }
        });

        this.logger.info('McpManager instantiated.');
    }

    /**
     * Initializes the manager by loading data from the storage adapter.
     * Must be called before most other methods if using a storage adapter.
     * Optionally connects to servers marked with autoConnect=true.
     * @param autoConnectServers - If true, attempts to connect to servers with autoConnect enabled. Defaults to true.
     */
    async initialize(autoConnectServers = true): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('McpManager already initialized.');
            return;
        }
        this.logger.info('Initializing McpManager...');
        await this.serverRegistry.initialize(); // Load servers from storage
        this.isInitialized = true;
        this.logger.info('McpManager initialized.');

        if (autoConnectServers) {
            this.logger.info('Attempting to auto-connect servers...');
            const servers = this.serverRegistry.getAllServers();
            const connectPromises: Promise<void>[] = [];
            for (const [name, config] of Object.entries(servers)) {
                // Connect if autoConnect is true or undefined (default to true)
                if (config.autoConnect !== false) {
                    connectPromises.push(
                        this.connectServer(name).catch(error => {
                            // Log connection errors during auto-connect but don't fail initialization
                            this.logger.error(`Auto-connect failed for server "${name}":`, error);
                        })
                    );
                }
            }
            await Promise.all(connectPromises);
            this.logger.info('Auto-connect sequence finished.');
        }
    }

    // --- Server Management ---

    async registerServer(name: string, config: McpServerConfig): Promise<void> {
        await this.serverRegistry.registerServer(name, config);
        this.emit('serverRegistered', name, config);
        // Optionally auto-connect if registered while running?
        if (config.autoConnect !== false && this.isInitialized) {
            this.logger.info(`Auto-connecting newly registered server "${name}"...`);
            await this.connectServer(name).catch(error => {
                this.logger.error(`Auto-connect failed for newly registered server "${name}":`, error);
            });
        }
    }

    async unregisterServer(name: string): Promise<void> {
        // Ensure disconnected before removing from registry
        await this.disconnectServer(name).catch(error => {
            this.logger.warn(`Error during disconnect while unregistering server "${name}" (proceeding with unregistration):`, error);
        });
        await this.serverRegistry.unregisterServer(name);
        this.emit('serverUnregistered', name);
    }

    async updateServerConfig(name: string, config: McpServerConfig): Promise<void> {
        const oldConfig = this.serverRegistry.getServerConfig(name);
        if (!oldConfig) {
            throw new ServerNotFoundError(name);
        }
        await this.serverRegistry.updateServerConfig(name, config);
        this.emit('serverConfigUpdated', name, config);
        // If connection details changed, disconnect and potentially reconnect
        const needsReconnect = oldConfig.command !== config.command ||
            JSON.stringify(oldConfig.args) !== JSON.stringify(config.args) ||
            JSON.stringify(oldConfig.env) !== JSON.stringify(config.env) ||
            oldConfig.workingDir !== config.workingDir;

        if (needsReconnect && this.connectionManager.getStatus(name) !== 'disconnected') {
            this.logger.info(`Configuration changed for connected server "${name}", reconnecting...`);
            await this.disconnectServer(name);
            if (config.autoConnect !== false) {
                await this.connectServer(name).catch(error => {
                    this.logger.error(`Failed to reconnect server "${name}" after config update:`, error);
                });
            }
        }
    }

    async getServerConfig(name: string): Promise<McpServerConfig | undefined> {
        return this.serverRegistry.getServerConfig(name);
    }

    async getAllServers(): Promise<Record<string, McpServerConfig>> {
        // Ensure registry is initialized
        if (!this.isInitialized) {
            await this.initialize(false); // Initialize without auto-connecting
        }
        return this.serverRegistry.getAllServers();
    }

    // --- Connection Management ---

    async connectServer(name: string): Promise<void> {
        if (!this.isInitialized) {
            this.logger.warn(`Attempted to connect server "${name}" before manager was initialized. Initializing now...`);
            await this.initialize(false); // Initialize if needed, but don't auto-connect others
        }
        await this.connectionManager.connect(name);
    }

    async disconnectServer(name: string): Promise<void> {
        await this.connectionManager.disconnect(name);
    }

    async connectAllServers(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize(false);
        }
        const servers = this.serverRegistry.getAllServers();
        const connectPromises = Object.keys(servers).map(name =>
            this.connectServer(name).catch(error => {
                this.logger.error(`Failed to connect server "${name}" during connectAll:`, error);
            })
        );
        await Promise.all(connectPromises);
    }

    async disconnectAllServers(): Promise<void> {
        await this.connectionManager.disconnectAll();
    }

    getConnectionStatus(name: string): McpConnection['status'] {
        return this.connectionManager.getStatus(name);
    }

    listConnectedServers(): string[] {
        return this.connectionManager.listConnectedServers();
    }

    // --- Tool Interaction ---

    async listTools(serverName: string): Promise<ToolDefinition[]> {
        const toolsMap = await this.schemaManager.listTools(serverName);
        return Array.from(toolsMap.values());
    }

    async getToolSchema(serverName: string, toolName: string): Promise<ToolDefinition | undefined> {
        return this.schemaManager.getToolSchema(serverName, toolName);
    }

    async callTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
        onUpdate?: (update: StreamUpdate) => void
    ): Promise<ToolCallResult> {
        // Wrap onUpdate to emit events
        const updateHandler = onUpdate
            ? (update: StreamUpdate) => {
                this.emit('toolCallUpdate', serverName, toolName, update);
                onUpdate(update);
            }
            : undefined;

        try {
            this.emit('toolCallStart', serverName, toolName, args);
            const result = await this.toolInvoker.callTool(serverName, toolName, args, updateHandler);
            this.emit('toolCallEnd', serverName, toolName, result);
            return result;
        } catch (error) {
            // Ensure toolCallEnd is emitted even on error, potentially with error info
            const errorResult: ToolCallResult = { success: false, isError: true, error: error instanceof Error ? error.message : String(error) };
            this.emit('toolCallEnd', serverName, toolName, errorResult);
            throw error; // Re-throw the original error
        }
    }

    // --- Lifecycle ---

    /**
     * Disconnects all servers and performs cleanup.
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down McpManager...');
        await this.disconnectAllServers();
        // Add any other cleanup logic here (e.g., closing storage adapter if needed)
        this.logger.info('McpManager shut down.');
    }

    // --- Event Emitter Overloads for Typed Events ---
    // This provides type safety for event listeners

    on(event: 'serverRegistered', listener: (name: string, config: McpServerConfig) => void): this;
    on(event: 'serverUnregistered', listener: (name: string) => void): this;
    on(event: 'serverConfigUpdated', listener: (name: string, config: McpServerConfig) => void): this;
    on(event: 'connectionStatusChanged', listener: (name: string, status: McpConnection['status'], error?: Error) => void): this;
    on(event: 'toolCallStart', listener: (serverName: string, toolName: string, args: Record<string, unknown>) => void): this;
    on(event: 'toolCallUpdate', listener: (serverName: string, toolName: string, update: StreamUpdate) => void): this;
    on(event: 'toolCallEnd', listener: (serverName: string, toolName: string, result: ToolCallResult) => void): this;
    // Generic overload
    on(event: McpManagerEvent | string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    emit(event: 'serverRegistered', name: string, config: McpServerConfig): boolean;
    emit(event: 'serverUnregistered', name: string): boolean;
    emit(event: 'serverConfigUpdated', name: string, config: McpServerConfig): boolean;
    emit(event: 'connectionStatusChanged', name: string, status: McpConnection['status'], error?: Error): boolean;
    emit(event: 'toolCallStart', serverName: string, toolName: string, args: Record<string, unknown>): boolean;
    emit(event: 'toolCallUpdate', serverName: string, toolName: string, update: StreamUpdate): boolean;
    emit(event: 'toolCallEnd', serverName: string, toolName: string, result: ToolCallResult): boolean;
    // Generic overload
    emit(event: McpManagerEvent | string | symbol, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }
}
