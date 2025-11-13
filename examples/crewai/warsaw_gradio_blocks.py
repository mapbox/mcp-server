"""
Warsaw Tour Guide - Enhanced Gradio UI with Blocks (CrewAI)

An enhanced web interface that displays both text responses and map images.
Uses Gradio Blocks for a custom layout with image rendering.

Install: pip install gradio
Run: python warsaw_gradio_blocks.py
"""

import os
import re
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
        verbose=False,
        allow_delegation=False
    )


def chat_with_images(message: str, history: list) -> tuple[str, str]:
    """
    Process a chat message using CrewAI and return both text and image.

    Args:
        message: The user's message
        history: Chat history (not used in this simple version)

    Returns:
        Tuple of (text_response, image_url or None)
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
        text_response = str(result)

        # Try to extract Mapbox URL from the response or tool calls
        image_url = None

        # Check if there's a Mapbox static map URL in the result
        url_match = re.search(r'https://api\.mapbox\.com/styles/v1/[^\s\)]+', text_response)
        if url_match:
            image_url = url_match.group(0)

        return text_response, image_url

    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}", None


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

        **Powered by CrewAI + Mapbox MCP Server**

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
        text, image = chat_with_images(message, chat_history)

        # Update chat history
        chat_history.append({"role": "user", "content": message})
        chat_history.append({"role": "assistant", "content": text})

        return "", chat_history, image

    # Wire up the events
    msg.submit(respond, [msg, chatbot], [msg, chatbot, image_output])
    submit.click(respond, [msg, chatbot], [msg, chatbot, image_output])


if __name__ == "__main__":
    print("🚀 Starting Warsaw Tour Guide enhanced web interface...")
    print("📍 Using Mapbox MCP Server with CrewAI")
    print("🖼️  Enhanced with map image display!")
    print("🌐 Opening in your browser...")
    demo.launch(share=False)
