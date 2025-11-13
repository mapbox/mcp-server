"""
Warsaw Tour Guide - Gradio Web UI (Pydantic AI)

A simple web interface for the Warsaw tour guide using Gradio.
Run this file to launch a chat interface in your browser.

Install: pip install gradio
Run: python warsaw_gradio.py
"""

import asyncio
import os
from dotenv import load_dotenv
import gradio as gr
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.models.openai import OpenAIChatModel

# Load environment variables
load_dotenv()


def get_mcp_server():
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
        "node",
        args=[script_path],
        env={"MAPBOX_ACCESS_TOKEN": mapbox_token},
        timeout=30
    )


# Create the agent
mcp_server = get_mcp_server()

agent = Agent(
    OpenAIChatModel("gpt-4o-mini"),
    system_prompt="""You are an expert tour guide for Warsaw, Poland with access to Mapbox geospatial tools.

    You help visitors:
    - Discover famous landmarks (Palace of Culture, Old Town, Royal Castle, Lazienki Park, etc.)
    - Plan routes and get directions
    - Find nearby cafes, restaurants, and points of interest
    - Get accurate coordinates and addresses

    Always be friendly, informative, and use the Mapbox tools to provide accurate location data.
    Format your responses in a clear, conversational way.""",
    toolsets=[mcp_server]
)


async def chat_async(message: str, history: list) -> str:
    """
    Process a chat message asynchronously.

    Args:
        message: The user's message
        history: Chat history (not used in this simple version)

    Returns:
        The agent's response
    """
    try:
        result = await agent.run(message)
        return result.output
    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}"


def chat(message: str, history: list) -> str:
    """
    Synchronous wrapper for the chat function.

    Args:
        message: The user's message
        history: Chat history

    Returns:
        The agent's response
    """
    return asyncio.run(chat_async(message, history))


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
    description="Ask me about Warsaw landmarks, directions, or places to visit! Powered by Pydantic AI + Mapbox MCP Server",
    examples=examples,
    theme=gr.themes.Soft(),
)

if __name__ == "__main__":
    print("🚀 Starting Warsaw Tour Guide web interface...")
    print("📍 Using Mapbox MCP Server with Pydantic AI")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
