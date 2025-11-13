"""
Warsaw, Poland - Mapbox MCP Server Demo (CrewAI)

This example demonstrates the Mapbox MCP server with CrewAI using
landmarks and locations in Warsaw, Poland. Perfect for demos and talks!

This showcases multi-agent collaboration where different agents work
together to plan a comprehensive Warsaw tour.

Learn more about CrewAI: https://docs.crewai.com
"""

import os
from crewai import Agent, Task, Crew, Process
from crewai.mcp import MCPServerStdio


def get_mapbox_mcp_config():
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
        command="node",
        args=[script_path],
        env={"MAPBOX_ACCESS_TOKEN": mapbox_token}
    )


def create_warsaw_researcher(mcp_config):
    """Create an agent specialized in researching Warsaw landmarks."""
    return Agent(
        role="Warsaw Landmarks Researcher",
        goal="Research and provide detailed information about Warsaw's famous landmarks",
        backstory="""You are an expert historian and tour guide specializing in Warsaw, Poland.
        You have deep knowledge of the city's history, culture, and famous landmarks including
        the Palace of Culture and Science, Royal Castle, Old Town, and more. You use Mapbox
        tools to find accurate locations and provide rich context about each landmark.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def create_route_planner(mcp_config):
    """Create an agent specialized in planning routes."""
    return Agent(
        role="Warsaw Route Planner",
        goal="Plan efficient routes between Warsaw landmarks considering walking times",
        backstory="""You are an expert city navigator who specializes in planning optimal
        walking routes through Warsaw. You understand the city's layout, pedestrian-friendly
        areas, and how to create enjoyable walking tours. You use Mapbox tools to calculate
        accurate routes and travel times.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def create_local_guide(mcp_config):
    """Create an agent specialized in finding local places."""
    return Agent(
        role="Warsaw Local Guide",
        goal="Find the best cafes, restaurants, and interesting spots near landmarks",
        backstory="""You are a local Warsaw resident who knows all the best places to eat,
        drink coffee, and experience authentic Polish culture. You help visitors discover
        hidden gems and popular spots near major landmarks using Mapbox's location data.""",
        mcps=[mcp_config],
        verbose=True,
        allow_delegation=False
    )


def warsaw_tour_planning_demo():
    """
    Demo: Plan a comprehensive Warsaw tour using multiple collaborating agents.

    This showcases how different specialized agents work together to:
    1. Research landmarks
    2. Plan routes
    3. Find nearby cafes and restaurants
    """
    print("="*70)
    print("🇵🇱 Warsaw, Poland - Multi-Agent Tour Planning Demo (CrewAI)")
    print("="*70)

    # Configure MCP
    mcp_config = get_mapbox_mcp_config()

    # Create specialized agents
    researcher = create_warsaw_researcher(mcp_config)
    route_planner = create_route_planner(mcp_config)
    local_guide = create_local_guide(mcp_config)

    print("\n" + "="*70)
    print("SCENARIO: Planning a Half-Day Warsaw Tour")
    print("="*70)
    print("\nOur crew of agents will collaborate to:")
    print("1. Research key landmarks")
    print("2. Plan an optimal walking route")
    print("3. Find cafes for breaks")
    print("="*70 + "\n")

    # Task 1: Research landmarks
    research_task = Task(
        description="""Research these famous Warsaw landmarks:
        - Palace of Culture and Science (Pałac Kultury i Nauki)
        - Old Town Market Square (Rynek Starego Miasta)
        - Royal Castle (Zamek Królewski)
        - Lazienki Park (Łazienki Królewskie)

        For each landmark, find:
        - Exact coordinates
        - Brief historical significance
        - Address

        Use Mapbox tools to get accurate location data.""",
        expected_output="Detailed information about each landmark with coordinates and addresses",
        agent=researcher
    )

    # Task 2: Plan the route
    route_task = Task(
        description="""Based on the researched landmarks, plan an optimal walking route that:
        - Starts at Palace of Culture and Science
        - Visits Old Town Market Square
        - Includes Royal Castle
        - Ends at Lazienki Park

        Calculate:
        - Walking distance between each stop
        - Estimated walking times
        - Total tour duration

        Consider creating a logical, efficient route that minimizes backtracking.""",
        expected_output="Complete walking route with distances, times, and turn-by-turn directions",
        agent=route_planner
    )

    # Task 3: Find cafes
    cafe_task = Task(
        description="""Find good cafes for tour breaks:
        - 2-3 cafes near Old Town Market Square
        - 1-2 cafes near Lazienki Park

        For each cafe, provide:
        - Name
        - Location relative to landmarks
        - Brief description

        These will be perfect spots for visitors to rest during the tour.""",
        expected_output="List of recommended cafes with locations and descriptions",
        agent=local_guide
    )

    # Create and run the crew
    crew = Crew(
        agents=[researcher, route_planner, local_guide],
        tasks=[research_task, route_task, cafe_task],
        process=Process.sequential,
        verbose=True
    )

    print("\n🚀 Starting multi-agent collaboration...\n")
    result = crew.kickoff()

    print("\n" + "="*70)
    print("✅ Tour Planning Complete!")
    print("="*70)
    print("\nFINAL TOUR PLAN:")
    print("="*70)
    print(result)
    print("="*70)

    print("\nThis demo showcased:")
    print("• Multi-agent collaboration (3 specialized agents)")
    print("• Location research and geocoding")
    print("• Route planning with walking directions")
    print("• Local point of interest discovery")
    print("• Sequential task processing")
    print("• MCP integration with CrewAI")

    return result


def simple_landmark_demo():
    """
    Simple demo: Find a single landmark using one agent.
    """
    print("\n" + "="*70)
    print("BONUS: Quick Landmark Lookup")
    print("="*70)

    mcp_config = get_mapbox_mcp_config()
    researcher = create_warsaw_researcher(mcp_config)

    task = Task(
        description="Find the Palace of Culture and Science in Warsaw and provide its coordinates, address, and a brief description.",
        expected_output="Complete information about Palace of Culture and Science",
        agent=researcher
    )

    crew = Crew(
        agents=[researcher],
        tasks=[task],
        process=Process.sequential,
        verbose=True
    )

    result = crew.kickoff()
    print("\n" + "="*70)
    print("RESULT:")
    print("="*70)
    print(result)

    return result


def main():
    """Run the Warsaw demos."""
    # Main demo: Multi-agent tour planning
    warsaw_tour_planning_demo()

    # Simple demo: Single landmark lookup
    # Uncomment to run:
    # simple_landmark_demo()


if __name__ == "__main__":
    main()
