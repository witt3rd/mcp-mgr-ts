/**
 * Base error class for all errors originating from the McpManager library.
 */
export class McpManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpManagerError';
    // Ensure the prototype chain is correct
    Object.setPrototypeOf(this, McpManagerError.prototype);
  }
}

/**
 * Error thrown when an operation is attempted on a server that is not registered.
 */
export class ServerNotFoundError extends McpManagerError {
  constructor(serverName: string) {
    super(`Server "${serverName}" not found or not registered.`);
    this.name = 'ServerNotFoundError';
    Object.setPrototypeOf(this, ServerNotFoundError.prototype);
  }
}

/**
 * Error thrown when there is a problem connecting to or communicating with an MCP server process.
 */
export class ConnectionError extends McpManagerError {
  public serverName: string;
  public originalError?: Error;

  constructor(serverName: string, message: string, originalError?: Error) {
    super(`Connection error for server "${serverName}": ${message}`);
    this.name = 'ConnectionError';
    this.serverName = serverName;
    this.originalError = originalError;
    // Capture stack trace from original error if available
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Error thrown when a tool call to an MCP server fails.
 */
export class ToolCallError extends McpManagerError {
  public serverName: string;
  public toolName: string;
  public originalError?: Error | string; // Can be an error object or just a message string from the server

  constructor(serverName: string, toolName: string, message: string, originalError?: Error | string) {
    super(`Tool call error for "${toolName}" on server "${serverName}": ${message}`);
    this.name = 'ToolCallError';
    this.serverName = serverName;
    this.toolName = toolName;
    this.originalError = originalError;
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack;
    }
    Object.setPrototypeOf(this, ToolCallError.prototype);
  }
}

/**
 * Error thrown when there is an issue with the server process itself (e.g., crash, invalid command).
 */
export class ProcessError extends McpManagerError {
  public serverName: string;
  public originalError?: Error;
  public exitCode?: number | null;
  public signal?: NodeJS.Signals | null;

  constructor(serverName: string, message: string, originalError?: Error, exitCode?: number | null, signal?: NodeJS.Signals | null) {
    super(`Process error for server "${serverName}": ${message}`);
    this.name = 'ProcessError';
    this.serverName = serverName;
    this.originalError = originalError;
    this.exitCode = exitCode;
    this.signal = signal;
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
    Object.setPrototypeOf(this, ProcessError.prototype);
  }
}

/**
 * Error thrown when interacting with the storage adapter fails.
 */
export class StorageError extends McpManagerError {
  public operation: string; // e.g., 'getAllServers', 'saveServer'
  public originalError?: Error;

  constructor(operation: string, message: string, originalError?: Error) {
    super(`Storage error during operation "${operation}": ${message}`);
    this.name = 'StorageError';
    this.operation = operation;
    this.originalError = originalError;
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}
