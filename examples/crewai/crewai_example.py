"""
CrewAI + Mapbox MCP Server Example

This example demonstrates how to use the Mapbox MCP server with CrewAI,
a framework for orchestrating multiple AI agents working collaboratively.

Learn more about CrewAI: https://docs.crewai.com
"""

import os
from typing import Optional
from pydantic import BaseModel, Field
from crewai import Agent, Task, Crew, Process
from crewai.mcp import MCPServerStdio


# Pydantic model for structured location output
class Location(BaseModel):
    """Structured location data with coordinates and address information."""
    name: str = Field(description="Name of the location")
    latitude: float = Field(description="Latitude coordinate")
    longitude: float = Field(description="Longitude coordinate")
    address: Optional[str] = Field(default=None, description="Full address")
    country: Optional[str] = Field(default=None, description="Country name")
    description: Optional[str] = Field(default=None, description="Brief description")


def get_mapbox_mcp_config(connection_type: str = "node"):
    """
    Configure the Mapbox MCP server connection.

    Supported connection types:
    - node: Use local build from repository (default for this example)
    - npx: Use published npm package

    Args:
        connection_type: The type of connection to use

    Returns:
        MCPServerStdio configuration for Mapbox
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
            command="node",
            args=[script_path],
            env=env
        )

    elif connection_type == "npx":
        # Use published npm package (uncomment to use)
        return MCPServerStdio(
            command="npx",
            args=["-y", "@mapbox/mcp-server"],
            env=env
        )

    else:
        raise ValueError(f"Unknown connection type: {connection_type}")


def create_travel_planner_agent(mcp_config):
    """
    Create a travel planning agent with access to Mapbox tools.

    This agent specializes in:
    - Finding locations and addresses
    - Planning routes and calculating travel times
    - Discovering points of interest

    Args:
        mcp_config: MCP server configuration

    Returns:
        A CrewAI Agent with Mapbox capabilities
    """
    return Agent(
        role="Travel Planner",
        goal="Help users plan optimal travel routes and discover interesting places",
        backstory="""You are an expert travel planner with deep knowledge of geography
        and navigation. You excel at finding the best routes, discovering great places
        to visit, and calculating accurate travel times. You use Mapbox's powerful
        geospatial tools to provide precise, helpful information.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def create_location_researcher_agent(mcp_config):
    """
    Create a location research agent with access to Mapbox tools.

    This agent specializes in:
    - Researching locations and addresses
    - Finding points of interest by category
    - Analyzing geographic areas

    Args:
        mcp_config: MCP server configuration

    Returns:
        A CrewAI Agent with Mapbox capabilities
    """
    return Agent(
        role="Location Researcher",
        goal="Research and analyze locations, addresses, and points of interest",
        backstory="""You are a meticulous location researcher who excels at finding
        detailed information about places, addresses, and geographic areas. You use
        Mapbox's comprehensive geospatial data to provide accurate, relevant information
        about any location in the world.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def create_map_visualizer_agent(mcp_config):
    """
    Create a map visualization agent with access to Mapbox tools.

    This agent specializes in:
    - Creating static map images
    - Visualizing routes and areas
    - Generating isochrone maps

    Args:
        mcp_config: MCP server configuration

    Returns:
        A CrewAI Agent with Mapbox capabilities
    """
    return Agent(
        role="Map Visualizer",
        goal="Create visual representations of geographic data and routes",
        backstory="""You are a skilled cartographer who specializes in creating
        beautiful, informative maps. You use Mapbox's visualization tools to generate
        static map images, route visualizations, and reachability maps that help
        users understand geographic information at a glance.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def example_single_agent():
    """
    Example 1: Single agent performing a simple task.

    Demonstrates using a single agent to answer a location query.
    """
    print("\n" + "="*60)
    print("EXAMPLE 1: Single Agent - Find Coffee Shops")
    print("="*60 + "\n")

    # Configure MCP (uses local build by default)
    mcp_config = get_mapbox_mcp_config()

    # Create agent
    researcher = create_location_researcher_agent(mcp_config)

    # Create task
    task = Task(
        description="Find 3 highly-rated coffee shops near the Empire State Building in New York City",
        expected_output="A list of 3 coffee shops with their names, addresses, and brief descriptions",
        agent=researcher
    )

    # Create and run crew
    crew = Crew(
        agents=[researcher],
        tasks=[task],
        process=Process.sequential,
        verbose=True
    )

    result = crew.kickoff()
    print("\n" + "="*60)
    print("RESULT:")
    print("="*60)
    print(result)
    return result


def example_multi_agent_collaboration():
    """
    Example 2: Multiple agents collaborating on a complex task.

    Demonstrates how multiple agents work together to plan a trip.
    """
    print("\n" + "="*60)
    print("EXAMPLE 2: Multi-Agent Collaboration - Trip Planning")
    print("="*60 + "\n")

    # Configure MCP (uses local build by default)
    mcp_config = get_mapbox_mcp_config()

    # Create agents
    researcher = create_location_researcher_agent(mcp_config)
    planner = create_travel_planner_agent(mcp_config)
    visualizer = create_map_visualizer_agent(mcp_config)

    # Create tasks
    research_task = Task(
        description="""Research the following NYC landmarks:
        - Statue of Liberty
        - Empire State Building
        - Central Park
        - Times Square

        Find their exact coordinates and any interesting nearby attractions.""",
        expected_output="Detailed information about each landmark with coordinates",
        agent=researcher
    )

    planning_task = Task(
        description="""Based on the research, create an optimal route visiting all 4 landmarks.
        Calculate the total travel time and distance. Consider traffic patterns.""",
        expected_output="An optimized route with travel times and distances between each location",
        agent=planner
    )

    visualization_task = Task(
        description="""Create a map visualization showing the recommended route with all
        landmarks marked. Make it clear and easy to understand.""",
        expected_output="A description of the map created with the route visualization",
        agent=visualizer
    )

    # Create and run crew
    crew = Crew(
        agents=[researcher, planner, visualizer],
        tasks=[research_task, planning_task, visualization_task],
        process=Process.sequential,  # Tasks executed in order
        verbose=True
    )

    result = crew.kickoff()
    print("\n" + "="*60)
    print("RESULT:")
    print("="*60)
    print(result)
    return result


def example_parallel_processing():
    """
    Example 3: Parallel processing with multiple agents.

    Demonstrates how agents can work on different tasks simultaneously.
    """
    print("\n" + "="*60)
    print("EXAMPLE 3: Parallel Processing - Multi-City Research")
    print("="*60 + "\n")

    # Configure MCP (uses local build by default)
    mcp_config = get_mapbox_mcp_config()

    # Create multiple researcher agents (could be different specializations)
    researcher1 = create_location_researcher_agent(mcp_config)
    researcher2 = create_location_researcher_agent(mcp_config)
    researcher3 = create_location_researcher_agent(mcp_config)

    # Create parallel tasks
    task1 = Task(
        description="Research the top 3 restaurants in downtown San Francisco",
        expected_output="List of 3 restaurants with details",
        agent=researcher1
    )

    task2 = Task(
        description="Research the top 3 museums in New York City",
        expected_output="List of 3 museums with details",
        agent=researcher2
    )

    task3 = Task(
        description="Research the top 3 beaches in Los Angeles",
        expected_output="List of 3 beaches with details",
        agent=researcher3
    )

    # Create and run crew with parallel processing
    crew = Crew(
        agents=[researcher1, researcher2, researcher3],
        tasks=[task1, task2, task3],
        process=Process.sequential,  # Note: For true parallel, use Process.parallel if available
        verbose=True
    )

    result = crew.kickoff()
    print("\n" + "="*60)
    print("RESULT:")
    print("="*60)
    print(result)
    return result


def example_reachability_analysis():
    """
    Example 4: Complex analysis using multiple tools.

    Demonstrates using isochrone and matrix tools for reachability analysis.
    """
    print("\n" + "="*60)
    print("EXAMPLE 4: Reachability Analysis")
    print("="*60 + "\n")

    # Configure MCP (uses local build by default)
    mcp_config = get_mapbox_mcp_config()

    # Create specialized agent
    planner = create_travel_planner_agent(mcp_config)

    # Create task
    task = Task(
        description="""Analyze the reachability from downtown Seattle:
        1. Show areas reachable within 15, 30, and 45 minutes by car
        2. Find which major landmarks are within each time zone
        3. Calculate exact travel times to Space Needle, Pike Place Market, and University of Washington

        Provide a comprehensive analysis of the results.""",
        expected_output="Detailed reachability analysis with travel times to specific landmarks",
        agent=planner
    )

    # Create and run crew
    crew = Crew(
        agents=[planner],
        tasks=[task],
        process=Process.sequential,
        verbose=True
    )

    result = crew.kickoff()
    print("\n" + "="*60)
    print("RESULT:")
    print("="*60)
    print(result)
    return result


def example_structured_output():
    """
    Example 5: Structured output using Pydantic models.

    This demonstrates how to use CrewAI with structured output where
    the task returns a validated Pydantic model instead of plain text.
    """
    print("\n" + "="*60)
    print("EXAMPLE 5: Structured Output with Pydantic Model")
    print("="*60 + "\n")

    # Configure MCP (uses local build by default)
    mcp_config = get_mapbox_mcp_config()

    # Create agent
    researcher = create_location_researcher_agent(mcp_config)

    # Create task with structured output
    task = Task(
        description="""Find the Palace of Culture and Science in Warsaw, Poland.
        Use the Mapbox tools to get accurate location information including:
        - Exact name
        - Coordinates (latitude and longitude)
        - Full address
        - Country
        - A brief description of the landmark

        Return this information in a structured format.""",
        expected_output="Structured location data with all fields populated",
        agent=researcher,
        output_pydantic=Location  # Specify the Pydantic model for structured output
    )

    # Create and run crew
    crew = Crew(
        agents=[researcher],
        tasks=[task],
        process=Process.sequential,
        verbose=True
    )

    result = crew.kickoff()

    print("\n" + "="*60)
    print("STRUCTURED RESULT (Location object):")
    print("="*60)

    # The result is now a Pydantic model
    location: Location = result.pydantic

    print(f"Name: {location.name}")
    print(f"Coordinates: ({location.latitude}, {location.longitude})")
    if location.address:
        print(f"Address: {location.address}")
    if location.country:
        print(f"Country: {location.country}")
    if location.description:
        print(f"Description: {location.description}")

    print(f"\nFully typed object: {location}")
    print("="*60)

    return location


def main():
    """
    Run all examples demonstrating different CrewAI patterns with Mapbox MCP.
    """
    print("CrewAI + Mapbox MCP Server Examples")
    print("="*60)

    # Verify environment
    if not os.environ.get("MAPBOX_ACCESS_TOKEN"):
        print("ERROR: MAPBOX_ACCESS_TOKEN environment variable not set")
        print("Get your token at https://account.mapbox.com/")
        return

    # Run examples (comment out ones you don't want to run)

    # Example 1: Single agent
    example_single_agent()

    # Example 2: Multi-agent collaboration
    # Uncomment to run:
    # example_multi_agent_collaboration()

    # Example 3: Parallel processing
    # Uncomment to run:
    # example_parallel_processing()

    # Example 4: Reachability analysis
    # Uncomment to run:
    # example_reachability_analysis()

    # Example 5: Structured output
    # This demonstrates Pydantic model output
    example_structured_output()


if __name__ == "__main__":
    main()
