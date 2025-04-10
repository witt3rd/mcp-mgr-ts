import { McpManager, ToolDefinition, McpServerConfig } from 'mcp-mgr'; // Import necessary types

async function main() {
    console.log('Initializing MCP Manager...');
    // Constructor takes no arguments based on the provided source
    const manager = new McpManager();

    try {
        // Initialize loads server configs and optionally auto-connects
        await manager.initialize(); // Loads existing configs from ./mcp-manager/servers.json
        console.log('MCP Manager Initialized.');

        // --- Demonstrate Programmatic Registration ---
        const memoryServerName = 'example-memory-server'; // Unique name for the server
        const memoryServerConfig: McpServerConfig = {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
            displayName: 'Example Memory Server (Programmatic)',
            autoConnect: true // Let manager auto-connect after registration or on next init
        };

        try {
            console.log(`\nRegistering server "${memoryServerName}" programmatically...`);
            // This will add/update the server in ./mcp-manager/servers.json
            await manager.registerServer(memoryServerName, memoryServerConfig);
            console.log(`Server "${memoryServerName}" registered.`);
            // Note: If autoConnect is true, McpManager attempts connection automatically here.
            // If not, you might need: await manager.connectServer(memoryServerName);
        } catch (registerError) {
            console.error(`Failed to register server "${memoryServerName}":`, registerError);
            // Decide if we should continue if registration fails
        }
        // --- End Demonstration ---


        // Allow some time for potential auto-connection
        await new Promise(resolve => setTimeout(resolve, 1000));


        // listConnectedServers returns an array of server names (strings)
        const connectedServerNames = manager.listConnectedServers();
        console.log(`\nFound ${connectedServerNames.length} connected MCP server(s):`);

        // Iterate over server names and fetch details/tools
        for (const serverName of connectedServerNames) {
            // Fetch server config if needed (optional for this example)
            // const config = await manager.getServerConfig(serverName);
            // console.log(`- ${config?.name || serverName} (${serverName})`); // Display name from config or use serverName
            console.log(`- ${serverName}`); // Just log the server name/ID

            // List tools for the server
            const tools: ToolDefinition[] = await manager.listTools(serverName);
            if (tools.length > 0) {
                console.log('  Tools:');
                tools.forEach((tool: ToolDefinition) => console.log(`    - ${tool.name}: ${tool.description}`));
            }
            // Resource/Template listing is not directly supported by the manager API shown
            // Resource/Template listing is not directly supported by the manager API shown
        }


        // --- Demonstrate Tool Call on Registered Server ---
        // Check if our programmatically registered memory server is connected
        if (connectedServerNames.includes(memoryServerName)) {
            console.log(`\nAttempting to use tools on "${memoryServerName}"...`);
            try {
                const entityName = 'ExampleCliEntity';
                const entityObservation = `Created by example-cli at ${new Date().toISOString()}`;

                // 1. Call 'create_entities' tool
                console.log(`Calling 'create_entities' tool for entity: "${entityName}"`);
                const createResult = await manager.callTool(memoryServerName, 'create_entities', {
                    entities: [
                        { name: entityName, observations: [entityObservation] }
                    ]
                });
                console.log("'create_entities' tool result:", JSON.stringify(createResult, null, 2));

                // Wait a tiny bit (optional, likely not needed for memory server)
                await new Promise(resolve => setTimeout(resolve, 100));

                // 2. Call 'read_graph' tool
                console.log(`Calling 'read_graph' tool to see the graph contents`);
                const readResult = await manager.callTool(memoryServerName, 'read_graph', {}); // No arguments needed
                console.log("'read_graph' tool result:", JSON.stringify(readResult, null, 2));

                // Optional: Add verification logic here if needed, e.g., check if the entity exists in the readResult

            } catch (toolError) {
                console.error(`Error calling tools on "${memoryServerName}":`, toolError);
            }
        } else {
            console.log(`\nServer "${memoryServerName}" not found or not connected. Cannot demonstrate tool calls.`);
        }
        // --- End Demonstration ---


    } catch (error) {
        console.error('Error during MCP Manager operation:', error);
    } finally {
        console.log('\nShutting down MCP Manager...');
        await manager.shutdown();
        console.log('MCP Manager Shutdown.');
    }
}

main().catch(error => {
    console.error('Unhandled error in main function:', error);
    process.exit(1);
});
