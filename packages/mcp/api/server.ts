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
  // try {
  //   const templatePath = join(__dirname, "prompt.txt");
  //   console.log(`Attempting to load prompt template from: ${templatePath}`);
  //   const content = readFileSync(templatePath, "utf-8");
  //   console.log(`Prompt template loaded successfully. Length: ${content.length} chars`);
  //   console.log(`First 200 chars of prompt: ${content.substring(0, 200)}...`);
  //   return content;
  // } catch (error) {
  //   console.error("Failed to load prompt template:", error);
  //   const fallback = "Generate code for the {{ENDPOINT}} endpoint in {{LANGUAGE}}.";
  //   console.log(`Using fallback prompt: ${fallback}`);
  //   return fallback;
  // }
  return `You are an expert software engineer generating a CLIENT LIBRARY for the {{ENDPOINT}} endpoint of the Tesser FX API.

CRITICAL INSTRUCTIONS:
- Generate ONLY a client function or class for calling {{ENDPOINT}}
- DO NOT generate any HTTP server code
- DO NOT generate any demo endpoints (/demo, /, /quote, etc.)
- DO NOT generate any server routes or handlers  
- DO NOT generate any Bun.serve() or Express server code
- DO NOT generate any console.log statements about "running on port"
- The code must compile without any TypeScript errors
- Focus ONLY on the client-side API call for {{ENDPOINT}}

TESSER FX API DETAILS:
- Base URL: https://api.tesser.com/v1
- Authentication: Bearer token in Authorization header
- Content-Type: application/json

TARGET ENDPOINT: {{ENDPOINT}}
{{OPENAPI_SPEC}}

SPECIFIC REQUIREMENTS FOR {{ENDPOINT}}:
{{ENDPOINT_SPECIFIC_INFO}}

OUTPUT REQUIREMENTS:
1. Generate a client function or class for {{ENDPOINT}} in {{LANGUAGE}}
2. Include proper TypeScript types (if {{LANGUAGE}} supports them) matching the OpenAPI schemas EXACTLY
3. Handle authentication via Bearer token
4. Support optional Idempotency-Key header
5. Handle all documented HTTP response codes for {{ENDPOINT}}
6. Include proper error handling
7. Validate input parameters according to the schema
8. Return the exact response type from the OpenAPI spec
9. Include a simple usage example of the client function/class
10. Code must be production-ready and compile without errors
11. NO server code, NO demo endpoints, NO HTTP handlers

RESPONSE FORMAT - CLIENT CODE ONLY:
'''{{LANGUAGE_EXTENSION}}
// Client code for {{ENDPOINT}} endpoint only
'''

Generate ONLY the client library code for integrating with {{ENDPOINT}}. Do not include any server implementation.`
};

const getOpenAPISpec = () => {
  // try {
  //   const specPath = join(__dirname, "openapi.json");
  //   console.log(`Attempting to load OpenAPI spec from: ${specPath}`);
  //   const specContent = readFileSync(specPath, "utf-8");
  //   console.log(`OpenAPI spec loaded successfully. Length: ${specContent.length} chars`);
  //   const parsed = JSON.parse(specContent);
  //   console.log(`OpenAPI spec title: ${parsed.info?.title}`);
  //   console.log(`Available paths: ${Object.keys(parsed.paths || {}).join(', ')}`);
  //   return parsed;
  // } catch (error) {
  //   console.error("Failed to load OpenAPI spec:", error);
  //   const fallback = {};
  //   console.log(`Using empty fallback spec`);
  //   return fallback;
  // }
  return {
    "openapi": "3.1.0",
    "info": {
      "title": "Tesser FX Quote & Payment API",
      "version": "1.0.0",
      "description": "Two-call workflow: (1) obtain a locked FX quote, (2) submit a payment that consumes it.\nDesign follows bank-grade patterns: versioned base path, event envelope, idempotency keys, cursor-based pagination, and predictive rate-limit headers."
    },
    "servers": [
      {
        "url": "https://api.tesser.com/v1"
      }
    ],
    "security": [
      {
        "BearerAuth": []
      }
    ],
    "paths": {
      "/quotes": {
        "post": {
          "summary": "Obtain a locked FX quote",
          "description": "Exactly one of `from_amount` or `to_amount` is required.  A `quote_id` inside the response must be supplied to **POST /payments** within `valid_until`.",
          "tags": [
            "Quote"
          ],
          "operationId": "createQuote",
          "parameters": [
            {
              "$ref": "#/components/parameters/IdempotencyKey"
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/QuoteRequest"
                }
              }
            }
          },
          "responses": {
            "201": {
              "$ref": "#/components/responses/EventQuote"
            },
            "400": {
              "$ref": "#/components/responses/Error"
            },
            "401": {
              "$ref": "#/components/responses/AuthError"
            },
            "409": {
              "$ref": "#/components/responses/Conflict"
            },
            "429": {
              "$ref": "#/components/responses/RateLimit"
            }
          }
        }
      },
      "/payments": {
        "post": {
          "summary": "Submit a payment using a quote",
          "tags": [
            "Payment"
          ],
          "operationId": "submitPayment",
          "parameters": [
            {
              "$ref": "#/components/parameters/IdempotencyKey"
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PaymentRequest"
                }
              }
            }
          },
          "responses": {
            "202": {
              "$ref": "#/components/responses/EventPayment"
            },
            "400": {
              "$ref": "#/components/responses/Error"
            },
            "401": {
              "$ref": "#/components/responses/AuthError"
            },
            "409": {
              "$ref": "#/components/responses/Conflict"
            },
            "422": {
              "$ref": "#/components/responses/Unprocessable"
            },
            "429": {
              "$ref": "#/components/responses/RateLimit"
            }
          }
        }
      }
    },
    "components": {
      "securitySchemes": {
        "BearerAuth": {
          "type": "http",
          "scheme": "bearer",
          "bearerFormat": "API_KEY"
        }
      },
      "parameters": {
        "IdempotencyKey": {
          "in": "header",
          "name": "Idempotency-Key",
          "description": "A unique value (max 255 bytes) that makes the request idempotent for 24 h.",
          "required": false,
          "schema": {
            "type": "string",
            "maxLength": 255
          }
        },
        "PageSize": {
          "in": "query",
          "name": "page_size",
          "description": "Max records per page (default 50, max 200).",
          "required": false,
          "schema": {
            "type": "integer",
            "minimum": 1,
            "maximum": 200
          }
        },
        "Cursor": {
          "in": "query",
          "name": "cursor",
          "description": "Opaque pagination cursor returned by previous call.",
          "required": false,
          "schema": {
            "type": "string"
          }
        }
      },
      "schemas": {
        "UnixTime": {
          "type": "integer",
          "example": 1719878400
        },
        "Amount": {
          "type": "string",
          "pattern": "^[0-9]+(\\.[0-9]{1,18})?$",
          "example": "1000.00"
        },
        "QuoteRequest": {
          "type": "object",
          "required": [
            "to_currency"
          ],
          "properties": {
            "client_quote_id": {
              "type": "string"
            },
            "from_currency": {
              "type": "string",
              "example": "USDC"
            },
            "to_currency": {
              "type": "string",
              "example": "EUR"
            },
            "from_amount": {
              "$ref": "#/components/schemas/Amount"
            },
            "to_amount": {
              "$ref": "#/components/schemas/Amount"
            },
            "quote_time": {
              "$ref": "#/components/schemas/UnixTime"
            },
            "rules": {
              "type": "array",
              "items": {
                "type": "object"
              }
            },
            "compliance": {
              "type": "object"
            }
          },
          "oneOf": [
            {
              "required": [
                "from_amount"
              ]
            },
            {
              "required": [
                "to_amount"
              ]
            }
          ]
        },
        "QuoteData": {
          "type": "object",
          "required": [
            "id",
            "valid_until",
            "quotes"
          ],
          "properties": {
            "id": {
              "type": "string",
              "description": "Quote ID"
            },
            "client_quote_id": {
              "type": "string"
            },
            "valid_until": {
              "$ref": "#/components/schemas/UnixTime"
            },
            "quotes": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "id",
                  "rate",
                  "settlement_period_seconds"
                ],
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "rate": {
                    "type": "number",
                    "format": "double"
                  },
                  "settlement_period_seconds": {
                    "type": "integer"
                  }
                }
              }
            }
          }
        },
        "PaymentRequest": {
          "type": "object",
          "required": [
            "quote_id"
          ],
          "properties": {
            "client_payment_id": {
              "type": "string"
            },
            "quote_id": {
              "type": "string"
            }
          }
        },
        "PaymentData": {
          "type": "object",
          "required": [
            "id",
            "change_at",
            "change"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "client_payment_id": {
              "type": "string"
            },
            "change_at": {
              "$ref": "#/components/schemas/UnixTime"
            },
            "change": {
              "type": "string",
              "enum": [
                "payment_created",
                "payment_settled",
                "payment_rejected"
              ]
            },
            "reason": {
              "type": "string"
            }
          }
        },
        "EventEnvelope": {
          "type": "object",
          "required": [
            "id",
            "created_at",
            "type",
            "data"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "created_at": {
              "$ref": "#/components/schemas/UnixTime"
            },
            "type": {
              "type": "string"
            },
            "reason": {
              "type": "string"
            },
            "data": {
              "type": "object"
            }
          }
        },
        "Error": {
          "type": "object",
          "required": [
            "status",
            "error_code",
            "message"
          ],
          "properties": {
            "status": {
              "type": "integer",
              "example": 400
            },
            "error_code": {
              "type": "string",
              "example": "AmountTooSmall"
            },
            "message": {
              "type": "string",
              "example": "Amount is below minimum."
            }
          }
        }
      },
      "responses": {
        "EventQuote": {
          "description": "Quote created",
          "headers": {
            "$ref": "#/components/headers/RateLimit"
          },
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/EventEnvelope"
                  },
                  {
                    "properties": {
                      "type": {
                        "const": "quote.created"
                      },
                      "data": {
                        "$ref": "#/components/schemas/QuoteData"
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        "EventPayment": {
          "description": "Payment event (created / settled / rejected)",
          "headers": {
            "$ref": "#/components/headers/RateLimit"
          },
          "content": {
            "application/json": {
              "schema": {
                "allOf": [
                  {
                    "$ref": "#/components/schemas/EventEnvelope"
                  },
                  {
                    "properties": {
                      "type": {
                        "enum": [
                          "payment.created",
                          "payment.settled",
                          "payment.rejected"
                        ]
                      },
                      "data": {
                        "$ref": "#/components/schemas/PaymentData"
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        "Error": {
          "description": "Validation or business error",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Error"
              }
            }
          }
        },
        "AuthError": {
          "description": "Authentication required / invalid",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Error"
              }
            }
          }
        },
        "Conflict": {
          "description": "Resource conflict (e.g., quote already used)",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Error"
              }
            }
          }
        },
        "Unprocessable": {
          "description": "Semantic validation failed (e.g., BalanceInsufficient)",
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Error"
              }
            }
          }
        },
        "RateLimit": {
          "description": "Too many requests",
          "headers": {
            "$ref": "#/components/headers/RetryAfter"
          },
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Error"
              }
            }
          }
        }
      },
      "headers": {
        "RateLimit": {
          "X-RateLimit-Limit": {
            "description": "Total request quota per time-window.",
            "schema": {
              "type": "integer"
            }
          },
          "X-RateLimit-Remaining": {
            "description": "Remaining calls in the current window.",
            "schema": {
              "type": "integer"
            }
          }
        },
        "RetryAfter": {
          "Retry-After": {
            "description": "Seconds until the client may retry.",
            "schema": {
              "type": "integer"
            }
          }
        }
      }
    }
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

  console.log(`Generating code for endpoint: ${endpoint}, language: ${language}`);
  console.log(`Template placeholders found: ENDPOINT=${template.includes('{{ENDPOINT}}')}, LANGUAGE=${template.includes('{{LANGUAGE}}')}, OPENAPI_SPEC=${template.includes('{{OPENAPI_SPEC}}')}`)

  // Get specific endpoint details from OpenAPI spec
  const endpointDetails = getEndpointDetails(openApiSpec, endpoint);

  // Get the specific path data for this endpoint
  const endpointPath = openApiSpec.paths?.[endpoint as keyof typeof openApiSpec.paths];

  if (!endpointPath) {
    throw new Error(`Endpoint ${endpoint} not found in OpenAPI specification`);
  }

  // Create a minimal spec containing only what's needed for this endpoint
  const relevantSpec = {
    info: {
      title: openApiSpec.info?.title,
      version: openApiSpec.info?.version
    },
    servers: openApiSpec.servers,
    paths: {
      [endpoint]: endpointPath
    },
    components: {
      // Only include the essential schemas for this endpoint
      schemas: {
        // Include only the core schemas needed for the endpoint
        ...(endpoint === '/quotes' ? {
          QuoteRequest: openApiSpec.components?.schemas?.QuoteRequest,
          QuoteData: openApiSpec.components?.schemas?.QuoteData,
          EventEnvelope: openApiSpec.components?.schemas?.EventEnvelope,
          Error: openApiSpec.components?.schemas?.Error,
          Amount: openApiSpec.components?.schemas?.Amount,
          UnixTime: openApiSpec.components?.schemas?.UnixTime
        } : {}),
        ...(endpoint === '/payments' ? {
          PaymentRequest: openApiSpec.components?.schemas?.PaymentRequest,
          PaymentData: openApiSpec.components?.schemas?.PaymentData,
          EventEnvelope: openApiSpec.components?.schemas?.EventEnvelope,
          Error: openApiSpec.components?.schemas?.Error,
          UnixTime: openApiSpec.components?.schemas?.UnixTime
        } : {})
      },
      securitySchemes: {
        BearerAuth: openApiSpec.components?.securitySchemes?.BearerAuth
      },
      parameters: {
        IdempotencyKey: openApiSpec.components?.parameters?.IdempotencyKey
      }
    }
  };

  console.log(`Relevant spec paths: ${Object.keys(relevantSpec.paths || {}).join(', ')}`);

  const prompt = template
    .replace(/\{\{ENDPOINT\}\}/g, endpoint)
    .replace(/\{\{LANGUAGE\}\}/g, config.name)
    .replace(/\{\{LANGUAGE_EXTENSION\}\}/g, config.extension)
    .replace(/\{\{OPENAPI_SPEC\}\}/g, JSON.stringify(relevantSpec, null, 2))
    .replace(/\{\{ENDPOINT_SPECIFIC_INFO\}\}/g, endpointInfo);

  console.log(`Final prompt length: ${prompt.length} chars`);
  console.log(`First 500 chars of final prompt: ${prompt.substring(0, 500)}...`);

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
      const generatedText = (content as any).text;
      console.log(`Generated code length: ${generatedText.length} chars`);
      console.log(`Generated code preview: ${generatedText.substring(0, 200)}...`);
      return generatedText;
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
