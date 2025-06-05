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

// Load the prompt template and OpenAPI spec
const getPromptTemplate = () => {
  try {
    return readFileSync(join(__dirname, "prompt.txt"), "utf-8");
  } catch (error) {
    console.error("Failed to load prompt template:", error);
    return "Generate code for the {{ENDPOINT}} endpoint in {{LANGUAGE}}.";
  }
};

const getOpenAPISpec = () => {
  try {
    const specContent = readFileSync(join(__dirname, "openapi.json"), "utf-8");
    return JSON.parse(specContent);
  } catch (error) {
    console.error("Failed to load OpenAPI spec:", error);
    return {};
  }
};

// Extract relevant OpenAPI details for an endpoint
const getEndpointDetails = (spec: any, endpoint: string) => {
  const path = spec.paths?.[endpoint];
  if (!path) return "Endpoint not found in specification";

  const method = path.post || path.get || path.put || path.delete;
  if (!method) return "No supported HTTP method found for endpoint";

  const requestSchema = method.requestBody?.content?.["application/json"]?.schema;
  const responses = method.responses;
  const parameters = method.parameters || [];

  return {
    summary: method.summary || "",
    description: method.description || "",
    operationId: method.operationId || "",
    requestSchema,
    responses,
    parameters,
    tags: method.tags || []
  };
};

const generateCode = async (endpoint: string, language: SupportedLanguage, endpointInfo: string) => {
  const template = getPromptTemplate();
  const config = LANGUAGE_CONFIG[language];
  const openApiSpec = getOpenAPISpec();

  // Get specific endpoint details from OpenAPI spec
  const endpointDetails = getEndpointDetails(openApiSpec, endpoint);

  // Format the OpenAPI spec for inclusion in prompt
  const relevantSpec = {
    info: openApiSpec.info,
    servers: openApiSpec.servers,
    security: openApiSpec.security,
    paths: {
      [endpoint]: openApiSpec.paths?.[endpoint]
    },
    components: {
      schemas: openApiSpec.components?.schemas,
      parameters: openApiSpec.components?.parameters,
      responses: openApiSpec.components?.responses,
      securitySchemes: openApiSpec.components?.securitySchemes
    }
  };

  const prompt = template
    .replace(/\{\{ENDPOINT\}\}/g, endpoint)
    .replace(/\{\{LANGUAGE\}\}/g, config.name)
    .replace(/\{\{LANGUAGE_EXTENSION\}\}/g, config.extension)
    .replace(/\{\{OPENAPI_SPEC\}\}/g, JSON.stringify(relevantSpec, null, 2))
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

    if (!response.content || response.content.length === 0) {
      throw new Error("No content in response from Claude");
    }

    const content = response.content[0];
    if (!content) {
      throw new Error("Empty content block in response");
    }

    if (content.type === "text") {
      return (content as any).text;
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
TESSER FX /quotes ENDPOINT:
This endpoint creates a locked FX quote that can be used for currency exchange.

KEY REQUIREMENTS FROM OPENAPI SPEC:
- POST to /quotes
- Required: to_currency field
- Either from_amount OR to_amount is required (mutually exclusive)
- Optional fields: client_quote_id, from_currency, quote_time, rules, compliance
- Returns EventEnvelope with type "quote.created" and QuoteData in data field
- Quote includes: id, valid_until (unix timestamp), quotes array with rates
- Amount format must match: ^[0-9]+(\.[0-9]{1,18})?$

AUTHENTICATION & HEADERS:
- Bearer token authentication required
- Optional Idempotency-Key header (max 255 bytes)
- Content-Type: application/json

ERROR RESPONSES:
- 400: Validation errors (bad request format)
- 401: Authentication failed
- 409: Conflict (idempotency key reused)
- 429: Rate limit exceeded (with Retry-After header)

INTEGRATION NOTES:
- Store the quote.id for subsequent payment submission
- Monitor valid_until timestamp for quote expiration
- Handle rate limiting with exponential backoff
${includeTypes ? "- Include full TypeScript interfaces matching OpenAPI schemas" : ""}`;

      try {
        const generatedCode = await generateCode("/quotes", language, endpointInfo);

        return {
          content: [
            {
              type: "text",
              text: `# Tesser FX Quote Integration (${LANGUAGE_CONFIG[language].name})

${generatedCode}

## Integration Notes:
- This code follows the official Tesser FX OpenAPI specification
- Replace 'your-api-key-here' with your actual Tesser API key
- The quote_id from the response must be used for payment submission
- Quotes have limited validity - check valid_until timestamp
- Implement proper retry logic for 429 (rate limit) responses`,
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
TESSER FX /payments ENDPOINT:
This endpoint submits a payment using a previously obtained quote.

KEY REQUIREMENTS FROM OPENAPI SPEC:
- POST to /payments
- Required: quote_id (from previous /quotes response)
- Optional: client_payment_id for tracking
- Returns EventEnvelope with payment event type and PaymentData
- Event types: payment.created, payment.settled, payment.rejected

AUTHENTICATION & HEADERS:
- Bearer token authentication required
- Optional Idempotency-Key header (max 255 bytes)
- Content-Type: application/json

ERROR RESPONSES:
- 400: Validation errors (malformed request)
- 401: Authentication failed
- 409: Conflict (quote already used, idempotency key reused)
- 422: Business logic errors (insufficient balance, expired quote)
- 429: Rate limit exceeded (with Retry-After header)

PAYMENT LIFECYCLE:
1. payment.created - Payment initiated successfully
2. payment.settled - Payment completed successfully  
3. payment.rejected - Payment failed (check reason field)

INTEGRATION NOTES:
- Must use valid, unexpired quote_id from /quotes endpoint
- Payment processing is asynchronous
- Monitor change field for payment state transitions
- Handle rejection reasons appropriately
${includeTypes ? "- Include full TypeScript interfaces matching OpenAPI schemas" : ""}`;

      try {
        const generatedCode = await generateCode("/payments", language, endpointInfo);

        return {
          content: [
            {
              type: "text",
              text: `# Tesser FX Payment Integration (${LANGUAGE_CONFIG[language].name})

${generatedCode}

## Integration Notes:
- This code follows the official Tesser FX OpenAPI specification
- Replace 'your-api-key-here' with your actual Tesser API key
- The quote_id must be from a recent, valid /quotes response
- Payment processing is asynchronous - monitor status changes
- Implement proper error handling for all payment states
- Handle 422 errors (business logic failures) gracefully`,
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
