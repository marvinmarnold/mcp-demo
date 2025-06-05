import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const origin = process.argv[2] || "https://tesser-mcp.vercel.app";

async function main() {
  const transport = new SSEClientTransport(new URL(`${origin}/sse`));

  const client = new Client(
    {
      name: "example-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  await client.connect(transport);

  console.log("Connected", client.getServerCapabilities());

  const tools = await client.listTools();
  console.log("Available tools:", tools.tools.map(t => t.name));

  // Invoke the getQuoteCode tool with the specified arguments
  console.log("\n--- Invoking getQuoteCode tool ---");
  try {
    const result = await client.callTool({
      name: "getQuoteCode",
      arguments: {
        language: "typescript",
        includeTypes: true
      }
    });

    console.log("Tool result:", result);
    if (result.content && result.content.length > 0) {
      console.log("\n--- Generated Code ---");
      console.log(result.content[0].text);
    }
  } catch (error) {
    console.error("Error calling getQuoteCode tool:", error);
  }
}

main();
