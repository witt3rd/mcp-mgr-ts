# MCP Manager

A standalone TypeScript library for discovering, configuring, connecting to, and interacting with Model Context Protocol (MCP) servers.

## Introduction

This library extracts the core MCP server management functionality into a reusable package. It provides a generalized solution for applications needing to interact with MCP servers, aiming for decoupling, reusability, maintainability, extensibility, and testability.

Originally designed for the Aura application, it can be used in other TypeScript projects requiring MCP capabilities.

## Features

- **Server Registration**: Manage a list of configured MCP servers and their settings (command, arguments, environment variables).
- **Persistence**: Automatically saves server configurations to a local file (`mcp-servers.json`).
- **Process Management**: Spawns, monitors, and terminates MCP server child processes.
- **Connection Management**: Establishes and maintains connections to servers using the `@modelcontextprotocol/sdk`.
- **Tool Discovery**: Lists available tools exposed by connected servers.
- **Schema Management**: Retrieves and caches tool schemas (`ToolDefinition`).
- **Tool Invocation**: Calls tools on connected servers, handling arguments, results, and streaming updates.
- **Event-Driven**: Emits events for server registration, connection status changes, and tool calls.

## Architecture Overview

The library centers around the `McpManager` class, which acts as the main entry point and facade. It coordinates several internal components:

- **`ServerRegistry`**: Manages the list of server configurations and handles persistence.
- **`ConnectionManager`**: Manages connections to servers, including process lifecycle via the MCP SDK's `StdioClientTransport`.
- **`ToolInvoker`**: Handles the logic for calling tools on connected servers.
- **`SchemaManager`**: Retrieves and caches tool schemas.

Communication with server processes occurs via standard I/O using the `@modelcontextprotocol/sdk`.

_(For a more detailed architecture diagram and component descriptions, see [DESIGN.md](DESIGN.md))._

## Installation

```bash
npm install mcp-manager # Or yarn add mcp-manager
# Note: Replace 'mcp-manager' with the actual package name if published,
# or use a local path during development:
# npm install file:path/to/mcp-manager

# Note for Local Development: If you are developing mcp-manager locally
# and want to test it in another local project, use npm link:
# 1. In the mcp-manager directory: `npm link`
# 2. In your other project's directory: `npm link mcp-manager`
```

Ensure you also have `@modelcontextprotocol/sdk` installed as it's a dependency.

```bash
npm install @modelcontextprotocol/sdk
```

## Usage

```typescript
import { McpManager, McpServerConfig, ToolDefinition } from "mcp-manager"; // Adjust import path if needed

async function main() {
  // Instantiate the manager (constructor takes no arguments in current version)
  const manager = new McpManager();

  // Listen for events (optional)
  manager.on("connectionStatusChanged", (serverName, status, error) => {
    console.log(`Server ${serverName} status: ${status}`, error || "");
  });

  manager.on("toolCallUpdate", (serverName, toolName, update) => {
    console.log(`Tool update from ${serverName}/${toolName}:`, update);
  });

  // Initialize the manager (loads persisted servers)
  await manager.initialize();

  // Define a server configuration
  const myServerConfig: McpServerConfig = {
    command: "node",
    args: ["/path/to/your/mcp/server/index.js"],
    // env: { API_KEY: '...' } // Optional environment variables
  };

  // Register the server (if not already persisted)
  try {
    await manager.registerServer("my-cool-server", myServerConfig);
    console.log("Server registered.");
  } catch (error) {
    console.error("Failed to register server:", error);
    // Handle potential errors (e.g., server already exists)
  }

  // Connect to the server (or use connectAllServers)
  try {
    await manager.connectServer("my-cool-server");
    console.log("Attempted to connect to server.");
  } catch (error) {
    console.error("Failed to connect:", error);
  }

  // Wait a moment for connection to establish (in a real app, rely on status events)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check connection status for the specific server
  if (manager.getConnectionStatus("my-cool-server") === "connected") {
    console.log("Server connected successfully.");

    // List tools
    try {
      const tools: ToolDefinition[] = await manager.listTools("my-cool-server"); // Use listTools
      console.log("Available tools:", tools);

      // Call a tool (replace 'exampleTool' and args with actual values)
      if (tools.some((t: ToolDefinition) => t.name === "exampleTool")) {
        // Add type annotation
        const result = await manager.callTool(
          "my-cool-server",
          "exampleTool",
          { parameter1: "value1" },
          (update) => {
            /* Handle streaming updates */
          }
        );
        console.log("Tool call result:", result);
      } else {
        console.log("Tool 'exampleTool' not found.");
      }
    } catch (error) {
      console.error("Error interacting with tool:", error);
    }
  } else {
    console.log("Server did not connect.");
  }

  // Shutdown (disconnects all servers)
  await manager.shutdown();
  console.log("Manager shut down.");
}

main().catch(console.error);
```

## Example Project

A runnable example command-line tool demonstrating the library's usage can be found in the `example-cli` directory within this repository. See `example-cli/README.md` for instructions.

## API Overview

The primary interface is the `McpManager` class. Key methods include:

- **Server Management**: `registerServer`, `unregisterServer`, `updateServerConfig`, `getServerConfig`, `getAllServers`
- **Connection Management**: `connectServer`, `disconnectServer`, `connectAllServers`, `disconnectAllServers`, `getConnectionStatus`, `listConnectedServers`
- **Tool Interaction**: `listTools`, `getToolSchema`, `callTool`
- **Lifecycle**: `initialize`, `shutdown`

_(For the full API details, including method signatures and event types, please refer to [DESIGN.md](DESIGN.md))._

## Events

`McpManager` extends `EventEmitter` and emits various events:

- `serverRegistered`
- `serverUnregistered`
- `serverConfigUpdated`
- `connectionStatusChanged`
- `toolCallStart`
- `toolCallUpdate`
- `toolCallEnd`

Listen to these events to react to changes in server status or tool execution.

## Future Considerations

- Support for other transport types (e.g., WebSockets).
- Advanced process monitoring and restart policies.
- Built-in schema validation for tool arguments.
- Support for MCP resources.

## Contributing

Contributions are welcome! Please follow standard practices (fork, branch, pull request). (Further details TBD).

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
