# Pydantic AI + Mapbox MCP Server Example

This example demonstrates how to integrate the Mapbox MCP server with [Pydantic AI](https://ai.pydantic.dev), a modern, type-safe Python framework for building production-grade AI applications.

## What is Pydantic AI?

Pydantic AI is a Python framework for building AI applications that:

- Provides type-safe, validated interactions with LLMs
- Leverages Pydantic's powerful validation system
- Supports multiple LLM providers (OpenAI, Anthropic, Gemini, etc.)
- Offers built-in structured output support
- Integrates seamlessly with the Model Context Protocol
- Focuses on production-readiness and developer experience

**Best for**: Production applications requiring strong typing and validation

## Features

This example demonstrates:

- Connecting Pydantic AI to the Mapbox MCP server
- Type-safe agent creation with MCP toolsets
- Configuring different LLM providers (OpenAI, Anthropic)
- Running example queries for common geospatial use cases
- Proper async/await patterns for MCP integration

## Prerequisites

- Python 3.10 or higher
- A Mapbox access token ([Get one here](https://account.mapbox.com/))
- An API key for your chosen LLM provider (OpenAI, Anthropic, etc.)
- Node.js 18+ (for running the MCP server)

**Note**: This example uses the local build of the MCP server from the repository by default.

## Setup

1. Build the MCP server (from repository root):

```bash
cd ../..  # Go to repository root
npm install
npm run build
cd examples/pydantic-ai  # Return to example directory
```

2. Create and activate a virtual environment:

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate  # On macOS/Linux
# OR on Windows:
# venv\Scripts\activate
```

3. Install Python dependencies:

```bash
pip install -r requirements.txt
```

4. Set up environment variables:

```bash
# Create a .env file
echo "MAPBOX_ACCESS_TOKEN=your_mapbox_token_here" > .env
echo "OPENAI_API_KEY=your_openai_key_here" >> .env
```

Or export them directly:

```bash
export MAPBOX_ACCESS_TOKEN="your_mapbox_token_here"
export OPENAI_API_KEY="your_openai_key_here"
```

5. Run the example:

```bash
python pydantic_ai_example.py
```

**Note**: Remember to activate the virtual environment (`source venv/bin/activate`) whenever you work on this example.

## Additional Examples

### Gradio Web Interfaces

This directory includes several Gradio-based web interfaces for interactive demos:

#### 1. `warsaw_example.py` - Warsaw Tour Guide (CLI)

Basic command-line example that demonstrates using Pydantic AI with the Mapbox MCP server.

```bash
python warsaw_example.py
```

#### 2. `warsaw_gradio.py` - Simple Chat Interface

A basic Gradio chat interface for the Warsaw tour guide.

```bash
pip install gradio
python warsaw_gradio.py
```

#### 3. `warsaw_gradio_blocks.py` - Enhanced UI with Static Maps

An enhanced Gradio interface that displays static map images alongside chat responses.

```bash
python warsaw_gradio_blocks.py
```

#### 4. `warsaw_gradio_blocks_interactive.py` - Interactive Map Control

A side-by-side interface with real-time map control, similar to the Mastra example but in Python/Gradio:

```bash
python warsaw_gradio_blocks_interactive.py
```

**Important**: This example requires a **public Mapbox token** (starts with `pk.`) for the browser-based map:

```bash
# Add to your .env file
MAPBOX_PUBLIC_TOKEN=pk.your_public_token_here
```

Get a public token at: https://account.mapbox.com/access-tokens/

**Features:**

- Interactive Mapbox GL JS map embedded in the interface
- Real-time map control (fly to locations, add markers, draw routes)
- Side-by-side chat and map layout
- Agent generates map commands that are executed in JavaScript

**How it works:**

1. The agent receives user queries and uses Mapbox MCP tools to find locations
2. Agent generates structured `MAP_COMMANDS` in its response
3. Python extracts these commands and passes them to the JavaScript map
4. The map updates in real-time based on the commands

**Example queries:**

- "Show me the Palace of Culture and Science"
- "Get directions from Old Town to Royal Castle"
- "Fly to Lazienki Park"

## Usage

### Basic Usage

```python
import asyncio
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.models.openai import OpenAIChatModel

async def main():
    # Configure Mapbox MCP server
    mcp_server = MCPServerStdio(
        "npx",
        args=["-y", "@mapbox/mcp-server"],
        env={"MAPBOX_ACCESS_TOKEN": "your_token_here"},
        timeout=30
    )

    # Create agent with Mapbox tools
    agent = Agent(
        OpenAIChatModel("gpt-4o-mini"),
        system_prompt="You are a helpful travel assistant.",
        toolsets=[mcp_server]
    )

    # Run a query
    result = await agent.run("Find coffee shops near Times Square")
    print(result.output)

asyncio.run(main())
```

### Configuring LLM Providers

The example supports multiple LLM providers:

**OpenAI (Default)**

```python
from pydantic_ai.models.openai import OpenAIChatModel

model = OpenAIChatModel("gpt-4o-mini")
agent = Agent(model, toolsets=[mcp_server])
```

**Anthropic Claude**

```python
from pydantic_ai.models.anthropic import AnthropicModel

model = AnthropicModel("claude-3-7-sonnet-latest")
agent = Agent(model, toolsets=[mcp_server])
```

**Google Gemini**

```python
from pydantic_ai.models.gemini import GeminiModel

model = GeminiModel("gemini-1.5-pro")
agent = Agent(model, toolsets=[mcp_server])
```

### Connection Options

**Option 1: Published npm package (default)**

```python
mcp_server = MCPServerStdio(
    "npx",
    args=["-y", "@mapbox/mcp-server"],
    env={"MAPBOX_ACCESS_TOKEN": token},
    timeout=30
)
```

**Option 2: Local development**

```python
mcp_server = MCPServerStdio(
    "node",
    args=["/path/to/dist/esm/index.js"],
    env={"MAPBOX_ACCESS_TOKEN": token},
    timeout=30
)
```

**Option 3: Docker**

```python
mcp_server = MCPServerStdio(
    "docker",
    args=["run", "-i", "--rm", "-e", f"MAPBOX_ACCESS_TOKEN={token}", "mapbox-mcp-server"],
    env={"MAPBOX_ACCESS_TOKEN": token},
    timeout=30
)
```

## Available Tools

The agent has access to all Mapbox MCP tools:

- **search_and_geocode_tool**: Search for places and convert addresses to coordinates
- **category_search_tool**: Find points of interest by category
- **reverse_geocode_tool**: Convert coordinates to addresses
- **directions_tool**: Get routing directions with multiple travel modes
- **matrix_tool**: Calculate travel times between multiple locations
- **isochrone_tool**: Visualize reachable areas within time/distance
- **static_map_image_tool**: Generate static map images

## Example Queries

Try these queries with your agent:

**Location Discovery**

```python
await run_example("Find gas stations near LAX airport")
await run_example("What's the address of the Statue of Liberty?")
```

**Navigation & Travel**

```python
await run_example("How long does it take to walk from Central Park to Times Square?")
await run_example("Get driving directions from San Francisco to Los Angeles")
```

**Analysis & Planning**

```python
await run_example("Show me areas within 30 minutes of downtown Seattle by car")
await run_example("Calculate travel times between JFK, LaGuardia, and Newark airports")
```

**Visualization**

```python
await run_example("Create a map showing the route from the White House to the Capitol")
```

## Type Safety and Validation

### Structured Output

One of Pydantic AI's strengths is structured, validated output:

```python
from pydantic import BaseModel
from pydantic_ai import Agent

class Location(BaseModel):
    name: str
    latitude: float
    longitude: float
    address: str | None = None

agent = Agent(
    model,
    output_type=Location,  # Use output_type parameter
    system_prompt="Find locations and return structured data.",
    toolsets=[mcp_server]
)

result = await agent.run("Find the Eiffel Tower")
location: Location = result.output  # Access via result.output
print(f"{location.name} is at ({location.latitude}, {location.longitude})")
```

### Custom Tools with Validation

Add custom tools with automatic validation:

```python
from pydantic_ai import Agent, RunContext

@agent.tool
def filter_by_rating(ctx: RunContext, places: list[dict], min_rating: float) -> list[dict]:
    """Filter places by minimum rating."""
    return [p for p in places if p.get('rating', 0) >= min_rating]

agent = Agent(
    model,
    tools=[filter_by_rating],
    toolsets=[mcp_server]
)
```

## Advanced Features

### Dependency Injection

Pass dependencies to your agent:

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext

@dataclass
class UserPreferences:
    preferred_mode: str
    avoid_tolls: bool

agent = Agent(model, toolsets=[mcp_server])

@agent.tool
def get_directions(ctx: RunContext[UserPreferences], origin: str, destination: str):
    """Get directions using user preferences."""
    prefs = ctx.deps
    # Use prefs.preferred_mode and prefs.avoid_tolls
    pass

prefs = UserPreferences(preferred_mode="driving", avoid_tolls=True)
result = await agent.run("Get directions to work", deps=prefs)
```

### Streaming Responses

Stream agent responses in real-time:

```python
async with agent.run_stream("Find restaurants in Paris") as result:
    async for message in result.stream_text():
        print(message, end="", flush=True)

final_result = await result.get_data()
```

### Message History

Maintain conversation context:

```python
from pydantic_ai.messages import ModelMessage

messages: list[ModelMessage] = []

# First query
result1 = await agent.run("What are the coordinates of Paris?", message_history=messages)
messages.extend(result1.new_messages())

# Follow-up query with context
result2 = await agent.run("Find restaurants there", message_history=messages)
messages.extend(result2.new_messages())
```

### Error Handling

Handle tool execution errors gracefully:

```python
from pydantic_ai.exceptions import UserError

try:
    result = await agent.run("Find locations in Atlantis")
except UserError as e:
    print(f"Agent error: {e}")
```

## Troubleshooting

### Installation Issues

**Error: "Building wheel for [package] ... error" or similar build errors**

You may be using **Python 3.14**, which many packages don't support yet. Use Python 3.13 or earlier.

**Solution:**

```bash
# Remove current venv
rm -rf venv

# Create venv with supported Python version (3.13 or earlier)
python3.13 -m venv venv  # Or python3.12, python3.11

# Activate and install
source venv/bin/activate
pip install -r requirements.txt
```

If you don't have Python 3.13:

```bash
brew install python@3.13
```

**Error: "externally managed environment"**

You need to use a virtual environment on macOS with Homebrew Python:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Connection Issues

**Error: "command not found: npx"**

- Install Node.js from https://nodejs.org/
- Or use Docker connection instead

**Error: "MAPBOX_ACCESS_TOKEN environment variable is required"**

- Make sure you've set the environment variable
- Check that the variable is exported in your current shell

**Interactive map not loading (warsaw_gradio_blocks_interactive.py)**

The interactive map requires a **public Mapbox token** (different from your regular token):

- Public tokens start with `pk.` and are safe to use in browsers
- Regular tokens may start with `sk.` and should only be used server-side
- Get a public token at: https://account.mapbox.com/access-tokens/
- Add it to your `.env` file: `MAPBOX_PUBLIC_TOKEN=pk.your_token_here`

**Why two tokens?**

- `MAPBOX_ACCESS_TOKEN`: Used by the MCP server (server-side, private)
- `MAPBOX_PUBLIC_TOKEN`: Used by the browser map (client-side, public)

**Error: "MCP server timeout"**

- Increase the timeout parameter in MCPServerStdio
- Check that the MCP server is responding correctly
- Verify Node.js is properly installed

```python
mcp_server = MCPServerStdio(
    "npx",
    args=["-y", "@mapbox/mcp-server"],
    env={"MAPBOX_ACCESS_TOKEN": token},
    timeout=60  # Increase timeout to 60 seconds
)
```

### Model Issues

**Error: "OpenAI API key not found"**

- Set your `OPENAI_API_KEY` environment variable
- Or switch to a different model provider

**Error: "Rate limit exceeded"**

- Use a different model provider
- Add retry logic
- Upgrade your API plan

### Validation Issues

**Error: "ValidationError" when using result_type**

- Ensure the LLM output matches your Pydantic model
- Add more detailed instructions in system_prompt
- Use `result_type=None` to disable structured output

```python
agent = Agent(
    model,
    result_type=Location,
    system_prompt="""When providing location information, always include:
    - name: The full name of the place
    - latitude: The latitude as a decimal number
    - longitude: The longitude as a decimal number
    - address: The full address (optional)"""
)
```

### Tool Calling Issues

**Error: "Tool execution failed"**

- Check MCP server logs for detailed errors
- Verify tool parameters are correct
- Ensure Mapbox token has required permissions

**Agent not using tools**

- Make sure toolsets are configured correctly
- Check that system_prompt encourages tool usage
- Verify the query requires tool usage

### Performance

For better performance:

- Use streaming for long responses
- Cache results when appropriate
- Use lighter models for simple queries
- Consider structured output for parsing efficiency

## Learn More

- **Pydantic AI Documentation**: https://ai.pydantic.dev
- **Pydantic AI MCP Integration**: https://ai.pydantic.dev/mcp/
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io
- **Mapbox APIs**: https://docs.mapbox.com/

## Support

For issues specific to:

- **Pydantic AI**: https://github.com/pydantic/pydantic-ai/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
- **Mapbox APIs**: https://support.mapbox.com/
