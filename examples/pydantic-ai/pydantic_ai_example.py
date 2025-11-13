"""
Pydantic AI + Mapbox MCP Server Example

This example demonstrates how to use the Mapbox MCP server with Pydantic AI,
a modern, type-safe Python framework for building production-grade AI applications.

Learn more about Pydantic AI: https://ai.pydantic.dev
"""

import asyncio
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.anthropic import AnthropicModel

# Load environment variables from .env file
load_dotenv()


# Pydantic model for structured location output
class Location(BaseModel):
    """Structured location data with coordinates and address information."""
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    country: str | None = None
    description: str | None = None


def get_mcp_server(connection_type: str = "node"):
    """
    Configure the Mapbox MCP server connection.

    Supported connection types:
    - node: Use local build from repository (default for this example)
    - npx: Use published npm package

    Args:
        connection_type: The type of connection to use

    Returns:
        MCPServerStdio instance configured for Mapbox
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

        return MCPServerStdio(
            "node",
            args=[script_path],
            env=env,
            timeout=30
        )

    elif connection_type == "npx":
        # Use published npm package
        return MCPServerStdio(
            "npx",
            args=["-y", "@mapbox/mcp-server"],
            env=env,
            timeout=30
        )

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
        A Pydantic AI model instance
    """
    if model_type == "openai":
        return OpenAIChatModel("gpt-4o-mini")
    elif model_type == "anthropic":
        return AnthropicModel("claude-3-7-sonnet-latest")
    else:
        raise ValueError(f"Unknown model type: {model_type}")


async def run_example(
    query: str,
    model_type: str = "openai",
    connection_type: str = "node"
):
    """
    Run an example query using the Mapbox MCP server with Pydantic AI.

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

    # Configure the MCP server
    mcp_server = get_mcp_server(connection_type)

    # Create agent with Mapbox tools
    agent = Agent(
        model,
        system_prompt="""You are a helpful travel and location assistant with access to
        Mapbox's geospatial tools. You can help users find locations, plan routes,
        calculate travel times, and visualize maps. Always provide clear, accurate
        information and use the appropriate tools to answer questions.""",
        toolsets=[mcp_server]
    )

    # Run the query
    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")

    result = await agent.run(query)

    print(f"\n{'='*60}")
    print("Result:")
    print(f"{'='*60}")
    print(result.output)

    return result.output


async def run_structured_example(
    query: str,
    model_type: str = "openai",
    connection_type: str = "node"
):
    """
    Run an example query with structured output using Pydantic models.

    This demonstrates Pydantic AI's type-safe structured output feature,
    where the LLM response is automatically validated against a Pydantic model.

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

    # Configure the MCP server
    mcp_server = get_mcp_server(connection_type)

    # Create agent with Mapbox tools and structured output
    agent = Agent(
        model,
        output_type=Location,  # Specify the Pydantic model for structured output
        system_prompt="""You are a location expert with access to Mapbox's geospatial tools.
        When asked about a location, use the available tools to find accurate information
        and return it in a structured format with coordinates, address, and description.""",
        toolsets=[mcp_server]
    )

    # Run the query
    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")

    result = await agent.run(query)

    print(f"\n{'='*60}")
    print("Structured Result (Location object):")
    print(f"{'='*60}")

    # Access the validated, typed Pydantic model
    location: Location = result.output

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

    print("Mapbox MCP Server + Pydantic AI Example")
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
    # print("\n" + "="*60)
    # print("Example 2: Get driving directions")
    # print("="*60)
    # await run_example(
    #     "Get driving directions from Times Square, New York to Central Park, New York",
    #     model_type=MODEL_TYPE,
    #     connection_type=CONNECTION_TYPE
    # )

    # Example 3: Search for places
    # Uncomment to run:
    # print("\n" + "="*60)
    # print("Example 3: Find restaurants")
    # print("="*60)
    # await run_example(
    #     "Find 3 restaurants near the Colosseum in Rome",
    #     model_type=MODEL_TYPE,
    #     connection_type=CONNECTION_TYPE
    # )

    # Example 4: Structured output with Pydantic model
    # This demonstrates type-safe, validated output
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
