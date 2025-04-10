# MCP Manager Library Design

## 1. Introduction

### 1.1 Purpose

This document outlines the design for extracting the core Model Context Protocol (MCP) server management functionality from the Aura application into a standalone, reusable TypeScript library named `mcp-manager`. This library will provide a generalized solution for discovering, configuring, connecting to, and interacting with MCP servers.

### 1.2 Goals

- **Decoupling**: Separate MCP management logic from Aura's core application concerns.
- **Reusability**: Create a library usable by Aura and potentially other applications needing MCP interaction.
- **Maintainability**: Simplify the MCP-related codebase within Aura by abstracting common functionality.
- **Extensibility**: Design the library to accommodate future MCP features and server types.
- **Testability**: Enable isolated testing of MCP management logic.

### 1.3 Scope

The library will handle:

- **Server Registration**: Managing a list of configured MCP servers.
- **Process Management**: Spawning, monitoring, and terminating MCP server processes.
- **Connection Management**: Establishing and maintaining connections to servers using the MCP SDK.
- **Tool Discovery**: Listing available tools from connected servers.
- **Tool Invocation**: Calling tools on connected servers and handling responses (including streaming).
- **Schema Management**: Retrieving and caching tool schemas.

The library will **not** handle:

- **UI Components**: User interface elements remain within the consuming application (Aura).
- **Application-Specific Configuration**: Aura's `ConfigService` will still manage the overall application configuration, providing server details to the library.
- **Autonomous Installation**: The complex logic for Aura's autonomous server installation will remain within Aura, potentially utilizing primitives provided by the library.

## 2. Architecture

### 2.1 High-Level Design

The `mcp-manager` library will provide a central `McpManager` class as the primary entry point. This manager will coordinate several internal components responsible for specific aspects of MCP handling.

```mermaid
graph TD
    subgraph "Consuming Application (e.g., Aura)"
        App[Application Logic] --> Config[Configuration Source]
        App --> UIManager[UI Manager]
        App --> McpMgrAPI[McpManager API]
    end

    subgraph "mcp-manager Library"
        McpMgrAPI --> McpManager[McpManager]
        McpManager --> Registry[ServerRegistry]
        McpManager --> ConnMgr[ConnectionManager]
        McpManager --> ToolInvoker[ToolInvoker]

        Registry -- Internal File Storage --> Persistence
        ConnMgr --> SdkClient[MCP SDK Client] // Handles process via Transport
        ToolInvoker --> SdkClient
        ToolInvoker --> SchemaMgr[SchemaManager]
        SchemaMgr --> SdkClient
    end

    // ProcMgr removed, handled by ConnMgr/Transport
    SdkClient <-->|Stdio Transport| ServerProcess[Server Child Process]
```

### 2.2 Core Components

1. **`McpManager`**:

   - The main facade of the library.
   - Initializes and coordinates other components.
   - Provides the public API for interacting with MCP servers.
   - Manages the overall lifecycle.
   - Uses an internal default `ConsoleLogger`.

2. **`ServerRegistry`**:

   - Maintains the list of known MCP servers and their configurations (`McpServerConfig`).
   - Handles adding, updating, and removing server registrations.
   - **Handles persistence internally** using a file-based mechanism (`mcp-servers.json` within the provided storage directory). Does not currently use an external `StorageAdapter`.

3. **`ConnectionManager`**:

   - Establishes and manages connections (`McpConnection`) to registered servers.
   - **Handles server process management** implicitly via the MCP SDK's `StdioClientTransport`.
   - Uses the MCP SDK (`Client`, `StdioClientTransport`) for communication.
   - Monitors connection status and handles lifecycle events (connect, disconnect, error).
   - Exposes connected clients for tool invocation.

4. **`ToolInvoker`**:

   - Provides methods to call tools on specific connected servers.
   - Handles argument formatting and result parsing.
   - Supports streaming responses via callbacks or async iterators.
   - Interacts with `SchemaManager` for validation (optional).

5. **`SchemaManager`**:
   - Retrieves and caches tool schemas (`ToolDefinition`) from connected servers.
   - Provides access to schemas for UI display or validation purposes.

### 2.3 Interfaces and Adapters (Current Implementation Notes)

- **Storage**: Persistence is handled internally by `ServerRegistry` using file storage (`mcp-servers.json`). A pluggable `StorageAdapter` interface is **not currently implemented or used**.
- **Logging**: Logging uses an internal `ConsoleLogger` by default. A `LoggerInterface` exists but is **not currently injectable** via constructor options.

## 3. Key Data Structures and Types

```typescript
// Basic server configuration provided by the consumer
interface McpServerConfig {
  command: string // e.g., 'node', 'python', '/path/to/executable'
  args?: string[] // Arguments for the command
  env?: Record<string, string> // Environment variables for the server process
  workingDir?: string // Optional working directory for the server
  // Potentially add metadata like 'displayName', 'description'
}

// Internal representation of a connection
interface McpConnection {
  serverName: string
  client: Client // MCP SDK Client instance
  transport: StdioClientTransport // MCP SDK Transport
  // process: ChildProcess // Removed: Transport handles process internally
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError?: Error
  config: McpServerConfig // Added config reference
}

// Standardized tool definition
interface ToolDefinition {
  name: string
  description?: string
  inputSchema: any // JSON Schema object
  // outputSchema?: any; // Potentially add later if needed
  memoizable?: boolean // From MCP spec
}

// McpManagerOptions, StorageAdapter, LoggerInterface definitions removed as they are not currently used in the public API

// Structure for tool call results (simplified)
interface ToolCallResult {
  success: boolean
  content?: Array<{ type: string; text?: string; mimeType?: string /* other content types */ }>
  error?: string
  isError?: boolean // From MCP spec
}

// Structure for streaming updates
interface StreamUpdate {
  type: 'text' | 'error' | 'usage' | 'metadata' | 'tool_start' | 'tool_end' // Matches implementation
  content?: any // Matches implementation
  isFinal?: boolean // Matches implementation
  mimeType?: string // Matches implementation
  // Add other relevant fields like usage data, metadata object, etc.
}
```

## 4. API Design (`McpManager`)

```typescript
class McpManager extends EventEmitter {
  // Added EventEmitter base
  constructor(/* storageDir?: string */) // Updated constructor signature

  // Server Management
  async registerServer(name: string, config: McpServerConfig): Promise<void>
  async unregisterServer(name: string): Promise<void>
  async updateServerConfig(name: string, config: McpServerConfig): Promise<void>
  async getServerConfig(name: string): Promise<McpServerConfig | undefined>
  async getAllServers(): Promise<Record<string, McpServerConfig>>

  // Connection Management
  async connectServer(name: string): Promise<void> // Explicit connect
  async disconnectServer(name: string): Promise<void>
  async connectAllServers(): Promise<void> // Connect all registered
  async disconnectAllServers(): Promise<void>
  getConnectionStatus(name: string): McpConnection['status']
  listConnectedServers(): string[]

  // Tool Interaction
  async listTools(serverName: string): Promise<ToolDefinition[]>
  async getToolSchema(serverName: string, toolName: string): Promise<ToolDefinition | undefined>
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    onUpdate?: (update: StreamUpdate) => void // For streaming
  ): Promise<ToolCallResult> // Returns final result after stream (if any)

  // Events (using EventEmitter or similar)
  on(event: 'serverRegistered', listener: (name: string, config: McpServerConfig) => void): this
  on(event: 'serverUnregistered', listener: (name: string) => void): this // Added semicolon
  on(event: 'serverConfigUpdated', listener: (name: string, config: McpServerConfig) => void): this // Added missing event
  on(
    event: 'connectionStatusChanged',
    listener: (name: string, status: McpConnection['status'], error?: Error) => void
  ): this
  // Added tool call events from implementation
  on(
    event: 'toolCallStart',
    listener: (serverName: string, toolName: string, args: Record<string, unknown>) => void
  ): this
  on(
    event: 'toolCallUpdate',
    listener: (serverName: string, toolName: string, update: StreamUpdate) => void
  ): this
  on(
    event: 'toolCallEnd',
    listener: (serverName: string, toolName: string, result: ToolCallResult) => void
  ): this
  // Generic overload
  on(event: McpManagerEvent | string | symbol, listener: (...args: any[]) => void): this

  // Added emit overloads from implementation
  emit(event: 'serverRegistered', name: string, config: McpServerConfig): boolean
  emit(event: 'serverUnregistered', name: string): boolean
  emit(event: 'serverConfigUpdated', name: string, config: McpServerConfig): boolean
  emit(
    event: 'connectionStatusChanged',
    name: string,
    status: McpConnection['status'],
    error?: Error
  ): boolean
  emit(
    event: 'toolCallStart',
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): boolean
  emit(event: 'toolCallUpdate', serverName: string, toolName: string, update: StreamUpdate): boolean
  emit(event: 'toolCallEnd', serverName: string, toolName: string, result: ToolCallResult): boolean
  // Generic overload
  emit(event: McpManagerEvent | string | symbol, ...args: any[]): boolean

  // Lifecycle
  async initialize(autoConnectServers?: boolean): Promise<void> // Added initialize method
  async shutdown(): Promise<void> // Disconnect all and clean up
}
```

## 5. Migration Strategy for Aura

1. **Develop `mcp-manager` Library**: Create the new library as a separate package/project. Implement the core components and APIs defined above. Include basic unit and integration tests.
2. **Integrate into Aura**: Add `mcp-manager` as a dependency to Aura (using `file:` path for development).
3. **Refactor `McpService`**:
   - Instantiate `McpManager` within `McpService` (constructor currently takes no arguments).
   - Call `mcpManager.initialize()` appropriately.
   - Delegate core operations (connect, disconnect, callTool, listTools, register, unregister) from `McpService` methods to the corresponding `McpManager` methods.
   - Remove the duplicated logic (process spawning, connection handling, tool invocation logic) from `McpService`.
   - Keep Aura-specific logic within `McpService`, such as the internal `mcp.registerServer` tool implementation (which now calls the internal `handleRegisterServerTool` method that delegates to `mcpManager.registerServer`) and the logic for providing `ToolServerInfo` for internal tools.
   - Adapt `onUpdate` callback types if necessary when calling `mcpManager.callTool`.
4. **Update UI Interactions**: Modify the MCP server UI components (`src/renderer/src/components/mcp-servers/`) to call the refactored `McpService` methods. Ensure event handling (e.g., for status updates) is correctly wired, potentially listening to events emitted by the `McpManager` instance via `McpService`.
5. **Testing**: Perform thorough integration testing within Aura to ensure the refactored MCP functionality works as expected.

## 6. Implementation Details

- **Dependencies**: `@modelcontextprotocol/sdk`, standard Node.js modules (`child_process`, `path`, `fs`).
- **Error Handling**: Use custom error classes for specific library errors (e.g., `ServerNotFoundError`, `ConnectionError`, `ToolCallError`).
- **Asynchronous Operations**: All I/O operations and potentially long-running tasks should be asynchronous (`async/await`).
- **Process Management**: Carefully handle process exit codes, signals, and potential hangs. Implement robust cleanup logic.
- **Streaming**: For `callTool`, if `onUpdate` is provided, the implementation should handle streaming responses from the MCP server and forward them through the callback. The final `Promise` should resolve with the complete result once the stream ends.

## 7. Future Considerations

- Support for other transport types besides Stdio.
- More sophisticated process monitoring and automatic restart policies.
- Built-in schema validation for tool arguments.
- Support for MCP resources (beyond just tools).
