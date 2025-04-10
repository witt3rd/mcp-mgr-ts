# MCP Manager Example CLI

This is a basic command-line tool demonstrating how to use the `mcp-manager` library to interact with connected MCP servers.

## Setup

1. **Install Dependencies:**
   If you haven't already, navigate to this directory and install dependencies:

   ```bash
   npm install
   ```

   _(Note: This assumes `mcp-manager` is located in the parent directory (`../`). If not, adjust the dependency path in `package.json` and reinstall.)_

## Build

2. **Compile TypeScript:**
   Compile the TypeScript code to JavaScript:

   ```bash
   npm run build
   ```

   This will create a `dist` directory with the compiled `index.js` file.

## Run

3. **Execute the Example CLI:**
   Run the compiled client code from the `example-cli` directory:

   ```bash
   npm start
   ```

   This script demonstrates the core workflow of using `mcp-manager`, including programmatic registration:

   - **Initialize `McpManager`**: Loads any existing server configurations from the default storage file (`./.mcp-manager/servers.json`).
   - **Register Server Programmatically**: Calls `manager.registerServer()` to ensure the `@modelcontextprotocol/server-memory` server (named `example-memory-server` internally) is configured. This tells `mcp-manager` _how_ to run this server (using `npx`) and saves/updates the configuration in `./.mcp-manager/servers.json`.
   - **Auto-Connect**: Because the registered configuration includes `autoConnect: true`, `mcp-manager` automatically attempts to connect to `example-memory-server`. This triggers `mcp-manager` to **launch the server process** (running `npx -y @modelcontextprotocol/server-memory`) in the background.
   - **List Connected Servers**: Shows which servers are connected (should include `example-memory-server`).
   - **List Tools**: Lists the tools for connected servers (e.g., `create_entities`, `read_graph`, etc. for the memory server).
   - **Call Tools**: Demonstrates calling the `create_entities` tool on `example-memory-server` to create a new entity, and then the `read_graph` tool to view the graph's contents.
   - **Print Results**: Outputs the results of the tool calls.
   - **Shutdown**: Disconnects from all servers (terminating their processes) and shuts down the manager.

## Sample Output

Running `npm start` will produce output similar to this (timestamps and some verbose logs may vary):

```text
Initializing MCP Manager...
MCP Manager Initialized.

Registering server "example-memory-server" programmatically...
Knowledge Graph MCP Server running on stdio
Server "example-memory-server" registered.

Found 1 connected MCP server(s):
- example-memory-server
  Tools:
    - create_entities: Create multiple new entities in the knowledge graph
    - create_relations: Create multiple new relations between entities in the knowledge graph. Relations should be in active voice
    - add_observations: Add new observations to existing entities in the knowledge graph
    - delete_entities: Delete multiple entities and their associated relations from the knowledge graph
    - delete_observations: Delete specific observations from entities in the knowledge graph
    - delete_relations: Delete multiple relations from the knowledge graph
    - read_graph: Read the entire knowledge graph
    - search_nodes: Search for nodes in the knowledge graph based on a query
    - open_nodes: Open specific nodes in the knowledge graph by their names

Attempting to use tools on "example-memory-server"...
Calling 'create_entities' tool for entity: "ExampleCliEntity"
'create_entities' tool result: {
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "[\\n  {\\n    \"name\": \"ExampleCliEntity\",\\n    \"observations\": [\\n      \"Created by example-cli at <timestamp>\"\\n    ]\\n  }\\n]"
    }
  ]
}
Calling 'read_graph' tool to see the graph contents
'read_graph' tool result: {
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "{\\n  \"entities\": [\\n    {\\n      \"type\": \"entity\",\\n      \"name\": \"ExampleCliEntity\",\\n      \"observations\": [\\n        \"Created by example-cli at <timestamp>\"\\n      ]\\n    }\\n  ],\\n  \"relations\": []\\n}"
    }
  ]
}

Shutting down MCP Manager...
MCP Manager Shutdown.
```

## Configuration

This example showcases `mcp-manager`'s ability to handle server registration programmatically:

- The `example-cli/src/index.ts` script itself defines the configuration for the `@modelcontextprotocol/server-memory` server.
- It calls `manager.registerServer()` to ensure this configuration is known to `mcp-manager` and persisted to the default storage file (`./.mcp-manager/servers.json`).
- Therefore, the user running `npm start` **does not need to manually edit** any configuration files beforehand for the example memory server to work. The script handles the registration.
- `mcp-manager` then uses this registered configuration to automatically launch the server process when a connection is needed (due to `autoConnect: true` in this case).
