"""
Warsaw Tour Guide - Gradio Web UI (CrewAI)

A simple web interface for the Warsaw tour guide using Gradio.
Run this file to launch a chat interface in your browser.

Install: pip install gradio
Run: python warsaw_gradio.py
"""

import os
from dotenv import load_dotenv
import gradio as gr
from crewai import Agent, Task, Crew, Process
from crewai.mcp import MCPServerStdio

# Load environment variables
load_dotenv()


def get_mapbox_mcp_config():
    """Configure the Mapbox MCP server connection."""
    mapbox_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not mapbox_token:
        raise EnvironmentError(
            "MAPBOX_ACCESS_TOKEN environment variable is required. "
            "Get your token at https://account.mapbox.com/"
        )

    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, "..", "..", "dist", "esm", "index.js")

    return MCPServerStdio(
        command="node",
        args=[script_path],
        env={"MAPBOX_ACCESS_TOKEN": mapbox_token}
    )


def create_warsaw_agent(mcp_config):
    """Create a CrewAI agent for Warsaw tourism."""
    return Agent(
        role="Warsaw Tour Expert",
        goal="Help visitors discover and navigate Warsaw, Poland",
        backstory="""You are an expert guide for Warsaw, Poland with deep knowledge of:
        - Famous landmarks (Palace of Culture, Old Town, Royal Castle, Lazienki Park, etc.)
        - Getting directions and planning routes
        - Finding cafes, restaurants, and points of interest
        - Historical and cultural significance of locations

        You have access to Mapbox geospatial tools for accurate location data.
        Always be friendly, informative, and helpful!""",
        mcps=[mcp_config],
        verbose=False,  # Set to False for cleaner output in web UI
        allow_delegation=False
    )


def chat(message: str, history: list) -> str:
    """
    Process a chat message using CrewAI.

    Args:
        message: The user's message
        history: Chat history (not used in this simple version)

    Returns:
        The agent's response
    """
    try:
        # Configure MCP
        mcp_config = get_mapbox_mcp_config()

        # Create agent
        agent = create_warsaw_agent(mcp_config)

        # Create task
        task = Task(
            description=f"""The user asks: {message}

            Use the Mapbox tools to provide accurate, helpful information about Warsaw.
            Be conversational and friendly in your response.""",
            expected_output="A helpful, accurate response about Warsaw",
            agent=agent
        )

        # Create and run crew
        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            verbose=False
        )

        result = crew.kickoff()
        return str(result)

    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}"


# Example prompts
examples = [
    ["Find the Palace of Culture and Science"],
    ["Get directions from Old Town to Royal Castle"],
    ["Find cafes near Lazienki Park"],
    ["What are the coordinates of Warsaw Uprising Museum?"],
    ["Tell me about Wilanow Palace"],
]

# Create the Gradio interface
demo = gr.ChatInterface(
    chat,
    title="🇵🇱 Warsaw Tour Guide",
    description="Ask me about Warsaw landmarks, directions, or places to visit! Powered by CrewAI + Mapbox MCP Server",
    examples=examples,
    theme=gr.themes.Soft(),
)

if __name__ == "__main__":
    print("🚀 Starting Warsaw Tour Guide web interface...")
    print("📍 Using Mapbox MCP Server with CrewAI")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
