"""
Warsaw Tour Guide - Enhanced Gradio UI with Blocks (LangGraph)

An enhanced web interface that displays both text responses and map images.
Uses Gradio Blocks for a custom layout with image rendering.

Install: pip install gradio
Run: python warsaw_gradio_blocks.py
"""

import asyncio
import os
from dotenv import load_dotenv
import gradio as gr
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

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
        agent = create_react_agent(model, tools)
    return agent


async def chat_with_images(message: str, history: list) -> tuple[str, str]:
    """
    Process a chat message and return both text and image if available.

    Args:
        message: The user's message
        history: Chat history (Gradio format)

    Returns:
        Tuple of (text_response, image_url or None)
    """
    try:
        # Initialize agent
        agent_executor = await initialize_agent()

        # Add system prompt to guide the agent
        full_prompt = f"""You are an expert tour guide for Warsaw, Poland.

{message}

Use the available Mapbox tools to provide accurate location information."""

        # Run the agent
        result = await agent_executor.ainvoke({"messages": [{"role": "user", "content": full_prompt}]})

        # Extract text response
        messages = result.get("messages", [])
        text_response = messages[-1].content if messages else "No response"

        # Try to extract map URL from tool responses
        image_url = None
        for msg in messages:
            # Check for tool responses in LangGraph messages
            if hasattr(msg, 'additional_kwargs'):
                tool_calls = msg.additional_kwargs.get('tool_calls', [])
                for tool_call in tool_calls:
                    # Tool responses might be in different messages
                    pass

            # Check message content for URLs
            if hasattr(msg, 'content'):
                content = msg.content
                # Look for Mapbox static map URLs in the content
                if isinstance(content, str) and 'api.mapbox.com' in content:
                    # Extract URL from content
                    import re
                    url_match = re.search(r'https://api\.mapbox\.com/[^\s\)]+', content)
                    if url_match:
                        image_url = url_match.group(0)
                        break

        return text_response, image_url

    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}", None


def chat_wrapper(message: str, history: list):
    """Synchronous wrapper for the async chat function."""
    text, image = asyncio.run(chat_with_images(message, history))
    return text, image


# Example prompts
examples = [
    "Find the Palace of Culture and Science",
    "Create a static map of Warsaw Old Town",
    "Get directions from Old Town to Royal Castle",
    "Show me a map of Łazienki Park",
    "Find cafes near Lazienki Park",
    "Generate a map with a marker at Royal Castle",
]


# Create the Gradio Blocks interface
with gr.Blocks(theme=gr.themes.Soft(), title="🇵🇱 Warsaw Tour Guide") as demo:
    gr.Markdown(
        """
        # 🇵🇱 Warsaw Tour Guide
        Ask me about Warsaw landmarks, directions, or places to visit!

        **Powered by LangGraph + Mapbox MCP Server**

        ✨ This enhanced version displays map images when available!
        """
    )

    with gr.Row():
        with gr.Column(scale=2):
            chatbot = gr.Chatbot(
                label="Chat",
                height=500,
                type="messages"
            )

            with gr.Row():
                msg = gr.Textbox(
                    label="Your message",
                    placeholder="Ask about Warsaw landmarks...",
                    scale=4
                )
                submit = gr.Button("Send", variant="primary", scale=1)

        with gr.Column(scale=1):
            image_output = gr.Image(
                label="Map View",
                type="filepath",
                height=500
            )
            gr.Markdown(
                """
                ### 🗺️ Map Display
                When you ask for a map, it will appear here!

                Try asking:
                - "Create a map of Warsaw Old Town"
                - "Show me a map of Palace of Culture"
                """
            )

    gr.Examples(
        examples=examples,
        inputs=msg,
        label="Example prompts"
    )

    def respond(message, chat_history):
        """Handle user message and update both chat and image."""
        # Get response and image
        text, image = chat_wrapper(message, chat_history)

        # Update chat history
        chat_history.append({"role": "user", "content": message})
        chat_history.append({"role": "assistant", "content": text})

        return "", chat_history, image

    # Wire up the events
    msg.submit(respond, [msg, chatbot], [msg, chatbot, image_output])
    submit.click(respond, [msg, chatbot], [msg, chatbot, image_output])


if __name__ == "__main__":
    print("🚀 Starting Warsaw Tour Guide enhanced web interface...")
    print("📍 Using Mapbox MCP Server with LangGraph")
    print("🖼️  Enhanced with map image display!")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
