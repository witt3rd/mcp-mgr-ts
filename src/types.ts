// Import necessary types from the SDK
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// Removed incorrect import of CallToolResponse, ContentBlock

// Removed unnecessary re-export of non-existent/unused types
// export type { CallToolResponse, ContentBlock };

/**
 * Configuration for an MCP server process.
 * Provided by the consuming application.
 */
export interface McpServerConfig {
    /** The command to execute (e.g., 'node', 'python', '/path/to/executable'). */
    command: string;
    /** Arguments for the command. */
    args?: string[];
    /** Environment variables for the server process. */
    env?: Record<string, string>;
    /** Optional working directory for the server process. */
    workingDir?: string;
    /** Optional display name for the server (for UI purposes). */
    displayName?: string;
    /** Optional description for the server (for UI purposes). */
    description?: string;
    /** Optional flag indicating if the server should be automatically connected on startup. Defaults to true. */
    autoConnect?: boolean;
}

/**
 * Internal representation of a managed MCP connection.
 */
export interface McpConnection {
    /** The unique name identifying the server. */
    serverName: string;
    /** The MCP SDK Client instance. */
    client: Client;
    /** The MCP SDK Transport instance (specifically StdioClientTransport for now). */
    transport: StdioClientTransport;
    // process: ChildProcess; // Removed: Transport manages the process internally
    /** Current status of the connection. */
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    /** The last error encountered, if any. */
    lastError?: Error;
    /** The configuration used to start this server. */
    config: McpServerConfig;
}

/**
 * Standardized definition of a tool provided by an MCP server.
 */
export interface ToolDefinition {
    /** The unique name of the tool. */
    name: string;
    /** A human-readable description of the tool. */
    description?: string;
    /** The JSON schema defining the input arguments for the tool. */
    inputSchema: any; // Consider using a more specific JSON Schema type if available
    // outputSchema?: any; // Optional: Schema for the tool's output
    /** Flag indicating if the tool's results can be memoized (from MCP spec). */
    memoizable?: boolean;
}

/**
 * Options for initializing the McpManager.
 */
export interface McpManagerOptions {
    /** Adapter for persisting server configurations. If not provided, registry is in-memory only. */
    // storageAdapter?: StorageAdapter; // Removed storage adapter option
    /** Adapter for logging. Defaults to console logging. */
    // logger?: LoggerInterface; // Removed logger option, will use internal default
}

// Removed StorageAdapter interface
// Removed LoggerInterface interface

/**
 * Structure representing the result of a tool call.
 */
export interface ToolCallResult {
    /** Indicates if the tool call was successful from the server's perspective. */
    success: boolean;
    /** The content returned by the tool (can be multiple parts). */
    content?: Array<{
        type: string; // e.g., 'text', 'json', 'image'
        text?: string;
        mimeType?: string;
        // Potentially add fields for other content types like base64 data for images
    }>;
    /** An error message if the call failed. */
    error?: string;
    /** Flag indicating if the result represents an error (from MCP spec). */
    isError?: boolean;
}

/**
 * Structure representing a single update during a streaming tool call.
 */
export interface StreamUpdate {
    /** The type of update (e.g., text chunk, error message, usage stats). */
    type: 'text' | 'error' | 'usage' | 'metadata' | 'tool_start' | 'tool_end'; // Extend as needed
    /** The content of the update (e.g., text chunk, error message). */
    content?: any;
    /** Indicates if this is the final update in the stream. */
    isFinal?: boolean;
    /** Optional MIME type for text content. */
    mimeType?: string;
    // Add other relevant fields like usage data, metadata object, etc.
}

/**
 * Events emitted by the McpManager.
 */
export type McpManagerEvent =
    | 'serverRegistered' // (name: string, config: McpServerConfig) => void
    | 'serverUnregistered' // (name: string) => void
    | 'serverConfigUpdated' // (name: string, config: McpServerConfig) => void
    | 'connectionStatusChanged' // (name: string, status: McpConnection['status'], error?: Error) => void
    | 'toolCallStart' // (serverName: string, toolName: string, args: Record<string, unknown>) => void
    | 'toolCallUpdate' // (serverName: string, toolName: string, update: StreamUpdate) => void
    | 'toolCallEnd'; // (serverName: string, toolName: string, result: ToolCallResult) => void
