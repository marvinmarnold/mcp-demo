# Run a MCP server to generate Tesser API code

## Quickstart

Install dependencies
- `cd packages/mcp`
- `cp .env.example .env` and fill in env variables
- `bun install`

Start MCP server
- From project root
- Run `vercel dev` for local development

Generate response
```sh
cd packages/mcp
bun scripts/test-get-response.mjs http://localhost:3000 sendPaymentCode
```
