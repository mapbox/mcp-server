"""
Warsaw Tour Guide - Interactive Map with Gradio Blocks (Pydantic AI)

A side-by-side interface with an AI agent chat panel that controls
an interactive Mapbox GL JS map. The agent can fly to locations,
add markers, draw routes, and more.

Install: pip install gradio
Run: python warsaw_gradio_blocks_interactive.py
"""

import asyncio
import os
import json
import re
from dotenv import load_dotenv
import gradio as gr
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.models.openai import OpenAIChatModel

# Load environment variables
load_dotenv()


def get_mcp_server():
    """Configure the Mapbox MCP server connection."""
    mapbox_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not mapbox_token:
        raise EnvironmentError(
            "MAPBOX_ACCESS_TOKEN environment variable is required. "
            "Get your token at https://account.mapbox.com/"
        )

    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, "..", "..", "dist", "esm", "index.js")

    return MCPServerStdio(
        "node",
        args=[script_path],
        env={"MAPBOX_ACCESS_TOKEN": mapbox_token},
        timeout=30
    )


# Create the agent
mcp_server = get_mcp_server()

agent = Agent(
    OpenAIChatModel("gpt-4o"),
    system_prompt="""You are an expert guide for Warsaw, Poland with access to Mapbox geospatial tools.
Your responses control an interactive Mapbox GL JS map.

IMPORTANT: After using tools to find locations, you MUST provide map commands in your response.

Map Command Format:
When you want to control the map, include a JSON code block with the label "MAP_COMMANDS" containing an array of commands:

```MAP_COMMANDS
[
  {
    "type": "flyTo",
    "data": {
      "center": { "lng": 21.0122, "lat": 52.2297 },
      "zoom": 15,
      "pitch": 45,
      "bearing": 0
    }
  },
  {
    "type": "addMarker",
    "data": {
      "location": { "lng": 21.0122, "lat": 52.2297 },
      "color": "#ff0000",
      "popup": "<strong>Palace of Culture</strong><br>Famous landmark"
    }
  }
]
```

Available command types:
1. "flyTo" - Animate camera to location
   - center: { lng, lat }
   - zoom: 0-22 (default: 15)
   - pitch: 0-60 (default: 45)
   - bearing: 0-360 (default: 0)

2. "addMarker" - Add a marker to the map
   - location: { lng, lat }
   - color: hex color (default: "#ff0000")
   - popup: HTML string (optional)

3. "clearMarkers" - Remove all markers
   - No data needed

4. "drawRoute" - Draw a route line
   - coordinates: [[lng, lat], [lng, lat], ...]
   - color: hex color (default: "#007bff")

Workflow:
1. Use search_and_geocode_tool to find locations
2. Extract coordinates from results
3. Generate appropriate map commands
4. Provide friendly text explanation

Example interaction:
User: "Show me the Palace of Culture and Science"
You:
- Use search_and_geocode_tool to find it
- Get coordinates (e.g., 21.006912, 52.231953)
- Respond with:
  * Text: "Flying to the Palace of Culture and Science! This iconic building..."
  * MAP_COMMANDS: flyTo to location + addMarker

User: "Get directions from Old Town to Royal Castle"
You:
- Use geocode tools to get both locations
- Use directions_tool with geometries='geojson' to get the route (IMPORTANT: must set geometries='geojson' to get route geometry!)
- Extract the coordinates from routes[0].geometry.coordinates
- Respond with:
  * Text: "Here's your route from Old Town to Royal Castle..."
  * MAP_COMMANDS: drawRoute with the geometry coordinates + flyTo to fit bounds

CRITICAL for directions:
When requesting directions, you MUST:
1. Call directions_tool with the parameter geometries='geojson' (without this, no geometry is returned!)
2. Extract routes[0].geometry.coordinates from the response
3. Use those coordinates in the drawRoute command
4. The coordinates should be an array of [lng, lat] pairs representing the actual route path

Example MAP_COMMANDS for directions:
```MAP_COMMANDS
[
  {
    "type": "drawRoute",
    "data": {
      "coordinates": [[21.006912, 52.231953], [21.007123, 52.232145], ...],
      "color": "#007bff"
    }
  },
  {
    "type": "flyTo",
    "data": {
      "center": {"lng": 21.015, "lat": 52.235},
      "zoom": 13
    }
  }
]
```

Always be friendly, informative, and generate map commands when working with locations!""",
    toolsets=[mcp_server]
)


def extract_map_commands(text: str) -> tuple[str, list]:
    """
    Extract map commands from agent response.

    Args:
        text: The agent's response text

    Returns:
        Tuple of (clean_text, map_commands)
    """
    map_commands_pattern = r'```MAP_COMMANDS\s*\n([\s\S]*?)\n```'
    matches = list(re.finditer(map_commands_pattern, text))

    if not matches:
        return text, []

    map_commands = []
    clean_text = text

    for match in matches:
        try:
            commands = json.loads(match.group(1))
            if isinstance(commands, list):
                map_commands.extend(commands)
            # Remove the command block from text
            clean_text = clean_text.replace(match.group(0), '').strip()
        except json.JSONDecodeError as e:
            print(f"Failed to parse map commands: {e}")

    return clean_text, map_commands


async def chat_with_map_control(message: str, history: list) -> tuple[str, str]:
    """
    Process a chat message and return both text and map commands.

    Args:
        message: The user's message
        history: Chat history (Gradio format)

    Returns:
        Tuple of (text_response, map_commands_json)
    """
    try:
        # Run the agent
        result = await agent.run(message)
        text_response = result.output

        # Extract map commands
        clean_text, map_commands = extract_map_commands(text_response)

        # Return clean text and commands as JSON
        return clean_text, json.dumps(map_commands) if map_commands else ""

    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}", ""


def chat_wrapper(message: str, history: list):
    """Synchronous wrapper for the async chat function."""
    return asyncio.run(chat_with_map_control(message, history))


def create_map_with_commands(commands_json: str, port: int) -> str:
    """Create map HTML file with commands embedded, returns iframe HTML."""
    import time

    # Read the template
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, "map_template.html")

    with open(template_path, 'r') as f:
        template = f.read()

    # Replace token
    mapbox_public_token = os.environ.get("MAPBOX_PUBLIC_TOKEN", "")
    map_html_content = template.replace('__MAPBOX_TOKEN__', mapbox_public_token)

    # If we have commands, inject them into the HTML
    if commands_json and commands_json != "" and commands_json != "[]":
        commands_script = f"""
        <script>
        window.addEventListener('load', function() {{
            setTimeout(function() {{
                const commands = {commands_json};
                if (window.handleMapCommands) {{
                    window.handleMapCommands(JSON.stringify(commands));
                }}
            }}, 800);
        }});
        </script>
        </body>
        """
        map_html_content = map_html_content.replace('</body>', commands_script)

    # Write to a unique file
    unique_id = int(time.time() * 1000)
    map_file_path = os.path.join(script_dir, f"map_interactive_{unique_id}.html")

    with open(map_file_path, 'w') as f:
        f.write(map_html_content)

    # Return iframe pointing to the new file
    return f'<iframe src="http://127.0.0.1:{port}/map_interactive_{unique_id}.html" width="100%" height="600px" frameborder="0" style="border:0;"></iframe>'


# Get Mapbox public token for the client-side map
# Note: This must be a PUBLIC token (starts with pk.) for browser use
mapbox_public_token = os.environ.get("MAPBOX_PUBLIC_TOKEN", "")
if not mapbox_public_token:
    print("WARNING: MAPBOX_PUBLIC_TOKEN not set. The map will not load.")
    print("Get a public token at https://account.mapbox.com/access-tokens/")
    print("Public tokens start with 'pk.' and are safe to use in the browser.")
else:
    print(f"✓ Public token loaded successfully (length: {len(mapbox_public_token)})")

# Create the map HTML file with token
script_dir = os.path.dirname(os.path.abspath(__file__))
template_path = os.path.join(script_dir, "map_template.html")
map_file_path = os.path.join(script_dir, "map_interactive.html")

# Read template and replace token
with open(template_path, 'r') as f:
    template = f.read()

map_html_content = template.replace('__MAPBOX_TOKEN__', mapbox_public_token)

# Write the map file
with open(map_file_path, 'w') as f:
    f.write(map_html_content)

print(f"Map file created at: {map_file_path}")

# Serve the HTML file via Gradio's static file serving
# Gradio automatically serves files from the same directory
import socket

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

# Start a simple HTTP server for the map file
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

class MapHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=script_dir, **kwargs)

    def log_message(self, format, *args):
        pass  # Suppress logs

map_port = get_free_port()

def start_server():
    server = HTTPServer(('127.0.0.1', map_port), MapHTTPHandler)
    print(f"✓ Map server started on http://127.0.0.1:{map_port}")
    server.serve_forever()

# Start server in background thread
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

# Create iframe pointing to the local server
map_html = f'<iframe id="mapIframe" src="http://127.0.0.1:{map_port}/map_interactive.html" width="100%" height="600px" frameborder="0" style="border:0;"></iframe>'

# Example prompts
examples = [
    "Show me the Palace of Culture and Science",
    "Fly to Warsaw Old Town",
    "Take me to Royal Castle",
    "Get directions from Palace of Culture to Lazienki Park",
    "Find cafes near the Old Town",
]


# Create the Gradio Blocks interface
with gr.Blocks(title="🇵🇱 Warsaw Interactive Map Guide") as demo:
    gr.Markdown(
        """
        # 🇵🇱 Warsaw Interactive Map Guide
        AI-powered chat that controls an interactive Mapbox map in real-time!

        **Powered by Pydantic AI + Mapbox MCP Server**
        """
    )

    with gr.Row():
        # Left panel - Chat
        with gr.Column(scale=1):
            chatbot = gr.Chatbot(
                label="Warsaw Guide Chat",
                height=600
            )

            msg = gr.Textbox(
                label="Your message",
                placeholder="Ask about Warsaw landmarks...",
                lines=2
            )

            with gr.Row():
                submit = gr.Button("Send", variant="primary", scale=1)
                clear = gr.Button("Clear Chat", scale=1)

            gr.Examples(
                examples=examples,
                inputs=msg,
                label="Example prompts"
            )

        # Right panel - Interactive Map
        with gr.Column(scale=1):
            map_display = gr.HTML(value=map_html)

    def respond(message, chat_history):
        """Handle user message and update both chat and map."""
        if not message.strip():
            return "", chat_history, map_html

        print(f"\n🔵 User message: {message}")

        # Get response and map commands
        text, commands = chat_wrapper(message, chat_history)

        print(f"🔵 Agent response: {text[:100]}...")
        print(f"🔵 Map commands: {commands if commands else 'NONE'}")

        # Update chat history
        chat_history.append({"role": "user", "content": message})
        chat_history.append({"role": "assistant", "content": text})

        # Create new map HTML file with embedded commands
        new_map_html = create_map_with_commands(commands, map_port)

        return "", chat_history, new_map_html

    def clear_chat():
        """Clear the chat history."""
        return []

    # Wire up the events - simple and reliable
    msg.submit(respond, [msg, chatbot], [msg, chatbot, map_display])
    submit.click(respond, [msg, chatbot], [msg, chatbot, map_display])
    clear.click(clear_chat, None, chatbot)


if __name__ == "__main__":
    print("🚀 Starting Warsaw Interactive Map Guide...")
    print("📍 Using Mapbox MCP Server with Pydantic AI")
    print("🗺️  Interactive map with real-time control!")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
