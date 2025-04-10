// Import necessary types from local types.ts
import { StreamUpdate, ToolCallResult } from './types'; // Removed CallToolResponse, ContentBlock
import { defaultLogger, LoggerInterface } from './logger';
import { ConnectionManager } from './connection-manager';
import { ServerNotFoundError, ConnectionError, ToolCallError } from './errors';
// Removed direct SDK import

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
      // Emit a 'tool_start' update if callback provided
      onUpdate?.({ type: 'tool_start', content: { toolName, args } });

      // Call the SDK method - assume it returns an object with content/isError
      const sdkResponse: any = await client.callTool({ // Use 'any' for now
        name: toolName,
        arguments: args || {}, // Ensure arguments is an object
        // TODO: How to handle streaming properly with the SDK's callTool?
        // The current SDK's callTool might not directly support streaming via callback.
        // It might return an async iterator or handle streaming internally.
        // For now, assume callTool resolves with the *final* result and
        // doesn't handle intermediate streaming updates itself.
        // We might need to adapt this if the SDK provides explicit streaming support
        // in callTool or requires a different method (e.g., streamTool).
        // If the SDK *does* stream via events on the client/transport, we'd listen there.
      });

      this.logger.debug(`Raw SDK response for tool "${toolName}" on server "${serverName}":`, sdkResponse);

      // Basic transformation to our ToolCallResult format, accessing fields directly
      const result: ToolCallResult = {
        success: !sdkResponse?.isError, // Check if sdkResponse and isError exist
        content: sdkResponse?.content?.map((c: any) => ({ // Map content if it exists, use 'any' for block
          type: c?.type, // Safely access type
          text: c?.type === 'text' ? c.text : undefined, // Safely access text
          mimeType: c?.mimeType, // Safely access mimeType
          // TODO: Handle other content types if necessary
        })),
        error: sdkResponse?.isError ? JSON.stringify(sdkResponse.content) : undefined, // Simple error string for now
        isError: sdkResponse?.isError,
      };

      // Emit a final 'tool_end' update if callback provided
      onUpdate?.({ type: 'tool_end', content: result, isFinal: true });

      if (result.isError) {
        const errorMessage = result.error || 'Tool reported an unspecified error';
        this.logger.error(`Tool call "${toolName}" on server "${serverName}" failed: ${errorMessage}`, result.content);
        // Throw a specific error for tool failures, passing the error message string
        throw new ToolCallError(serverName, toolName, errorMessage, errorMessage);
      }

      this.logger.info(`Tool call "${toolName}" on server "${serverName}" completed successfully.`);
      return result;

    } catch (error: any) {
      // Emit an 'error' update if callback provided
      onUpdate?.({ type: 'error', content: error.message, isFinal: true });

      // Handle different types of errors
      if (error instanceof ToolCallError) {
        // Already logged and formatted, just rethrow
        throw error;
      } else {
        this.logger.error(`Error during tool call "${toolName}" on server "${serverName}":`, error);
        // Wrap other errors in ToolCallError
        throw new ToolCallError(serverName, toolName, `Failed to call tool: ${error.message}`, error);
      }
    }
  }
}
