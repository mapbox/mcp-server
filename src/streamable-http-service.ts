import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express, { Request, Response } from 'express';
import { getAllTools } from './tools/toolRegistry.js';
import { patchGlobalFetch } from './utils/requestUtils.js';
import { getVersionInfo } from './utils/versionUtils.js';

const app = express();

// OAuth Configuration
const OAUTH_SERVER_URL = process.env.OAUTH_SERVER_URL || '';
const OAUTH_CONFIG = {
  issuer: OAUTH_SERVER_URL,
  authorization_endpoint: `${OAUTH_SERVER_URL}/oauth/authorize`,
  token_endpoint: `${OAUTH_SERVER_URL}/oauth/access_token`,
  registration_endpoint:
    process.env.OAUTH_REGISTRATION_ENDPOINT ||
    `${OAUTH_SERVER_URL}/oauth/register`,
  jwks_uri: `${OAUTH_SERVER_URL}/oauth/jwks`,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256']
};

// Configure CORS
// WARNING: This configuration allows all origins for development purposes.
// In production, replace 'origin: true' with an array of allowed origins.
const corsOptions: cors.CorsOptions = {
  origin: true, // TODO: Restrict to specific origins in production
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'mcp-session-id',
    'mcp-protocol-version'
  ],
  exposedHeaders: ['WWW-Authenticate']
};

app.use(cors(corsOptions));
app.use(express.json());

// Add specific CORS headers for .well-known endpoints
app.use('/.well-known', (_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, mcp-protocol-version'
  );
  next();
});

const serverVersionInfo = getVersionInfo();
patchGlobalFetch(serverVersionInfo);

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: serverVersionInfo.name,
      version: serverVersionInfo.version
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  // Register all tools from the registry
  getAllTools().forEach((tool) => {
    tool.installTo(server);
  });

  return server;
}

app.post('/mcp', async (req: Request, res: Response) => {
  // Check for authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // MCP OAuth 2.1 compliant authentication response
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // WWW-Authenticate header points to the protected resource metadata endpoint
    res.setHeader(
      'WWW-Authenticate',
      `Bearer realm="MCP Server", ` +
        `resource="${baseUrl}/mcp", ` +
        `as_uri="${baseUrl}/.well-known/oauth-protected-resource/mcp"`
    );

    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Authentication required',
        data: {
          // OAuth 2.0 Protected Resource Metadata
          authorization_servers: [
            {
              ...OAUTH_CONFIG
            }
          ],
          resource: baseUrl + '/mcp',
          auth_hint: 'Please complete OAuth flow to access this MCP server'
        }
      },
      id: req.body?.id || null
    });
    return;
  }

  // Extract the Bearer token
  const accessToken = authHeader.split(' ')[1];

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);

    // Create a new request object with auth info
    const authenticatedReq = Object.assign({}, req, {
      auth: {
        token: accessToken,
        clientId: 'bearer-auth-client',
        scopes: [],
        extra: {
          rawToken: accessToken,
          type: 'bearer'
        }
      }
    });

    await transport.handleRequest(authenticatedReq, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

// SSE notifications not supported in stateless mode
app.get('/mcp', async (_req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message:
        'Method not allowed. SSE notifications not supported in stateless mode.'
    },
    id: null
  });
});

// Session termination not needed in stateless mode
app.delete('/mcp', async (_req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message:
        'Method not allowed. Session termination not needed in stateless mode.'
    },
    id: null
  });
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    server: {
      name: serverVersionInfo.name,
      version: serverVersionInfo.version
    }
  });
});

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
app.get(
  '/.well-known/oauth-authorization-server',
  (_req: Request, res: Response) => {
    res.json({
      ...OAUTH_CONFIG,
      service_documentation: `${OAUTH_SERVER_URL}/docs`
    });
  }
);

// OAuth 2.0 Protected Resource Metadata (RFC 8414)
// This endpoint tells clients which authorization servers protect this resource
app.get(
  '/.well-known/oauth-protected-resource/mcp',
  (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.json({
      resource: baseUrl + '/mcp',
      authorization_servers: [
        {
          ...OAUTH_CONFIG,
          grant_types_supported: ['authorization_code', 'refresh_token']
        }
      ]
    });
  }
);

// Also support the variant that the client is looking for
app.get(
  '/.well-known/oauth-authorization-server/mcp',
  (_req: Request, res: Response) => {
    res.json(OAUTH_CONFIG);
  }
);

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app
  .listen(PORT, () => {
    console.log(
      `MCP Stateless Streamable HTTP Server listening on port ${PORT}`
    );
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
    console.log(
      `OAuth registration endpoint: ${OAUTH_CONFIG.registration_endpoint}`
    );
    console.log(
      `\nTo use a different registration endpoint, set OAUTH_REGISTRATION_ENDPOINT environment variable`
    );
  })
  .on('error', (error: Error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
