"""
Warsaw, Poland - Mapbox MCP Server Demo (LangGraph)

This example demonstrates the Mapbox MCP server with LangGraph using
landmarks and locations in Warsaw, Poland. Perfect for demos and talks!

Learn more about LangGraph: https://langchain-ai.github.io/langgraph/
"""

import asyncio
import os
from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

# Load environment variables from .env file
load_dotenv()


def get_mcp_config():
    """Configure the Mapbox MCP server connection."""
    mapbox_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not mapbox_token:
        raise EnvironmentError(
            "MAPBOX_ACCESS_TOKEN environment variable is required. "
            "Get your token at https://account.mapbox.com/"
        )

    # Use local build from repository
    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, "..", "..", "dist", "esm", "index.js")

    return {
        "mapbox": {
            "transport": "stdio",
            "command": "node",
            "args": [script_path],
            "env": {"MAPBOX_ACCESS_TOKEN": mapbox_token},
        }
    }


async def find_landmark(agent, landmark_name: str):
    """Find a Warsaw landmark."""
    print(f"\n{'='*70}")
    print(f"🔍 Finding: {landmark_name}")
    print(f"{'='*70}\n")

    result = await agent.ainvoke({
        "messages": [{
            "role": "user",
            "content": f"Find {landmark_name} in Warsaw, Poland. Provide the coordinates and address."
        }]
    })

    response = result["messages"][-1].content
    print(response)
    return response


async def get_directions(agent, origin: str, destination: str):
    """Get directions between two locations."""
    print(f"\n{'='*70}")
    print(f"🗺️  Route: {origin} → {destination}")
    print(f"{'='*70}\n")

    result = await agent.ainvoke({
        "messages": [{
            "role": "user",
            "content": (
                f"Get walking directions from {origin} to {destination} in Warsaw, Poland. "
                f"Include the distance and estimated travel time."
            )
        }]
    })

    response = result["messages"][-1].content
    print(response)
    return response


async def find_nearby_places(agent, location: str, category: str):
    """Find places near a location."""
    print(f"\n{'='*70}")
    print(f"🔎 Finding {category} near {location}")
    print(f"{'='*70}\n")

    result = await agent.ainvoke({
        "messages": [{
            "role": "user",
            "content": (
                f"Find 3-5 {category} near {location} in Warsaw, Poland. "
                f"Include names and brief descriptions."
            )
        }]
    })

    response = result["messages"][-1].content
    print(response)
    return response


async def main():
    """
    Demo scenarios for Warsaw, Poland.

    This showcases various Mapbox MCP capabilities using Warsaw landmarks
    that would be familiar to a Polish audience.
    """
    print("="*70)
    print("🇵🇱 Warsaw, Poland - Mapbox MCP Server Demo (LangGraph)")
    print("="*70)

    # Configure MCP and create agent
    mcp_config = get_mcp_config()
    client = MultiServerMCPClient(mcp_config)
    tools = await client.get_tools()

    print(f"\nLoaded {len(tools)} tools from Mapbox MCP server")

    model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    agent = create_agent(model, tools)

    # Scenario 1: Find famous Warsaw landmarks
    print("\n" + "="*70)
    print("SCENARIO 1: Famous Warsaw Landmarks")
    print("="*70)

    landmarks = [
        "Palace of Culture and Science",  # Pałac Kultury i Nauki
        "Royal Castle",                    # Zamek Królewski
        "Old Town Market Square"           # Rynek Starego Miasta
    ]

    for landmark in landmarks:
        await find_landmark(agent, landmark)
        await asyncio.sleep(1)  # Brief pause between requests

    # Scenario 2: Get directions between landmarks
    print("\n" + "="*70)
    print("SCENARIO 2: Navigate Between Landmarks")
    print("="*70)

    await get_directions(
        agent,
        "Old Town Market Square",
        "Royal Castle"
    )

    # Scenario 3: Find nearby places
    print("\n" + "="*70)
    print("SCENARIO 3: Discover Nearby Places")
    print("="*70)

    await find_nearby_places(
        agent,
        "Palace of Culture and Science",
        "cafes"
    )

    # Scenario 4: Find more specific locations
    print("\n" + "="*70)
    print("SCENARIO 4: Additional Warsaw Locations")
    print("="*70)

    other_locations = [
        "Lazienki Park",        # Łazienki Park
        "Wilanow Palace",       # Pałac w Wilanowie
        "Warsaw Uprising Museum"
    ]

    for location in other_locations:
        await find_landmark(agent, location)
        await asyncio.sleep(1)

    print("\n" + "="*70)
    print("✅ Demo Complete!")
    print("="*70)
    print("\nThese examples demonstrate:")
    print("• Location search and geocoding")
    print("• Turn-by-turn directions")
    print("• Point of interest discovery")
    print("• ReAct agent pattern with LangGraph")
    print("• MCP integration with LangChain ecosystem")


if __name__ == "__main__":
    asyncio.run(main())
