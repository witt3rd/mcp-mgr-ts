import { StreamUpdate, ToolCallResult } from './types';
import { defaultLogger, LoggerInterface } from './logger';
import { ConnectionManager } from './connection-manager';
import { ServerNotFoundError, ConnectionError, ToolCallError } from './errors';

/**
 * Handles invoking tools on connected MCP servers.
 */
export class ToolInvoker {
    private logger: LoggerInterface;
    private connectionManager: ConnectionManager;

    constructor(connectionManager: ConnectionManager, logger: LoggerInterface = defaultLogger) {
        this.connectionManager = connectionManager;
        this.logger = logger;
    }

    /**
     * Calls a tool on a specified MCP server.
     * Handles streaming updates via the optional onUpdate callback.
     * @param serverName - The name of the target server.
     * @param toolName - The name of the tool to call.
     * @param args - The arguments for the tool call.
     * @param onUpdate - Optional callback function to receive streaming updates.
     * @returns A promise resolving to the final ToolCallResult.
     * @throws {ServerNotFoundError} If the server is not registered/found.
     * @throws {ConnectionError} If the server is not connected.
     * @throws {ToolCallError} If the tool call itself fails.
     */
    async callTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
        onUpdate?: (update: StreamUpdate) => void
    ): Promise<ToolCallResult> {
        this.logger.info(`Calling tool "${toolName}" on server "${serverName}"...`);
        this.logger.debug(`Args for tool "${toolName}":`, args);

        const client = this.connectionManager.getClient(serverName);
        if (!client) {
            const status = this.connectionManager.getStatus(serverName);
            if (status === 'disconnected') {
                throw new ServerNotFoundError(serverName); // Or ConnectionError? Let's use ServerNotFound if never connected/registered
            } else {
                throw new ConnectionError(serverName, `Server is not connected (status: ${status}). Cannot call tool.`);
            }
        }

        try {
            onUpdate?.({ type: 'tool_start', content: { toolName, args } });

            const sdkResponse: any = await client.callTool({
                name: toolName,
                arguments: args || {},
            });

            this.logger.debug(`Raw SDK response for tool "${toolName}" on server "${serverName}":`, sdkResponse);

            const result: ToolCallResult = {
                success: !sdkResponse?.isError,
                content: sdkResponse?.content?.map((c: any) => ({
                    type: c?.type,
                    text: c?.type === 'text' ? c.text : undefined,
                    mimeType: c?.mimeType,
                })),
                error: sdkResponse?.isError ? JSON.stringify(sdkResponse.content) : undefined,
                isError: sdkResponse?.isError,
            };

            onUpdate?.({ type: 'tool_end', content: result, isFinal: true });

            if (result.isError) {
                const errorMessage = result.error || 'Tool reported an unspecified error';
                this.logger.error(`Tool call "${toolName}" on server "${serverName}" failed: ${errorMessage}`, result.content);
                throw new ToolCallError(serverName, toolName, errorMessage, errorMessage);
            }

            this.logger.info(`Tool call "${toolName}" on server "${serverName}" completed successfully.`);
            return result;

        } catch (error: any) {
            onUpdate?.({ type: 'error', content: error.message, isFinal: true });

            if (error instanceof ToolCallError) {
                throw error;
            } else {
                this.logger.error(`Error during tool call "${toolName}" on server "${serverName}":`, error);
                throw new ToolCallError(serverName, toolName, `Failed to call tool: ${error.message}`, error);
            }
        }
    }
}
