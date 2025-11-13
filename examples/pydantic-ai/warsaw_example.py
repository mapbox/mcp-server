"""
Warsaw, Poland - Mapbox MCP Server Demo

This example demonstrates the Mapbox MCP server with Pydantic AI using
landmarks and locations in Warsaw, Poland. Perfect for demos and talks!

Learn more about Pydantic AI: https://ai.pydantic.dev
"""

import asyncio
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.models.openai import OpenAIChatModel

# Load environment variables from .env file
load_dotenv()


# Pydantic model for structured location output
class Location(BaseModel):
    """Structured location data with coordinates and details."""
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    description: str | None = None


def get_mcp_server():
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

    return MCPServerStdio(
        "node",
        args=[script_path],
        env={"MAPBOX_ACCESS_TOKEN": mapbox_token},
        timeout=30
    )


async def find_landmark(landmark_name: str) -> Location:
    """
    Find a Warsaw landmark and return structured location data.

    Args:
        landmark_name: Name of the landmark to find

    Returns:
        Location object with coordinates and details
    """
    print(f"\n{'='*70}")
    print(f"🔍 Finding: {landmark_name}")
    print(f"{'='*70}\n")

    mcp_server = get_mcp_server()

    agent = Agent(
        OpenAIChatModel("gpt-4o-mini"),
        output_type=Location,
        system_prompt="""You are a Warsaw tourism expert with access to Mapbox tools.
        Find accurate location information and return structured data.""",
        toolsets=[mcp_server]
    )

    result = await agent.run(f"Find {landmark_name} in Warsaw, Poland")
    location = result.output

    print(f"📍 {location.name}")
    print(f"   Coordinates: {location.latitude:.6f}, {location.longitude:.6f}")
    if location.address:
        print(f"   Address: {location.address}")
    if location.description:
        print(f"   {location.description}")

    return location


async def get_directions(origin: str, destination: str) -> str:
    """
    Get directions between two locations in Warsaw.

    Args:
        origin: Starting location
        destination: Ending location

    Returns:
        Directions as text
    """
    print(f"\n{'='*70}")
    print(f"🗺️  Route: {origin} → {destination}")
    print(f"{'='*70}\n")

    mcp_server = get_mcp_server()

    agent = Agent(
        OpenAIChatModel("gpt-4o-mini"),
        system_prompt="""You are a navigation expert with access to Mapbox tools.
        Provide clear, helpful directions including travel time and distance.""",
        toolsets=[mcp_server]
    )

    result = await agent.run(
        f"Get walking directions from {origin} to {destination} in Warsaw, Poland. "
        f"Include the distance and estimated travel time."
    )

    print(result.output)
    return result.output


async def find_nearby_places(location: str, category: str) -> str:
    """
    Find places near a location in Warsaw.

    Args:
        location: The location to search near
        category: Type of place to find (e.g., "restaurants", "cafes", "museums")

    Returns:
        List of places as text
    """
    print(f"\n{'='*70}")
    print(f"🔎 Finding {category} near {location}")
    print(f"{'='*70}\n")

    mcp_server = get_mcp_server()

    agent = Agent(
        OpenAIChatModel("gpt-4o-mini"),
        system_prompt="""You are a local Warsaw guide with access to Mapbox tools.
        Find interesting places and provide helpful recommendations.""",
        toolsets=[mcp_server]
    )

    result = await agent.run(
        f"Find 3-5 {category} near {location} in Warsaw, Poland. "
        f"Include names and brief descriptions."
    )

    print(result.output)
    return result.output


async def main():
    """
    Demo scenarios for Warsaw, Poland.

    This showcases various Mapbox MCP capabilities using Warsaw landmarks
    that would be familiar to a Polish audience.
    """
    print("="*70)
    print("🇵🇱 Warsaw, Poland - Mapbox MCP Server Demo")
    print("="*70)

    # Scenario 1: Find famous Warsaw landmarks
    print("\n" + "="*70)
    print("SCENARIO 1: Famous Warsaw Landmarks")
    print("="*70)

    landmarks = [
        "Palace of Culture and Science",  # Pałac Kultury i Nauki
        "Royal Castle",                    # Zamek Królewski
        "Old Town Market Square"           # Rynek Starego Miasta
    ]

    landmark_locations = {}
    for landmark in landmarks:
        location = await find_landmark(landmark)
        landmark_locations[landmark] = location
        await asyncio.sleep(1)  # Brief pause between requests

    # Scenario 2: Get directions between landmarks
    print("\n" + "="*70)
    print("SCENARIO 2: Navigate Between Landmarks")
    print("="*70)

    await get_directions(
        "Old Town Market Square",
        "Royal Castle"
    )

    # Scenario 3: Find nearby places
    print("\n" + "="*70)
    print("SCENARIO 3: Discover Nearby Places")
    print("="*70)

    await find_nearby_places(
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
        await find_landmark(location)
        await asyncio.sleep(1)

    print("\n" + "="*70)
    print("✅ Demo Complete!")
    print("="*70)
    print("\nThese examples demonstrate:")
    print("• Location search and geocoding")
    print("• Structured output with Pydantic models")
    print("• Turn-by-turn directions")
    print("• Point of interest discovery")
    print("• Type-safe AI agents with MCP integration")


if __name__ == "__main__":
    asyncio.run(main())
