# Warsaw Interactive Map - AI-Powered Map Experience

An interactive map experience where an AI agent controls a live Mapbox GL JS map. The agent can fly to locations, add markers, draw routes, and more - all through natural language commands.

![Next.js](https://img.shields.io/badge/Framework-Next.js-black?logo=next.js)
![Mastra](https://img.shields.io/badge/AI-Mastra-blue)
![Mapbox GL JS](https://img.shields.io/badge/Maps-Mapbox_GL_JS-blue?logo=mapbox)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript)

## Features

- 🗺️ **Interactive Mapbox GL JS Map** - Smooth 3D map with real-time updates
- 🤖 **AI Agent Control** - Natural language commands control the map
- ✈️ **Smooth Animations** - Beautiful flyTo transitions between locations
- 📍 **Dynamic Markers** - AI adds markers with popups for landmarks
- 🛣️ **Route Visualization** - Draw routes between locations
- 🇵🇱 **Warsaw-Focused** - Perfect for exploring Poland's capital

## Architecture

```
┌─────────────────────────────────────────────┐
│     Warsaw Interactive Map Experience      │
├──────────────┬──────────────────────────────┤
│              │                              │
│  Agent Chat  │     Mapbox GL JS Map         │
│  Panel       │     • flyTo animations       │
│  (400px)     │     • Markers & popups       │
│              │     • Route drawing          │
│              │     • 3D view (pitch)        │
│              │                              │
└──────────────┴──────────────────────────────┘
```

## Prerequisites

- Node.js 20.6+ (for --env-file support)
- Mapbox access token (secret token for MCP server)
- Mapbox public token (for client-side GL JS map)
- OpenAI API key
- Built MCP server (from repository root)

## Setup

### 1. Build the MCP Server

From the repository root:

```bash
cd ../../..  # Go to repository root
npm install
npm run build
cd examples/mastra/map-interactive  # Return to map-interactive directory
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
MAPBOX_ACCESS_TOKEN=your_secret_mapbox_token_here
NEXT_PUBLIC_MAPBOX_TOKEN=your_public_mapbox_token_here
OPENAI_API_KEY=your_openai_key_here
```

**Important**:

- `MAPBOX_ACCESS_TOKEN` - Secret token for MCP server API calls
- `NEXT_PUBLIC_MAPBOX_TOKEN` - Public token for client-side map rendering

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser!

## Usage

### Example Commands

The AI agent understands natural language and translates it into map commands:

**Navigate to Locations:**

```
"Show me the Palace of Culture and Science"
"Fly to Warsaw Old Town"
"Take me to Royal Castle"
```

**Add Markers:**

```
"Mark the location of Lazienki Park"
"Show me all major landmarks"
```

**Get Directions:**

```
"Get directions from Old Town to Palace of Culture"
"Show me the route from Royal Castle to Wilanow Palace"
```

**Explore Areas:**

```
"Show me cafes near the Old Town"
"Find restaurants in the city center"
```

### How It Works

1. **User sends message** → Chat panel
2. **Agent processes request** → Uses Mapbox MCP tools to:
   - Search for locations
   - Get coordinates
   - Find directions
   - Query places
3. **Agent generates map commands** → JSON commands in response
4. **Map executes commands** → Smooth animations and updates

### Map Commands

The agent generates structured commands that the map component executes:

#### FlyTo Command

```json
{
  "type": "flyTo",
  "data": {
    "center": { "lng": 21.0122, "lat": 52.2297 },
    "zoom": 15,
    "pitch": 45,
    "bearing": 0
  }
}
```

#### Add Marker Command

```json
{
  "type": "addMarker",
  "data": {
    "location": { "lng": 21.0122, "lat": 52.2297 },
    "color": "#ff0000",
    "popup": "<strong>Palace of Culture</strong><br>Famous landmark"
  }
}
```

#### Draw Route Command

```json
{
  "type": "drawRoute",
  "data": {
    "coordinates": [
      [21.01, 52.23],
      [21.02, 52.24]
    ],
    "color": "#007bff"
  }
}
```

#### Clear Markers Command

```json
{
  "type": "clearMarkers",
  "data": {}
}
```

## Project Structure

```
map-interactive/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts         # API endpoint with map-aware agent
│   ├── components/
│   │   └── MapComponent.tsx     # Mapbox GL JS map component
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main split-screen interface
├── package.json
├── next.config.js
├── tsconfig.json
└── README.md
```

## Key Technologies

### Mapbox GL JS

- **Interactive 3D maps** with smooth animations
- **Vector tiles** for crisp rendering at any zoom level
- **Custom markers and popups** for landmark information
- **Route visualization** with GeoJSON layers

### Mastra Agent

- **Natural language understanding** of map commands
- **Mapbox MCP tool access** for geocoding and directions
- **Structured output** generation (map commands)

### Next.js

- **Server-side API routes** for agent communication
- **Client-side interactivity** for real-time map updates
- **Dynamic imports** to avoid SSR issues with Mapbox GL

## Customization

### Change Map Style

Edit `app/components/MapComponent.tsx`:

```typescript
map.current = new mapboxgl.Map({
  container: mapContainer.current,
  style: 'mapbox://styles/mapbox/dark-v11', // Try: dark-v11, satellite-streets-v12
  center: [21.0122, 52.2297],
  zoom: 12
});
```

### Adjust Agent Instructions

Edit `app/api/chat/route.ts` to modify how the agent generates map commands.

### Modify Panel Width

Edit `app/page.tsx`:

```typescript
<div style={{ width: '400px', ... }}>  // Change width here
```

## Troubleshooting

### Map doesn't render

**Check environment variables:**

```bash
# Make sure NEXT_PUBLIC_MAPBOX_TOKEN is set
echo $NEXT_PUBLIC_MAPBOX_TOKEN
```

**Check browser console** for Mapbox GL errors.

### Agent not generating map commands

**Check agent response** in browser dev tools → Network tab → `/api/chat` response.

The agent should include `MAP_COMMANDS` code blocks in its response.

### MCP Server connection issues

**Ensure server is built:**

```bash
cd ../../..
npm run build
ls -la dist/esm/index.js  # Should exist
```

### Port 3000 already in use

Run on a different port:

```bash
npm run dev -- -p 3001
```

## Advanced Features

### Multiple Markers

Ask the agent to show multiple locations:

```
"Show me the top 5 landmarks in Warsaw"
```

The agent will add multiple markers with popups.

### Custom Map Animations

The `flyTo` command supports advanced parameters:

- **pitch**: 0-60° (3D tilt angle)
- **bearing**: 0-360° (map rotation)
- **zoom**: 0-22 (zoom level)

### Route Styling

Routes can be customized with different colors:

```json
{
  "type": "drawRoute",
  "data": {
    "coordinates": [...],
    "color": "#00ff00"  // Custom color
  }
}
```

## Performance Tips

- **Limit markers**: Too many markers can slow down the map
- **Clear old routes**: Use `clearMarkers` before adding new ones
- **Optimize flyTo duration**: Shorter distances = shorter animations

## Learn More

- **Mapbox GL JS**: https://docs.mapbox.com/mapbox-gl-js/
- **Mastra**: https://mastra.ai/docs
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **Next.js**: https://nextjs.org/docs

## Demo Ideas

Perfect for demos at conferences like AI Poland:

1. **"Virtual Tour"** - Fly through Warsaw's famous landmarks
2. **"Route Planning"** - Show optimal routes between locations
3. **"Discovery Mode"** - Find nearby cafes, restaurants, attractions
4. **"Historical Journey"** - Mark historical sites with detailed popups

## Support

For issues specific to:

- **Map Interactive Example**: Create an issue in the mcp-server repository
- **Mastra**: https://github.com/mastra-ai/mastra/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
- **Mapbox GL JS**: https://github.com/mapbox/mapbox-gl-js/issues

---

**Built with ❤️ for AI Poland 2025** 🇵🇱
