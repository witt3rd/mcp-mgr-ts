import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';


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
    inputSchema: any;
    /** Flag indicating if the tool's results can be memoized (from MCP spec). */
    memoizable?: boolean;
}

/**
 * Options for initializing the McpManager.
 */
export interface McpManagerOptions {
    /** Optional directory path for storing server configurations (e.g., servers.json). Defaults to './.mcp-manager'. */
    storageDir?: string;
}


/**
 * Structure representing the result of a tool call.
 */
export interface ToolCallResult {
    /** Indicates if the tool call was successful from the server's perspective. */
    success: boolean;
    /** The content returned by the tool (can be multiple parts). */
    content?: Array<{
        type: string;
        text?: string;
        mimeType?: string;
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
    type: 'text' | 'error' | 'usage' | 'metadata' | 'tool_start' | 'tool_end';
    /** The content of the update (e.g., text chunk, error message). */
    content?: any;
    /** Indicates if this is the final update in the stream. */
    isFinal?: boolean;
    /** Optional MIME type for text content. */
    mimeType?: string;
}

/**
 * Events emitted by the McpManager.
 */
export type McpManagerEvent =
    | 'serverRegistered'
    | 'serverUnregistered'
    | 'serverConfigUpdated'
    | 'connectionStatusChanged'
    | 'toolCallStart'
    | 'toolCallUpdate'
    | 'toolCallEnd';
