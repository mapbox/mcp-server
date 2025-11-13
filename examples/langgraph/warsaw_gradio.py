"""
Warsaw Tour Guide - Gradio Web UI (LangGraph)

A simple web interface for the Warsaw tour guide using Gradio.
Run this file to launch a chat interface in your browser.

Install: pip install gradio
Run: python warsaw_gradio.py
"""

import asyncio
import os
from dotenv import load_dotenv
import gradio as gr
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

# Load environment variables
load_dotenv()


def get_mcp_config():
    """Configure the Mapbox MCP server connection."""
    mapbox_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not mapbox_token:
        raise EnvironmentError(
            "MAPBOX_ACCESS_TOKEN environment variable is required. "
            "Get your token at https://account.mapbox.com/"
        )

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


# Initialize the agent
mcp_config = get_mcp_config()
client = None
agent = None


async def initialize_agent():
    """Initialize the LangGraph agent with MCP tools."""
    global client, agent
    if agent is None:
        client = MultiServerMCPClient(mcp_config)
        tools = await client.get_tools()
        model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        agent = create_agent(model, tools)
    return agent


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
        agent = await initialize_agent()
        result = await agent.ainvoke({
            "messages": [{
                "role": "user",
                "content": f"""You are an expert tour guide for Warsaw, Poland.
                {message}

                Use the available Mapbox tools to provide accurate location information."""
            }]
        })

        messages = result.get("messages", [])
        if messages:
            return messages[-1].content
        return "I couldn't generate a response. Please try again."
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
    description="Ask me about Warsaw landmarks, directions, or places to visit! Powered by LangGraph + Mapbox MCP Server",
    examples=examples,
    theme=gr.themes.Soft(),
)

if __name__ == "__main__":
    print("🚀 Starting Warsaw Tour Guide web interface...")
    print("📍 Using Mapbox MCP Server with LangGraph")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
