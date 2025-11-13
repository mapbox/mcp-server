"""
LangGraph + Mapbox MCP Server Example

This example demonstrates how to use the Mapbox MCP server with LangGraph,
a workflow-based framework for building stateful AI agents.

Learn more about LangGraph: https://langchain-ai.github.io/langgraph/
"""

import asyncio
import os
from dotenv import load_dotenv
from typing import Optional
from pydantic import BaseModel, Field
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

# Load environment variables from .env file
load_dotenv()


# Pydantic model for structured location output
class Location(BaseModel):
    """Structured location data with coordinates and address information."""
    name: str = Field(description="Name of the location")
    latitude: float = Field(description="Latitude coordinate")
    longitude: float = Field(description="Longitude coordinate")
    address: Optional[str] = Field(default=None, description="Full address")
    country: Optional[str] = Field(default=None, description="Country name")
    description: Optional[str] = Field(default=None, description="Brief description")


def get_mcp_config(connection_type: str = "node"):
    """
    Configure the Mapbox MCP server connection.

    Supported connection types:
    - node: Use local build from repository (default for this example)
    - npx: Use published npm package

    Args:
        connection_type: The type of connection to use

    Returns:
        MCP server configuration dictionary
    """
    mapbox_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not mapbox_token:
        raise EnvironmentError(
            "MAPBOX_ACCESS_TOKEN environment variable is required. "
            "Get your token at https://account.mapbox.com/"
        )

    env = {"MAPBOX_ACCESS_TOKEN": mapbox_token}

    if connection_type == "node":
        # Use local build from repository (default for this example)
        # Make sure to run `npm run build` from the repository root first!
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, "..", "..", "dist", "esm", "index.js")

        return {
            "mapbox": {
                "transport": "stdio",
                "command": "node",
                "args": [script_path],
                "env": env,
            }
        }

    elif connection_type == "npx":
        # Use published npm package
        return {
            "mapbox": {
                "transport": "stdio",
                "command": "npx",
                "args": ["-y", "@mapbox/mcp-server"],
                "env": env,
            }
        }

    else:
        raise ValueError(f"Unknown connection type: {connection_type}")


def get_model(model_type: str = "openai"):
    """
    Configure the LLM model for the agent.

    Supported model types:
    - openai: Use OpenAI models (default)
    - anthropic: Use Anthropic Claude models

    Args:
        model_type: The type of model to use

    Returns:
        A LangChain chat model instance
    """
    if model_type == "openai":
        return ChatOpenAI(model="gpt-4o-mini", temperature=0)
    elif model_type == "anthropic":
        return ChatAnthropic(model="claude-3-7-sonnet-latest", temperature=0)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


async def run_example(
    query: str,
    model_type: str = "openai",
    connection_type: str = "node"
):
    """
    Run an example query using the Mapbox MCP server with LangGraph.

    Args:
        query: The question/task to give to the agent
        model_type: The LLM model type to use
        connection_type: The MCP server connection type

    Returns:
        The agent's response
    """
    print(f"\nConfiguring model: '{model_type}'")
    print(f"Connecting to MCP server: '{connection_type}'")

    # Configure the model
    model = get_model(model_type)

    # Configure the MCP server connection
    mcp_config = get_mcp_config(connection_type)

    # Connect to MCP and get tools
    # Note: As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient
    # cannot be used as a context manager
    client = MultiServerMCPClient(mcp_config)

    # Get all available tools from Mapbox MCP server
    tools = await client.get_tools()
    print(f"\nLoaded {len(tools)} tools from Mapbox MCP server")

    # Create the ReAct agent with Mapbox tools
    agent = create_agent(model, tools)

    # Run the query
    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")

    result = await agent.ainvoke({"messages": [{"role": "user", "content": query}]})

    print(f"\n{'='*60}")
    print("Result:")
    print(f"{'='*60}")

    # Extract the final message
    messages = result.get("messages", [])
    if messages:
        final_message = messages[-1]
        print(final_message.content)
        return final_message.content
    else:
        print("No response received")
        return None


async def run_structured_example(
    query: str,
    model_type: str = "openai",
    connection_type: str = "node"
):
    """
    Run an example query with structured output using Pydantic models.

    This demonstrates LangChain's structured output feature combined with
    MCP tools, where we first use tools to gather data, then structure it.

    Args:
        query: The question/task to give to the agent
        model_type: The LLM model type to use
        connection_type: The MCP server connection type

    Returns:
        A validated Location object
    """
    print(f"\nConfiguring model: '{model_type}'")
    print(f"Connecting to MCP server: '{connection_type}'")

    # Configure the model
    model = get_model(model_type)

    # Configure the MCP server connection
    mcp_config = get_mcp_config(connection_type)

    # Connect to MCP and get tools
    client = MultiServerMCPClient(mcp_config)
    tools = await client.get_tools()
    print(f"\nLoaded {len(tools)} tools from Mapbox MCP server")

    # Create structured output model
    structured_model = model.with_structured_output(Location)

    # Create the agent with tools
    agent = create_agent(model, tools)

    # Run the query with the agent to use tools
    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")

    # First, let agent gather data using tools
    print("Step 1: Agent gathering location data using MCP tools...")
    result = await agent.ainvoke({
        "messages": [{
            "role": "user",
            "content": f"{query}. Please use the search tools to find this location and provide detailed information."
        }]
    })

    # Extract the information
    messages = result.get("messages", [])
    if not messages:
        print("No response received")
        return None

    agent_response = messages[-1].content
    print(f"Agent found: {agent_response[:200]}...")

    # Now structure the output
    print("\nStep 2: Structuring the output into a Location object...")
    location = await structured_model.ainvoke(
        f"Based on this information, create a structured location object: {agent_response}"
    )

    print(f"\n{'='*60}")
    print("Structured Result (Location object):")
    print(f"{'='*60}")
    print(f"Name: {location.name}")
    print(f"Coordinates: ({location.latitude}, {location.longitude})")
    if location.address:
        print(f"Address: {location.address}")
    if location.country:
        print(f"Country: {location.country}")
    if location.description:
        print(f"Description: {location.description}")

    print(f"\nFully typed object: {location}")

    return location


async def main():
    """
    Run example queries demonstrating different Mapbox capabilities.
    """
    # Configuration
    MODEL_TYPE = "openai"  # Change to: openai, anthropic
    CONNECTION_TYPE = "node"   # Change to: node, npx (default: node for local build)

    print("Mapbox MCP Server + LangGraph Example")
    print("="*60)
    print(f"Model: {MODEL_TYPE}")
    print(f"Connection: {CONNECTION_TYPE}")
    print("="*60)

    # Example 1: Simple geocoding
    print("\n" + "="*60)
    print("Example 1: Find coordinates of a landmark")
    print("="*60)
    await run_example(
        "What are the coordinates of the Eiffel Tower in Paris?",
        model_type=MODEL_TYPE,
        connection_type=CONNECTION_TYPE
    )

    # Example 2: Get directions
    # Uncomment to run:
    print("\n" + "="*60)
    print("Example 2: Get driving directions")
    print("="*60)
    await run_example(
        "Get driving directions from Times Square, New York to Central Park, New York",
        model_type=MODEL_TYPE,
        connection_type=CONNECTION_TYPE
    )

    # Example 3: Search for places
    # Uncomment to run:
    print("\n" + "="*60)
    print("Example 3: Find restaurants")
    print("="*60)
    await run_example(
        "Find 3 restaurants near the Colosseum in Rome",
        model_type=MODEL_TYPE,
        connection_type=CONNECTION_TYPE
    )

    # Example 4: Structured output with Pydantic model
    # This demonstrates combining tool use with structured output
    print("\n" + "="*60)
    print("Example 4: Structured output - Find landmark with typed data")
    print("="*60)
    await run_structured_example(
        "Find the Palace of Culture and Science in Warsaw, Poland",
        model_type=MODEL_TYPE,
        connection_type=CONNECTION_TYPE
    )


if __name__ == "__main__":
    asyncio.run(main())
