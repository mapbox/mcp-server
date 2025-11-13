"""
Warsaw Tour Guide - Enhanced Gradio UI with Blocks (Pydantic AI)

An enhanced web interface that displays both text responses and map images.
Uses Gradio Blocks for a custom layout with image rendering.

Install: pip install gradio
Run: python warsaw_gradio_blocks.py
"""

import asyncio
import os
import base64
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
    When showing maps, describe what's visible on the map.""",
    toolsets=[mcp_server]
)


async def chat_with_images(message: str, history: list) -> tuple[str, str]:
    """
    Process a chat message and return both text and image if available.

    Args:
        message: The user's message
        history: Chat history (Gradio format)

    Returns:
        Tuple of (text_response, image_data_url or None)
    """
    try:
        # Run the agent and capture the full result
        result = await agent.run(message)
        text_response = result.output
        image_data = None

        # Extract map images from tool responses
        # Pydantic AI stores the conversation in result.all_messages()
        if hasattr(result, 'all_messages'):
            messages = result.all_messages()
            for msg in messages:
                # Check if message has parts with content
                if hasattr(msg, 'parts'):
                    for part in msg.parts:
                        # Look for ToolReturnPart which contains tool responses
                        if part.__class__.__name__ == 'ToolReturnPart':
                            # ToolReturnPart contains the tool's response
                            if hasattr(part, 'content') and isinstance(part.content, list):
                                for item in part.content:
                                    # Check if it's a Mapbox static map URL
                                    if isinstance(item, str) and item.startswith('https://api.mapbox.com/'):
                                        image_data = item
                                        break
                                    # Check for base64 image data
                                    elif isinstance(item, dict) and item.get('type') == 'image' and 'data' in item:
                                        image_data = f"data:image/png;base64,{item['data']}"
                                        break
                                if image_data:
                                    break

        return text_response, image_data

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

        **Powered by Pydantic AI + Mapbox MCP Server**

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
    print("📍 Using Mapbox MCP Server with Pydantic AI")
    print("🖼️  Enhanced with map image display!")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
