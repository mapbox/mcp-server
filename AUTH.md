# MCP Server OAuth Authentication

This document describes the OAuth 2.0 authentication flow implemented in the MCP Server.

## Overview

The MCP Server uses OAuth 2.0 Bearer token authentication to protect its endpoints. When a client attempts to access the server without proper authentication, it receives OAuth metadata to complete the authentication flow.

## Configuration

The OAuth server URL can be configured via environment variables:

```bash
# Set the OAuth server URL (required)
export OAUTH_SERVER_URL=https://your-oauth-server.com

# Optionally override the registration endpoint
export OAUTH_REGISTRATION_ENDPOINT=https://your-oauth-server.com/custom/register
```

**Note**: The default CORS configuration allows all origins for development. In production, update the CORS settings in `streamable-http-service.ts` to restrict access to specific domains.

## Authentication Flow

### Step 1: Initial Request

When a client makes a request without authentication:

```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

### Step 2: Authentication Challenge

The server responds with a 401 status and OAuth metadata:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="MCP Server", resource="http://localhost:3000/mcp", as_uri="http://localhost:3000/.well-known/oauth-protected-resource/mcp"

{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Authentication required",
    "data": {
      "authorization_servers": [{
        "issuer": "https://oauth-server.com",
        "authorization_endpoint": "https://oauth-server.com/oauth/authorize",
        "token_endpoint": "https://oauth-server.com/oauth/access_token",
        "registration_endpoint": "https://oauth-server.com/oauth/register",
        "jwks_uri": "https://oauth-server.com/oauth/jwks",
        "response_types_supported": ["code"],
        "code_challenge_methods_supported": ["S256"]
      }],
      "resource": "http://localhost:3000/mcp",
      "auth_hint": "Please complete OAuth flow to access this MCP server"
    }
  },
  "id": 1
}
```

### Step 3: OAuth Metadata Discovery

Clients can discover OAuth configuration via well-known endpoints:

- `GET /.well-known/oauth-authorization-server` - OAuth server metadata
- `GET /.well-known/oauth-protected-resource/mcp` - Protected resource metadata
- `GET /.well-known/oauth-authorization-server/mcp` - Alternative endpoint

### Step 4: OAuth Authorization Flow

1. **Authorization Request**

   Redirect the user to the authorization endpoint:

   ```
   GET https://oauth-server.com/oauth/authorize?
     client_id=your-client-id&
     redirect_uri=http://localhost:5001/callback&
     response_type=code&
     state=random-state-value&
     code_challenge=challenge-value&
     code_challenge_method=S256
   ```

2. **Authorization Response**

   After user approval, the OAuth server redirects back:

   ```
   GET http://localhost:5001/callback?
     code=authorization-code&
     state=random-state-value
   ```

3. **Token Exchange**

   Exchange the authorization code for an access token:

   ```
   POST https://oauth-server.com/oauth/access_token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&
   code=authorization-code&
   client_id=your-client-id&
   client_secret=your-client-secret&
   code_verifier=verifier-value
   ```

4. **Token Response**
   ```json
   {
     "access_token": "eyJhbGciOiJIUzI1NiIs...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "refresh-token-value"
   }
   ```

### Step 5: Authenticated Requests

Include the access token in subsequent requests:

```
POST /mcp
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "mapbox-directions",
    "arguments": {...}
  },
  "id": 2
}
```

## Token Usage in Tools

The authentication token is automatically passed to all tools through the MCP SDK:

1. **Server extracts the token** from the Authorization header
2. **Creates an auth context** with token information
3. **MCP SDK passes auth info** to tool handlers via the `extra` parameter
4. **Tools can access the token** via `extra?.authInfo?.accessToken`

### Example Tool Implementation

```typescript
protected async execute(
  input: ToolInput,
  accessToken: string,
  extra?: RequestHandlerExtra<any, any>
): Promise<any> {
  // Use the provided access token for API calls
  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  // ...
}
```

## Multi-Tenancy Support

Each request can provide its own Bearer token, allowing:

- Different users to use their own API credentials
- Per-request authentication and authorization
- Isolation between different clients

## Fallback Behavior

If no Bearer token is provided via OAuth, tools will fall back to using environment variables (e.g., `MAPBOX_ACCESS_TOKEN`) if available.

## Error Handling

Common authentication errors:

- **401 Unauthorized**: No or invalid Bearer token
- **Invalid state parameter**: OAuth state validation failed during callback
- **Invalid JWT format**: Token doesn't match expected JWT structure
- **Token expired**: Access token has expired, use refresh token to get a new one

## Security Considerations

1. **HTTPS Required**: Always use HTTPS in production for OAuth flows
2. **State Parameter**: Validate state parameter to prevent CSRF attacks
3. **PKCE**: Use PKCE (code_challenge/code_verifier) for public clients
4. **Token Storage**: Store tokens securely on the client side
5. **Token Rotation**: Implement token refresh to maintain sessions

## Standards Compliance

This implementation follows:

- OAuth 2.0 (RFC 6749)
- OAuth 2.1 draft specifications
- OAuth 2.0 Authorization Server Metadata (RFC 8414)
- Bearer Token Usage (RFC 6750)
