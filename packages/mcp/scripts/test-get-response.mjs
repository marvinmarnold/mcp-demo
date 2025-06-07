import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const origin = process.argv[2] || "https://tesser-mcp.vercel.app";
const toolType = process.argv[3];

async function main() {
  // Validate the tool type parameter
  if (!toolType || !["getQuoteCode", "sendPaymentCode"].includes(toolType)) {
    console.error("Usage: node test-get-response.mjs [origin] <getQuoteCode|getPaymentCode>");
    console.error("Example: node test-get-response.mjs https://tesser-mcp.vercel.app getQuoteCode");
    process.exit(1);
  }

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

  // Invoke the specified tool
  console.log(`\n--- Invoking ${toolType} tool ---`);
  try {
    const result = await client.callTool({
      name: toolType,
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
    console.error(`Error calling ${toolType} tool:`, error);
  }
}

main();
