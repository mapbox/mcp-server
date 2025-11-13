# LangGraph + Mapbox MCP Server Example

This example demonstrates how to integrate the Mapbox MCP server with [LangGraph](https://langchain-ai.github.io/langgraph/), a workflow-based framework for building stateful AI agents.

## What is LangGraph?

LangGraph is a Python framework for building stateful, multi-actor applications with LLMs that:

- Provides a workflow-based approach to agent development
- Supports complex state management and branching logic
- Integrates seamlessly with LangChain ecosystem
- Enables building sophisticated agent architectures (ReAct, Plan-and-Execute, etc.)
- Works with any LLM provider (OpenAI, Anthropic, etc.)

**Best for**: Production-grade agents requiring complex workflows and state management

## Features

This example demonstrates:

- Connecting LangGraph to the Mapbox MCP server
- Using the ReAct agent pattern for tool calling
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
cd examples/langgraph  # Return to example directory
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
python langgraph_example.py
```

**Note**: Remember to activate the virtual environment (`source venv/bin/activate`) whenever you work on this example.

## Usage

### Basic Usage

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

# Configure Mapbox MCP server
mcp_config = {
    "mapbox": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@mapbox/mcp-server"],
        "env": {"MAPBOX_ACCESS_TOKEN": "your_token_here"}
    }
}

async def main():
    # Connect to MCP and get tools
    # Note: As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient
    # cannot be used as a context manager
    client = MultiServerMCPClient(mcp_config)
    tools = await client.get_tools()

    # Create agent with Mapbox tools
    model = ChatOpenAI(model="gpt-4o-mini")
    agent = create_agent(model, tools)

    # Run a query
    result = await agent.ainvoke({
        "messages": [{"role": "user", "content": "Find coffee shops near Times Square"}]
    })
    print(result["messages"][-1].content)

asyncio.run(main())
```

### Configuring LLM Providers

The example supports multiple LLM providers:

**OpenAI (Default)**

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
```

**Anthropic Claude**

```python
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(model="claude-3-7-sonnet-latest", temperature=0)
```

**Google Gemini**

```python
from langchain_google_genai import ChatGoogleGenerativeAI

model = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0)
```

### Connection Options

**Option 1: Published npm package (default)**

```python
mcp_config = {
    "mapbox": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@mapbox/mcp-server"],
        "env": {"MAPBOX_ACCESS_TOKEN": token}
    }
}
```

**Option 2: Local development**

```python
mcp_config = {
    "mapbox": {
        "transport": "stdio",
        "command": "node",
        "args": ["/path/to/dist/esm/index.js"],
        "env": {"MAPBOX_ACCESS_TOKEN": token}
    }
}
```

**Option 3: Docker**

```python
mcp_config = {
    "mapbox": {
        "transport": "stdio",
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", f"MAPBOX_ACCESS_TOKEN={token}", "mapbox-mcp-server"],
        "env": {"MAPBOX_ACCESS_TOKEN": token}
    }
}
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

## Agent Patterns

### ReAct Agent (Default)

The example uses the ReAct (Reasoning + Acting) pattern:

```python
from langchain.agents import create_agent

agent = create_agent(model, tools)
result = await agent.ainvoke({"messages": [{"role": "user", "content": query}]})
```

### Custom Workflows

You can build custom workflows with LangGraph:

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "The messages in the conversation"]
    next: str

def agent_node(state):
    # Your custom agent logic
    pass

def should_continue(state):
    # Your routing logic
    if state["next"] == "end":
        return END
    return "agent"

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_conditional_edges("agent", should_continue)
workflow.set_entry_point("agent")

app = workflow.compile()
```

## Advanced Features

### Streaming Responses

Enable streaming for real-time output:

```python
async for chunk in agent.astream({"messages": [{"role": "user", "content": query}]}):
    print(chunk)
```

### State Persistence

Add checkpointing for conversation memory:

```python
from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()
agent = create_agent(model, tools, checkpointer=memory)

# Use with thread_id for persistent conversations
config = {"configurable": {"thread_id": "conversation-1"}}
result = await agent.ainvoke({"messages": [{"role": "user", "content": query}]}, config)
```

### Tool Error Handling

Add error handling for tool calls:

```python
from langchain_core.runnables import RunnableConfig

def handle_tool_error(error):
    return f"Error calling tool: {error}"

agent = create_agent(
    model,
    tools,
    handle_tool_error=handle_tool_error
)
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

### Model Issues

**Error: "OpenAI API key not found"**

- Set your `OPENAI_API_KEY` environment variable
- Or switch to a different model provider

**Error: "Rate limit exceeded"**

- Use a different model provider
- Add retry logic with exponential backoff
- Upgrade your API plan

### MCP Issues

**Error: "Failed to connect to MCP server"**

- Verify Node.js is installed and in PATH
- Check that the Mapbox token is valid
- Try using local build instead of npx

**Error: "Tool execution failed"**

- Check MCP server logs for detailed errors
- Verify the tool parameters are correct
- Ensure the Mapbox token has required permissions

### LangGraph Issues

**Error: "Agent exceeded maximum iterations"**

- Increase max_iterations parameter in agent creation
- Simplify the query to require fewer tool calls
- Check if the agent is stuck in a loop

```python
agent = create_agent(model, tools, max_iterations=15)
```

**Error: "AsyncIO event loop issues"**

- Make sure you're using `asyncio.run()` for the main function
- Don't mix sync and async code without proper bridging
- Use `await` for all async operations

### Performance

For better performance:

- Use streaming for long responses
- Enable checkpointing only when needed
- Use lighter models for simple queries (e.g., gpt-4o-mini vs gpt-4o)
- Cache tool results when appropriate

## Learn More

- **LangGraph Documentation**: https://langchain-ai.github.io/langgraph/
- **LangChain MCP Adapters**: https://github.com/langchain-ai/langchain-mcp-adapters
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io
- **Mapbox APIs**: https://docs.mapbox.com/

## Support

For issues specific to:

- **LangGraph**: https://github.com/langchain-ai/langgraph/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
- **Mapbox APIs**: https://support.mapbox.com/
