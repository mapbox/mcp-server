# CrewAI + Mapbox MCP Server Example

This example demonstrates how to integrate the Mapbox MCP server with [CrewAI](https://docs.crewai.com), a framework for orchestrating multiple AI agents working collaboratively.

## What is CrewAI?

CrewAI is a Python framework for building autonomous AI agent systems that:

- Orchestrate multiple specialized agents working together
- Enable agents to collaborate and delegate tasks
- Support both sequential and parallel processing
- Integrate seamlessly with external tools via MCP
- Provide high-level simplicity with low-level control

## Features

This example demonstrates:

- Single agent performing location-based tasks
- Multi-agent collaboration for complex trip planning
- Parallel processing with multiple agents
- Reachability analysis using multiple Mapbox tools
- Different agent specializations (researcher, planner, visualizer)

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
cd examples/crewai  # Return to example directory
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

5. Run the examples:

```bash
python crewai_example.py
```

**Note**: Remember to activate the virtual environment (`source venv/bin/activate`) whenever you work on this example.

## Usage

### Single Agent Example

```python
from crewai import Agent, Task, Crew
from crewai.mcp import MCPServerStdio

# Configure Mapbox MCP
mcp_config = MCPServerStdio(
    command="npx",
    args=["-y", "@mapbox/mcp-server"],
    env={"MAPBOX_ACCESS_TOKEN": "your_token"}
)

# Create agent with Mapbox tools
agent = Agent(
    role="Location Researcher",
    goal="Find and analyze locations",
    backstory="Expert at geographic research using Mapbox tools",
    mcps=[mcp_config],
    verbose=True
)

# Create and run task
task = Task(
    description="Find 3 coffee shops near Times Square",
    expected_output="List of 3 coffee shops with details",
    agent=agent
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
```

### Multi-Agent Collaboration

```python
# Create specialized agents
researcher = Agent(
    role="Location Researcher",
    goal="Research locations and POIs",
    mcps=[mcp_config],
    verbose=True
)

planner = Agent(
    role="Travel Planner",
    goal="Plan optimal routes",
    mcps=[mcp_config],
    verbose=True
)

visualizer = Agent(
    role="Map Visualizer",
    goal="Create map visualizations",
    mcps=[mcp_config],
    verbose=True
)

# Create sequential tasks
research_task = Task(
    description="Research NYC landmarks and find coordinates",
    agent=researcher
)

planning_task = Task(
    description="Plan optimal route visiting all landmarks",
    agent=planner
)

viz_task = Task(
    description="Create map showing the route",
    agent=visualizer
)

# Run crew
crew = Crew(
    agents=[researcher, planner, visualizer],
    tasks=[research_task, planning_task, viz_task],
    process=Process.sequential
)

result = crew.kickoff()
```

## Agent Specializations

The example includes three specialized agent types:

### 1. Location Researcher

- Researches locations and addresses
- Finds points of interest by category
- Analyzes geographic areas
- Uses: search_and_geocode, category_search, reverse_geocode

### 2. Travel Planner

- Plans optimal routes
- Calculates travel times
- Considers traffic patterns
- Uses: directions, matrix, isochrone

### 3. Map Visualizer

- Creates static map images
- Visualizes routes and areas
- Generates reachability maps
- Uses: static_map_image, isochrone

## Configuration Options

### MCP Connection Types

**NPX (Published Package - Default)**

```python
mcp_config = MCPServerStdio(
    command="npx",
    args=["-y", "@mapbox/mcp-server"],
    env={"MAPBOX_ACCESS_TOKEN": token}
)
```

**Local Development**

```python
mcp_config = MCPServerStdio(
    command="/path/to/node",
    args=["/path/to/dist/esm/index.js"],
    env={"MAPBOX_ACCESS_TOKEN": token}
)
```

### LLM Providers

**OpenAI (Default)**

```bash
export OPENAI_API_KEY="your_key"
```

**Anthropic Claude**

```bash
export ANTHROPIC_API_KEY="your_key"
# Configure in crew with model="claude-3-7-sonnet-latest"
```

**Google Gemini**

```bash
export GOOGLE_API_KEY="your_key"
# Configure in crew with model="gemini-pro"
```

## Available Examples

### Example 1: Single Agent

Demonstrates a single agent finding coffee shops near a landmark.

### Example 2: Multi-Agent Collaboration

Three agents work together to research, plan, and visualize a NYC trip.

### Example 3: Parallel Processing

Multiple agents research different cities simultaneously.

### Example 4: Reachability Analysis

Complex analysis using isochrone and matrix tools for travel time calculations.

## Process Types

### Sequential Process

Tasks are executed one after another, with each task potentially using outputs from previous tasks:

```python
crew = Crew(
    agents=[agent1, agent2, agent3],
    tasks=[task1, task2, task3],
    process=Process.sequential
)
```

### Hierarchical Process

Agents can delegate tasks to other agents:

```python
crew = Crew(
    agents=[manager, worker1, worker2],
    tasks=[task1, task2],
    process=Process.hierarchical,
    manager_llm="gpt-4"
)
```

## Advanced Features

### Custom Tools

You can create custom tools alongside MCP tools:

```python
from crewai_tools import tool

@tool
def custom_location_filter(results: list) -> list:
    """Filter location results based on custom criteria"""
    return [r for r in results if r.get('rating', 0) >= 4.0]

agent = Agent(
    role="Researcher",
    mcps=[mcp_config],
    tools=[custom_location_filter],
    verbose=True
)
```

### Memory and Context

Enable agent memory for context retention:

```python
crew = Crew(
    agents=[agent],
    tasks=[task],
    memory=True,  # Enable memory
    verbose=True
)
```

### Callbacks

Add callbacks to monitor agent execution:

```python
def task_callback(output):
    print(f"Task completed: {output}")

task = Task(
    description="Find restaurants",
    agent=agent,
    callback=task_callback
)
```

## Troubleshooting

### Installation Issues

**Error: "Building wheel for tiktoken (pyproject.toml) ... error" or similar build errors**

This usually means you're using **Python 3.14**, which is not yet supported. CrewAI requires `Python >=3.10 and <3.14`.

**Solution:**

```bash
# Remove current venv
rm -rf venv

# Check available Python versions
python3.13 --version  # Try 3.13
python3.12 --version  # Or 3.12
python3.11 --version  # Or 3.11

# Create venv with supported Python version
python3.13 -m venv venv  # Use 3.13, 3.12, or 3.11

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

**Error: "MCP server connection failed"**

- Verify MAPBOX_ACCESS_TOKEN is set
- Check Node.js is in PATH
- Try verbose=True for detailed logs

### Agent Issues

**Agents not using tools**

- Ensure `mcps` is configured correctly
- Check that MAPBOX_ACCESS_TOKEN is valid
- Verify the agent's goal and backstory guide it to use tools

**Tasks timeout or hang**

- Increase timeout in crew configuration
- Simplify task descriptions
- Break complex tasks into smaller subtasks

### Performance

**Slow execution**

- Use lighter models (e.g., gpt-4o-mini instead of gpt-4)
- Enable caching for repeated queries
- Optimize task descriptions to be more specific

**High API costs**

- Use streaming for long outputs
- Implement result caching
- Choose cost-effective models

## Example Queries

Try these task descriptions with your agents:

**Location Discovery**

- "Find the top 5 hotels near downtown San Francisco"
- "Research coffee shops within walking distance of Central Park"
- "What are the coordinates of the Eiffel Tower?"

**Route Planning**

- "Plan the fastest route from LAX to Santa Monica during rush hour"
- "Calculate travel times between these 5 landmarks in Boston"
- "What's the optimal order to visit 4 museums in NYC?"

**Analysis**

- "Analyze areas reachable within 30 minutes of downtown Portland"
- "Compare travel times from 3 airports to downtown Manhattan"
- "Find all gas stations along the route from Seattle to Portland"

**Visualization**

- "Create a map showing the route from the Golden Gate Bridge to Fisherman's Wharf"
- "Visualize a 15-minute driving radius from Times Square"

## Learn More

- **CrewAI Documentation**: https://docs.crewai.com
- **CrewAI MCP Integration**: https://docs.crewai.com/en/mcp/overview
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io
- **Mapbox APIs**: https://docs.mapbox.com/

## Support

For issues specific to:

- **CrewAI**: https://github.com/crewAIInc/crewAI/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
- **Mapbox APIs**: https://support.mapbox.com/
