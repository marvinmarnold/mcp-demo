import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Language configuration
const LANGUAGE_CONFIG = {
  typescript: { extension: "ts", name: "TypeScript" },
  javascript: { extension: "js", name: "JavaScript" },
  python: { extension: "py", name: "Python" },
  go: { extension: "go", name: "Go" },
  rust: { extension: "rs", name: "Rust" },
  cpp: { extension: "cpp", name: "C++" },
} as const;

type SupportedLanguage = keyof typeof LANGUAGE_CONFIG;

// Load the prompt template
const getPromptTemplate = () => {
  try {
    // Use a direct relative path from the api directory
    return readFileSync(join(__dirname, "prompt.txt"), "utf-8");
  } catch (error) {
    console.error("Failed to load prompt template:", error);
    return "Generate code for the {{ENDPOINT}} endpoint in {{LANGUAGE}}.";
  }
};

const generateCode = async (endpoint: string, language: SupportedLanguage, endpointInfo: string) => {
  const template = getPromptTemplate();
  const config = LANGUAGE_CONFIG[language];

  const prompt = template
    .replace(/\{\{ENDPOINT\}\}/g, endpoint)
    .replace(/\{\{LANGUAGE\}\}/g, config.name)
    .replace(/\{\{LANGUAGE_EXTENSION\}\}/g, config.extension)
    .replace(/\{\{ENDPOINT_SPECIFIC_INFO\}\}/g, endpointInfo);

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Properly handle the response content with type guards
    if (!response.content || response.content.length === 0) {
      throw new Error("No content in response from Claude");
    }

    const content = response.content[0];
    if (!content) {
      throw new Error("Empty content block in response");
    }

    if (content.type === "text") {
      return (content as any).text; // Type assertion as fallback
    }

    throw new Error("Unexpected response format from Claude");
  } catch (error) {
    console.error("Error generating code:", error);
    throw new Error(`Failed to generate code: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};

const handler = createMcpHandler((server) => {
  // Original echo tool
  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }],
  }));

  // Get Quote Code Generation Tool
  server.tool(
    "getQuoteCode",
    {
      language: z.enum(["typescript", "javascript", "python", "go", "rust", "cpp"]),
      includeTypes: z.boolean().optional().default(true),
    },
    async ({ language, includeTypes }) => {
      const endpointInfo = `
ENDPOINT DETAILS - /quotes:
- Purpose: Obtain a locked FX quote for currency exchange
- Required fields: to_currency
- Either from_amount OR to_amount is required (not both)
- Optional: client_quote_id, from_currency, quote_time, rules, compliance
- Response: Returns a quote_id that must be used in payment submission
- Quote has expiration time (valid_until) - typically short-lived
- Example request: {"to_currency": "EUR", "from_amount": "1000.00", "from_currency": "USDC"}
- Example response includes: quote_id, valid_until, exchange rates array
- Headers: Optional Idempotency-Key for request deduplication
- Authentication: Bearer token required

ERROR HANDLING:
- 400: Validation errors (e.g., invalid amounts)
- 401: Authentication failed
- 409: Conflict (e.g., idempotency key reused)
- 429: Rate limit exceeded

Key integration considerations:
1. Handle quote expiration properly
2. Store quote_id for payment submission
3. Implement proper error handling for network issues
4. Consider retry logic for transient failures
${includeTypes ? "5. Include full type definitions for request/response objects" : ""}`;

      try {
        const generatedCode = await generateCode("/quotes", language, endpointInfo);

        return {
          content: [
            {
              type: "text",
              text: `# Tesser FX Quote Integration Code (${LANGUAGE_CONFIG[language].name})

${generatedCode}

## Usage Notes:
- Replace 'your-api-key-here' with your actual Tesser API key
- The quote_id from the response must be used within the valid_until timeframe
- Store the quote_id securely for the subsequent payment call
- Implement proper error handling for production use
- Consider implementing retry logic for 429 (rate limit) errors`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating code: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Send Payment Code Generation Tool
  server.tool(
    "sendPaymentCode",
    {
      language: z.enum(["typescript", "javascript", "python", "go", "rust", "cpp"]),
      includeTypes: z.boolean().optional().default(true),
    },
    async ({ language, includeTypes }) => {
      const endpointInfo = `
ENDPOINT DETAILS - /payments:
- Purpose: Submit a payment using a previously obtained quote
- Required fields: quote_id (from previous /quotes call)
- Optional: client_payment_id for tracking
- Response: Returns payment status with change events
- Payment goes through states: created → settled/rejected
- Headers: Optional Idempotency-Key for request deduplication
- Authentication: Bearer token required

PAYMENT LIFECYCLE:
1. payment.created - Payment initiated
2. payment.settled - Payment completed successfully
3. payment.rejected - Payment failed (with reason)

ERROR HANDLING:
- 400: Validation errors (e.g., malformed quote_id)
- 401: Authentication failed
- 409: Conflict (e.g., quote already used)
- 422: Business logic errors (e.g., insufficient balance, expired quote)
- 429: Rate limit exceeded

Key integration considerations:
1. Must use valid, unexpired quote_id from /quotes
2. Handle asynchronous payment processing
3. Monitor payment status changes
4. Implement webhook handling for status updates (if available)
5. Handle various rejection reasons gracefully
${includeTypes ? "6. Include full type definitions for request/response objects" : ""}`;

      try {
        const generatedCode = await generateCode("/payments", language, endpointInfo);

        return {
          content: [
            {
              type: "text",
              text: `# Tesser FX Payment Integration Code (${LANGUAGE_CONFIG[language].name})

${generatedCode}

## Usage Notes:
- Replace 'your-api-key-here' with your actual Tesser API key
- The quote_id must be from a recent, valid /quotes response
- Payment processing is asynchronous - monitor the response status
- Implement proper error handling for all payment states
- Consider implementing webhook handlers for status updates
- Handle 422 errors gracefully (business logic failures)`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating code: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
});

export { handler as GET, handler as POST, handler as DELETE };
