# Warsaw Tour Guide - Web UI

A beautiful chat interface for the Mapbox MCP server built with Mastra and Next.js.

![Warsaw Tour Guide](https://img.shields.io/badge/Framework-Next.js-black?logo=next.js)
![Mastra](https://img.shields.io/badge/AI-Mastra-blue)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript)

## Features

- 💬 Real-time chat interface
- 🗺️ Mapbox geospatial tools integration
- 🖼️ **MCP-UI Support** - Render rich, interactive UI resources from MCP servers
- 🇵🇱 Warsaw-focused tour guide
- ⚡ Fast and responsive
- 🎨 Clean, modern UI

## Prerequisites

- Node.js 20.6+ (for --env-file support)
- Mapbox access token
- OpenAI API key
- Built MCP server (from repository root)

## Setup

### 1. Build the MCP Server

From the repository root:

```bash
cd ../../..  # Go to repository root
npm install
npm run build
cd examples/mastra/web-ui  # Return to web-ui directory
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your tokens:

```env
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
OPENAI_API_KEY=your_openai_key_here
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser!

## Usage

The chat interface allows you to:

- **Find landmarks**: "Find the Palace of Culture and Science"
- **Get directions**: "How do I get from Old Town to Royal Castle?"
- **Discover places**: "Find cafes near Lazienki Park"
- **Get coordinates**: "What are the coordinates of Warsaw Uprising Museum?"

### Example Queries

Try these prompts:

```
Find the Palace of Culture and Science
Get directions from Old Town to Royal Castle
Find cafes near Lazienki Park
What are the coordinates of Warsaw Uprising Museum?
Show me restaurants in the Old Town
How far is it from the Royal Castle to Wilanow Palace?
```

## Architecture

```
web-ui/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # Chat API endpoint
│   └── page.tsx              # Main chat interface
├── package.json
├── next.config.js
└── tsconfig.json
```

### How It Works

1. **Frontend** (`page.tsx`): React chat UI that sends messages to the API
2. **API Route** (`api/chat/route.ts`): Handles requests, uses Mastra agent with MCP tools
3. **Mastra Agent**: Coordinates with Mapbox MCP server to answer queries
4. **MCP Server**: Provides geospatial tools (search, directions, etc.)

### MCP-UI Integration

This web UI includes support for [MCP-UI](https://mcpui.dev), which enables MCP servers to send rich, interactive UI resources that render securely in sandboxed iframes.

**Current Status**: ✅ **Fully Integrated** - The Mapbox MCP server already sends UI resources for static map images!

**Active Features**:

- 🗺️ **Static Map Rendering**: The `static_map_image_tool` returns interactive map iframes
- 🔄 **Automatic Detection**: API route extracts UI resources from tool results
- 🖼️ **Side-by-Side Display**: Maps render alongside text responses
- 🔒 **Sandboxed Security**: All content runs in isolated iframes

**How It Works**:

1. Agent calls `static_map_image_tool` (e.g., "Show me a map of Palace of Culture")
2. MCP server returns both:
   - Base64 image data (for LLM context)
   - MCP-UI resource with interactive iframe
3. API route extracts resources via `onStepFinish` callback
4. Frontend renders resources with `<UIResourceRenderer>`
5. Map displays in sandboxed iframe with proper dimensions

**Testing MCP-UI**:

Try these prompts to see MCP-UI in action:

```
Create a map of Warsaw Old Town
Show me a static map of Palace of Culture and Science
Generate a map with a marker at Royal Castle in Warsaw
```

**Technical Details**:

The API route uses Mastra's `onStepFinish` callback to capture tool results:

```typescript
const result = await agent.generate(message, {
  onStepFinish: ({ toolResults }) => {
    // Extract MCP-UI resources from content array
    for (const contentItem of toolResult.content) {
      if (contentItem.type === 'resource') {
        uiResources.push(contentItem);
      }
    }
  }
});
```

The static map tool creates UI resources server-side:

```typescript
const uiResource = createUIResource({
  uri: `ui://mapbox/static-map/${style}/${lng},${lat},${zoom}`,
  content: {
    type: 'externalUrl',
    iframeUrl: mapboxStaticImageUrl
  },
  encoding: 'text',
  uiMetadata: {
    'preferred-frame-size': [`${width}px`, `${height}px`]
  }
});
```

**Note**: MCP-UI is enabled by default in the Mapbox MCP server. To disable it, set `ENABLE_MCP_UI=false` or use `--disable-mcp-ui` flag.

## Deployment

### Deploy to Vercel

The easiest way to deploy:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Make sure to add environment variables in the Vercel dashboard:

- `MAPBOX_ACCESS_TOKEN`
- `OPENAI_API_KEY`

### Deploy to Other Platforms

This is a standard Next.js app and can be deployed to:

- Vercel (recommended)
- Netlify
- AWS Amplify
- Docker container
- Any Node.js host

## Customization

### Change the Agent Instructions

Edit `app/api/chat/route.ts`:

```typescript
instructions: `Your custom instructions here...`;
```

### Modify the UI

Edit `app/page.tsx` to customize:

- Colors and styling
- Example prompts
- Initial message
- Layout

### Add More Tools

The agent automatically has access to all Mapbox MCP tools:

- search_and_geocode_tool
- category_search_tool
- reverse_geocode_tool
- directions_tool
- matrix_tool
- isochrone_tool
- static_map_image_tool

## Troubleshooting

### Error: "MAPBOX_ACCESS_TOKEN not set"

Make sure you have a `.env.local` file with your token:

```bash
echo "MAPBOX_ACCESS_TOKEN=your_token" > .env.local
echo "OPENAI_API_KEY=your_key" >> .env.local
```

### Error: "Cannot find MCP server"

Make sure you've built the MCP server:

```bash
cd ../../..
npm run build
```

### Port 3000 already in use

Run on a different port:

```bash
npm run dev -- -p 3001
```

## Performance Tips

- Use environment variables for API keys (never commit them!)
- Consider adding rate limiting for production
- Cache common queries
- Use streaming responses for better UX (coming soon)

## Learn More

- **Next.js**: https://nextjs.org/docs
- **Mastra**: https://mastra.ai/docs
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io

## Support

For issues specific to:

- **Web UI**: Create an issue in the mcp-server repository
- **Mastra**: https://github.com/mastra-ai/mastra/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
