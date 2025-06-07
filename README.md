# Tesser API MCP Integration

## Quickstart
1. Copy `.cursor/mcp.json` into the root of your Cursor project.
2. Send a prompt to the agent like: `Complete the code for getting a quote. Do not generate any server code, just use the client code returned by the MCP server. Assume the API is running at @https://api.tesser.com/v1`.

## Notes
- This project uses bun workspaces unnecessarily. Originally, additional packages were imagined. All the MCP lives in `packages/mcp`.
- Copied OpenAPI spec and prompt directly into `packages/mcp/server.ts` because was having filepath issues when reading from separate files.
- Only tested with Typescript, but MCP server is capable of generating code in other languages.
- If you use the MCP server from Cursor, your prompt my influence the generated code. In order to get a pure response from the MCP server, follow the instructions in `packages/mcp/README.md` to invoke MCP directly.
- Flaky MCP SSE connections when deployed to Vercel. 