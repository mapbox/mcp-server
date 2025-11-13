# Mapbox MCP Server - Agent Framework Examples

This directory contains examples demonstrating how to integrate the Mapbox MCP server with popular AI agent frameworks. Each example shows how to leverage Mapbox's geospatial intelligence within different agent architectures and programming paradigms.

## Overview

The Mapbox MCP server provides AI agents with powerful location intelligence capabilities including:

- **Geocoding**: Convert addresses to coordinates and vice versa
- **Search**: Find points of interest and search for places
- **Directions**: Get multi-modal routing with real-time traffic
- **Matrix**: Calculate travel times between multiple locations
- **Isochrone**: Visualize reachable areas within time/distance constraints
- **Static Maps**: Generate map images with routes and markers

## Available Examples

### 1. [Mastra](./mastra/) - TypeScript Framework

**Language**: TypeScript
**Best For**: Production-ready TypeScript applications with modern tooling

Mastra is a comprehensive TypeScript framework that provides:

- Model routing to 40+ LLM providers
- Autonomous agents with tool access
- Workflow orchestration with graph-based execution
- Native MCP integration

**Quick Start** (requires Node.js 20.6+):

```bash
# Build the MCP server first (from repo root)
npm install && npm run build

# Run the example
cd examples/mastra
npm install
echo "MAPBOX_ACCESS_TOKEN=your_token" > .env
echo "OPENAI_API_KEY=your_key" >> .env
npm start
```

**Key Features**:

- Type-safe agent development
- Seamless MCP tool integration
- Support for both static and dynamic tool configuration
- Production-ready with observability

[📚 View Mastra Example →](./mastra/)

---

### 2. [CrewAI](./crewai/) - Multi-Agent Orchestration

**Language**: Python
**Best For**: Complex workflows requiring multiple specialized agents

CrewAI is a framework for orchestrating multiple AI agents that provides:

- Multi-agent collaboration
- Task delegation between agents
- Sequential and parallel processing
- Role-based agent specialization

**Quick Start**:

```bash
cd crewai
pip install -r requirements.txt
export MAPBOX_ACCESS_TOKEN="your_token"
export OPENAI_API_KEY="your_key"
python crewai_example.py
```

**Key Features**:

- Multiple agents working together
- Specialized roles (researcher, planner, visualizer)
- Task dependencies and workflows
- Memory and context management

[📚 View CrewAI Example →](./crewai/)

---

### 3. [LangGraph](./langgraph/) - Workflow-Based Stateful Agents

**Language**: Python
**Best For**: Production agents requiring complex workflows and state management

LangGraph is a framework for building stateful, multi-actor applications with LLMs that provides:

- Workflow-based agent development
- Sophisticated state management
- Complex branching logic
- Part of the LangChain ecosystem

**Quick Start**:

```bash
# Build the MCP server first (from repo root)
npm install && npm run build

# Run the example
cd examples/langgraph
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export MAPBOX_ACCESS_TOKEN="your_token"
export OPENAI_API_KEY="your_key"
python langgraph_example.py
```

**Key Features**:

- ReAct agent pattern support
- Custom workflow graphs
- Checkpointing and persistence
- Streaming and async support

[📚 View LangGraph Example →](./langgraph/)

---

### 4. [Pydantic AI](./pydantic-ai/) - Type-Safe Python Framework

**Language**: Python
**Best For**: Production applications requiring type safety and validation

Pydantic AI is a modern Python framework for building AI applications that provides:

- Type-safe, validated interactions with LLMs
- Leverages Pydantic's validation system
- Structured output support
- Production-ready design patterns

**Quick Start**:

```bash
# Build the MCP server first (from repo root)
npm install && npm run build

# Run the example
cd examples/pydantic-ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export MAPBOX_ACCESS_TOKEN="your_token"
export OPENAI_API_KEY="your_key"
python pydantic_ai_example.py
```

**Key Features**:

- Strong typing with Pydantic models
- Automatic validation
- Dependency injection
- Streaming responses

[📚 View Pydantic AI Example →](./pydantic-ai/)

---

## Comparison Matrix

| Feature               | Mastra     | CrewAI | LangGraph   | Pydantic AI |
| --------------------- | ---------- | ------ | ----------- | ----------- |
| **Language**          | TypeScript | Python | Python      | Python      |
| **Complexity**        | Medium     | High   | High        | Low-Medium  |
| **Multi-Agent**       | ✓          | ✓✓     | ✓           | ✗           |
| **Workflows**         | ✓✓         | ✓      | ✓✓          | ✓           |
| **State Management**  | ✓          | ✓      | ✓✓          | ✓           |
| **Type Safety**       | ✓✓         | ✗      | ✗           | ✓✓          |
| **Learning Curve**    | Medium     | Medium | High        | Low         |
| **Production Ready**  | ✓✓         | ✓✓     | ✓✓          | ✓✓          |
| **MCP Integration**   | Native     | Native | Via Adapter | Native      |
| **Structured Output** | ✓          | ✓      | ✓           | ✓✓          |

## Choosing the Right Framework

### Choose **Mastra** if you:

- Prefer TypeScript and strong typing
- Need production-ready infrastructure
- Want comprehensive workflow orchestration
- Are building web applications with Next.js/React
- Need enterprise-grade features

### Choose **CrewAI** if you:

- Need multiple agents working together
- Have complex workflows with task dependencies
- Want role-based specialization
- Need hierarchical task delegation
- Are building sophisticated automation systems

### Choose **LangGraph** if you:

- Need sophisticated state management
- Want to build custom agent workflows
- Are already using LangChain ecosystem
- Require advanced control flow and branching
- Need checkpointing and conversation persistence

### Choose **Pydantic AI** if you:

- Require strong type safety and validation
- Want structured, validated output
- Need production-ready patterns
- Prefer a modern, Pythonic API
- Value automatic data validation

## Common Use Cases

### Travel Planning

All frameworks can handle:

- Finding restaurants and hotels
- Planning optimal routes
- Calculating travel times
- Generating map visualizations

**Best Choice**: CrewAI for complex multi-stop itineraries, Pydantic AI for quick validated queries

### Location Intelligence

All frameworks can handle:

- Geocoding addresses
- Reverse geocoding coordinates
- POI discovery
- Area analysis

**Best Choice**: Mastra for production APIs, Pydantic AI for type-safe data analysis

### Logistics & Optimization

All frameworks can handle:

- Route optimization
- Travel time matrices
- Reachability analysis
- Multi-location planning

**Best Choice**: LangGraph for stateful workflows, Mastra for real-time applications

## Prerequisites

### All Examples Require:

1. **Mapbox Access Token**

   - Sign up at [mapbox.com/signup](https://www.mapbox.com/signup/)
   - Get your token at [account.mapbox.com](https://account.mapbox.com/)

2. **LLM API Key**

   - OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Anthropic: [console.anthropic.com](https://console.anthropic.com/)
   - Or use local models with Ollama

3. **Node.js** (for Mastra and MCP server)

   - Version 20.6 or higher (for Mastra's built-in .env support)
   - Version 18+ works for MCP server only
   - Download from [nodejs.org](https://nodejs.org/)

4. **Python** (for CrewAI, LangGraph, and Pydantic AI)
   - Version 3.10 to 3.13 (Python 3.14 not yet supported)
   - Download from [python.org](https://python.org/)
   - Virtual environment recommended for all Python examples

## MCP Server Connection Options

All examples support multiple ways to connect to the Mapbox MCP server:

### Option 1: Published Package (Recommended)

Use the published npm package via npx:

```bash
# No installation needed - runs directly
npx -y @mapbox/mcp-server
```

### Option 2: Local Development

Use a local build of the MCP server:

```bash
# From the repository root
npm run build
# Then reference: dist/esm/index.js
```

### Option 3: Hosted Endpoint

Use the hosted MCP endpoint:

```
https://mcp.mapbox.com/mcp
```

## Environment Variables

All examples use these environment variables:

```bash
# Required
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here

# Choose one LLM provider:
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here
```

## Example Queries

Try these queries with any framework:

### Basic Location Queries

- "Find coffee shops near the Empire State Building"
- "What's the address of the Golden Gate Bridge?"
- "Search for gas stations along I-5 in California"

### Navigation Queries

- "How long does it take to drive from LAX to Santa Monica?"
- "Get walking directions from Central Park to Times Square"
- "What's the fastest route from Boston to New York?"

### Analysis Queries

- "Show areas reachable within 30 minutes of downtown Seattle"
- "Calculate travel times between these 5 hotels and the convention center"
- "Find the optimal order to visit these 4 tourist attractions"

### Visualization Queries

- "Create a map showing the route from Big Ben to the Eiffel Tower"
- "Generate a map with markers at all Starbucks in downtown San Francisco"

## Advanced Topics

### Multi-Tenancy

For applications serving multiple users, see:

- [Mastra dynamic tools](./mastra/README.md#dynamic-tools-with-multi-tenant-support)

### Custom Agent Instructions

Tailor agents for specific use cases:

- [Mastra custom instructions](./mastra/README.md#custom-agent-instructions)
- [CrewAI agent specializations](./crewai/README.md#agent-specializations)

### Error Handling

Robust error handling patterns:

- [Smolagents troubleshooting](./smolagents/README.md#troubleshooting)
- [CrewAI callbacks](./crewai/README.md#callbacks)

### Performance Optimization

Tips for production deployments:

- Use lighter models (gpt-4o-mini vs gpt-4)
- Implement caching for repeated queries
- Monitor API usage and costs
- Use local models for development

## Resources

### Documentation

- **Mapbox MCP Server**: [github.com/mapbox/mcp-server](https://github.com/mapbox/mcp-server)
- **Mapbox APIs**: [docs.mapbox.com](https://docs.mapbox.com/)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)

### Framework Documentation

- **Mastra**: [mastra.ai/docs](https://mastra.ai/docs)
- **CrewAI**: [docs.crewai.com](https://docs.crewai.com/)
- **LangGraph**: [langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph/)
- **Pydantic AI**: [ai.pydantic.dev](https://ai.pydantic.dev)

### Community

- **GitHub Issues**: [github.com/mapbox/mcp-server/issues](https://github.com/mapbox/mcp-server/issues)
- **Email Support**: mcp-feedback@mapbox.com

## Contributing

Found an issue or want to contribute an example for another framework?

1. Open an issue describing the problem or proposed example
2. Fork the repository
3. Create a new directory under `examples/`
4. Include: README.md, working code, dependencies, .env.example
5. Submit a pull request

Popular frameworks we'd love to see examples for:

- AutoGPT
- Semantic Kernel
- Haystack
- LlamaIndex
- Autogen
- Agency Swarm

## License

These examples are provided under the same license as the Mapbox MCP Server. See [LICENSE.md](../LICENSE.md) for details.

---

**Need Help?**

- 📧 Email: mcp-feedback@mapbox.com
- 🐛 Issues: [github.com/mapbox/mcp-server/issues](https://github.com/mapbox/mcp-server/issues)
- 📚 Docs: [github.com/mapbox/mcp-server](https://github.com/mapbox/mcp-server)
