# Code based on smolagents example from: https://github.com/huggingface/smolagents/blob/main/examples/agent_from_any_llm.py
import os
from mcp import StdioServerParameters
from smolagents import (
    CodeAgent,
    InferenceClientModel,
    LiteLLMModel,
    OpenAIServerModel,
    TransformersModel,
    tool,
    ToolCollection
)

# Choose which inference type to use!

available_inferences = ["inference_client", "transformers", "ollama", "litellm", "openai"]
# chosen_inference = "inference_client"
chosen_inference = "openai"

print(f"Chose model: '{chosen_inference}'")

if chosen_inference == "inference_client":
    model = InferenceClientModel(model_id="meta-llama/Llama-3.3-70B-Instruct", provider="nebius")

elif chosen_inference == "transformers":
    model = TransformersModel(model_id="HuggingFaceTB/SmolLM2-1.7B-Instruct", device_map="auto", max_new_tokens=1000)

elif chosen_inference == "ollama":
    model = LiteLLMModel(
        model_id="ollama_chat/llama3.2",
        api_base="http://localhost:11434",  # replace with remote open-ai compatible server if necessary
        api_key="your-api-key",  # replace with API key if necessary
        num_ctx=8192,  # ollama default is 2048 which will often fail horribly. 8192 works for easy tasks, more is better. Check https://huggingface.co/spaces/NyxKrage/LLM-Model-VRAM-Calculator to calculate how much VRAM this will need for the selected model.
    )

elif chosen_inference == "litellm":
    # For anthropic: change model_id below to 'anthropic/claude-3-7-sonnet-latest'
    model = LiteLLMModel(model_id="gpt-4o")

elif chosen_inference == "openai":
    # For anthropic: change model_id below to 'anthropic/claude-3-7-sonnet-latest'
    model = OpenAIServerModel(model_id="gpt-4.1-2025-04-14")


# Make sure there is an access token available
if os.environ.get("MAPBOX_ACCESS_TOKEN", None) is None:
    raise EnvironmentError("To use Mapbox MCP you need to export `MAPBOX_ACCESS_TOKEN` environmental variable.")

# Run server with node
# alternatively you can use command="docker" and args=["run", "-i", "--rm", "mapbox-mcp-server"] 
server_parameters = StdioServerParameters(
    command="/Users/username/.nvm/versions/node/v22.3.0/bin/node",
    args=["/YOUR_PATH_TO_REPOSITORY/dist/index.js"],
    env={"MAPBOX_ACCESS_TOKEN": os.environ["MAPBOX_ACCESS_TOKEN"]},
)


# Connect to MCP, create agent with MCP's tool and run it
with ToolCollection.from_mcp(server_parameters, trust_remote_code=True) as tool_collection:

    agent = CodeAgent(tools=tool_collection.tools, model=model, verbosity_level=2, stream_outputs=True)
    print("CodeAgent:", agent.run("How long does it take to drive from Big Ben to Eiffel Tower?"))
