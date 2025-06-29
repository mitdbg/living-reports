import asyncio
import json
import logging
import os
import shutil
from contextlib import AsyncExitStack
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class Configuration:
    """Manages configuration and environment variables for the MCP client."""

    def __init__(self) -> None:
        """Initialize configuration with environment variables."""
        # Set required environment variables automatically
        os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
        os.environ["MCP_SINGLE_USER_MODE"] = "1"
        
        # Set the Google application credentials path to help with authentication
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".credentials")
        if not os.path.exists(credentials_path):
            os.makedirs(credentials_path)
        
        self.load_env()
        self.api_key = os.getenv("LLM_API_KEY")

    @staticmethod
    def load_env() -> None:
        """Load environment variables from .env file."""
        load_dotenv()

    @staticmethod
    def load_config(file_path: str) -> dict[str, Any]:
        """Load server configuration from JSON file.

        Args:
            file_path: Path to the JSON configuration file.

        Returns:
            Dict containing server configuration.

        Raises:
            FileNotFoundError: If configuration file doesn't exist.
            JSONDecodeError: If configuration file is invalid JSON.
        """
        with open(file_path, "r") as f:
            return json.load(f)

    @property
    def llm_api_key(self) -> str:
        """Get the LLM API key.

        Returns:
            The API key as a string.

        Raises:
            ValueError: If the API key is not found in environment variables.
        """
        if not self.api_key:
            raise ValueError("LLM_API_KEY not found in environment variables")
        return self.api_key


class Server:
    """Manages MCP server connections and tool execution."""

    def __init__(self, name: str, config: dict[str, Any]) -> None:
        self.name: str = name
        self.config: dict[str, Any] = config
        self.stdio_context: Any | None = None
        self.session: ClientSession | None = None
        self._cleanup_lock: asyncio.Lock = asyncio.Lock()
        self.exit_stack: AsyncExitStack = AsyncExitStack()

    async def initialize(self) -> None:
        """Initialize the server connection."""
        command = (
            shutil.which("npx")
            if self.config["command"] == "npx"
            else self.config["command"]
        )
        if command is None:
            raise ValueError("The command must be a valid string and cannot be None.")

        server_params = StdioServerParameters(
            command=command,
            args=self.config["args"],
            env={**os.environ, **self.config["env"]}
            if self.config.get("env")
            else None,
            cwd=self.config.get("cwd"),
        )
        try:
            stdio_transport = await self.exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            read, write = stdio_transport
            session = await self.exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            self.session = session
        except Exception as e:
            logging.error(f"Error initializing server {self.name}: {e}")
            await self.cleanup()
            raise

    async def list_tools(self) -> list[Any]:
        """List available tools from the server.

        Returns:
            A list of available tools.

        Raises:
            RuntimeError: If the server is not initialized.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        tools_response = await self.session.list_tools()
        tools = []
        
        # Handle the response based on its actual structure
        if hasattr(tools_response, 'tools'):
            # If it's an object with a tools attribute
            mcp_tools = tools_response.tools
        else:
            # If it's a direct list or other structure
            mcp_tools = tools_response

        for tool in mcp_tools:
            try:
                tools.append(Tool(
                    tool.name, 
                    tool.description, 
                    getattr(tool, 'inputSchema', getattr(tool, 'input_schema', {})), 
                    getattr(tool, 'title', None)
                ))
            except Exception as e:
                logging.error(f"Error processing tool {getattr(tool, 'name', 'unknown')}: {e}")
                logging.error(f"Tool attributes: {dir(tool)}")

        return tools

    async def execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        retries: int = 2,
        delay: float = 1.0,
    ) -> Any:
        """Execute a tool with retry mechanism.

        Args:
            tool_name: Name of the tool to execute.
            arguments: Tool arguments.
            retries: Number of retry attempts.
            delay: Delay between retries in seconds.

        Returns:
            Tool execution result.

        Raises:
            RuntimeError: If server is not initialized.
            Exception: If tool execution fails after all retries.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        attempt = 0
        while attempt < retries:
            try:
                logging.info(f"Executing {tool_name}...")
                result = await self.session.call_tool(tool_name, arguments)

                return result

            except Exception as e:
                attempt += 1
                logging.warning(
                    f"Error executing tool: {e}. Attempt {attempt} of {retries}."
                )
                if attempt < retries:
                    logging.info(f"Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                else:
                    logging.error("Max retries reached. Failing.")
                    raise

    async def cleanup(self) -> None:
        """Clean up server resources."""
        async with self._cleanup_lock:
            try:
                await self.exit_stack.aclose()
                self.session = None
                self.stdio_context = None
            except Exception as e:
                logging.error(f"Error during cleanup of server {self.name}: {e}")


class Tool:
    """Represents a tool with its properties and formatting."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        title: str | None = None,
    ) -> None:
        self.name: str = name
        self.title: str | None = title
        self.description: str = description
        self.input_schema: dict[str, Any] = input_schema

    def format_for_llm(self) -> str:
        """Format tool information for LLM.

        Returns:
            A formatted string describing the tool.
        """
        args_desc = []
        if "properties" in self.input_schema:
            for param_name, param_info in self.input_schema["properties"].items():
                arg_desc = (
                    f"- {param_name}: {param_info.get('description', 'No description')}"
                )
                if param_name in self.input_schema.get("required", []):
                    arg_desc += " (required)"
                args_desc.append(arg_desc)

        # Build the formatted output with title as a separate field
        output = f"Tool: {self.name}\n"

        # Add human-readable title if available
        if self.title:
            output += f"User-readable title: {self.title}\n"

        output += f"""Description: {self.description}
Arguments:
{chr(10).join(args_desc)}
"""

        return output


class LLMClient:
    """Manages communication with the LLM provider."""

    def __init__(self, api_key: str) -> None:
        self.api_key: str = api_key

    def get_response(self, messages: list[dict[str, str]]) -> str:
        """Get a response from the LLM.

        Args:
            messages: A list of message dictionaries.

        Returns:
            The LLM's response as a string.

        Raises:
            httpx.RequestError: If the request to the LLM fails.
        """
        url = "https://api.openai.com/v1/chat/completions"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        
        payload = {
            "model": "gpt-4o-mini",
            "messages": messages
        }

        try:
            with httpx.Client() as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]

        except httpx.RequestError as e:
            error_message = f"Error getting LLM response: {str(e)}"
            logging.error(error_message)

            if isinstance(e, httpx.HTTPStatusError):
                status_code = e.response.status_code
                logging.error(f"Status code: {status_code}")
                logging.error(f"Response details: {e.response.text}")

            return (
                f"I encountered an error: {error_message}. "
                "Please try again or rephrase your request."
            )


class ChatSession:
    """Orchestrates the interaction between user, LLM, and tools."""

    def __init__(self, servers: list[Server], llm_client: LLMClient) -> None:
        self.servers: list[Server] = servers
        self.llm_client: LLMClient = llm_client

    async def cleanup_servers(self) -> None:
        """Clean up all servers properly."""
        for server in reversed(self.servers):
            try:
                await server.cleanup()
            except Exception as e:
                logging.warning(f"Warning during final cleanup: {e}")

    def _is_tool_call(self, response: str) -> bool:
        """Check if the LLM response is a tool call JSON.
        
        Args:
            response: The LLM response string.
            
        Returns:
            True if the response is a tool call, False otherwise.
        """
        # First check if it's a proper JSON tool call
        try:
            tool_call = json.loads(response.strip())
            return "tool" in tool_call and "arguments" in tool_call
        except json.JSONDecodeError:
            pass
        
        # Fallback: Check if LLM is indicating it wants to use a tool but didn't use JSON
        # This helps catch cases where LLM says "I will search" instead of calling the tool
        response_lower = response.lower()
        tool_indication_phrases = [
            "i will", "i'll", "let me", "i need to", "i should", 
            "to summarize", "to check", "to search", "to get", "to retrieve",
            "message ids", "email content", "email details"
        ]
        
        if any(phrase in response_lower for phrase in tool_indication_phrases):
            logging.warning(f"⚠️ LLM indicated tool usage but didn't use JSON format: {response[:100]}...")
            return True
            
        return False

    async def process_llm_response(self, llm_response: str) -> str:
        """Process the LLM response and execute tools if needed.

        Args:
            llm_response: The response from the LLM.

        Returns:
            The result of tool execution or the original response.
        """
        import json

        try:
            tool_call = json.loads(llm_response)
            if "tool" in tool_call and "arguments" in tool_call:
                logging.info(f"Executing tool: {tool_call['tool']}")
                logging.info(f"With arguments: {tool_call['arguments']}")

                for server in self.servers:
                    tools = await server.list_tools()
                    if any(tool.name == tool_call["tool"] for tool in tools):
                        try:
                            result = await server.execute_tool(
                                tool_call["tool"], tool_call["arguments"]
                            )

                            if isinstance(result, dict) and "progress" in result:
                                progress = result["progress"]
                                total = result["total"]
                                percentage = (progress / total) * 100
                                print(f"Progress: {progress}/{total} ({percentage:.1f}%)")
                            else:
                                print("✅ Tool execution completed!")

                            return f"Tool execution result: {result}"
                        except Exception as e:
                            error_msg = f"Error executing tool: {str(e)}"
                            logging.error(error_msg)
                            
                            # Check if this is an authentication error
                            if "Authentication Required" in str(e) or "token" in str(e).lower():
                                print("\n🔐 Authentication Issue Detected!")
                                print("💡 Try running the refresh script: python test_client/refresh_auth.py")
                                print("💡 Or complete the OAuth flow when prompted by the tool response.")
                            
                            return error_msg

                return f"No server found with tool: {tool_call['tool']}"
            return llm_response
        except json.JSONDecodeError:
            return llm_response

    async def start(self) -> None:
        """Main chat session handler."""
        try:
            for server in self.servers:
                try:
                    await server.initialize()
                except Exception as e:
                    logging.error(f"Failed to initialize server: {e}")
                    await self.cleanup_servers()
                    return

            all_tools = []
            for server in self.servers:
                tools = await server.list_tools()
                all_tools.extend(tools)
            tools_description = "\n".join([tool.format_for_llm() for tool in all_tools])

            system_message = (
                "You are a helpful assistant with access to these tools:\n\n"
                f"{tools_description}\n\n"
                "🚨 CRITICAL: TOOL USAGE IS MANDATORY 🚨\n"
                "When you need to use a tool, you MUST respond with ONLY the JSON format below.\n"
                "NO explanations, NO conversational text, NO 'I will...' or 'Let me...' phrases.\n\n"
                "TOOL CALL FORMAT (EXACT JSON ONLY):\n"
                "{\n"
                '    "tool": "tool-name",\n'
                '    "arguments": {\n'
                '        "argument-name": "value"\n'
                "    }\n"
                "}\n\n"
                "❌ WRONG: 'I will search your emails for you' or 'Let me check that'\n"
                "✅ CORRECT: {\"tool\": \"search_gmail_messages\", \"arguments\": {...}}\n\n"
                "WHEN TO USE TOOLS:\n"
                "- Email requests: search_gmail_messages, get_gmail_message_content, etc.\n"
                "- Calendar requests: search_calendar_events, create_calendar_event, etc.\n"
                "- Document requests: search_drive_files, create_doc, etc.\n\n"
                "AUTHENTICATION:\n"
                "- System handles auth automatically - just call the tool\n"
                "- Only use start_google_auth if you get explicit auth errors\n\n"
                "EXAMPLES:\n"
                "User: 'check emails' → {\"tool\": \"search_gmail_messages\", \"arguments\": {\"query\": \"in:inbox\", \"user_google_email\": \"chjuncn@gmail.com\", \"page_size\": 10}}\n"
                "User: 'summarize email content' → {\"tool\": \"get_gmail_messages_content_batch\", \"arguments\": {\"message_ids\": [...], \"user_google_email\": \"chjuncn@gmail.com\"}}\n\n"
                "🔥 REMEMBER: If you need a tool, respond with JSON ONLY! 🔥"
            )

            messages = [{"role": "system", "content": system_message}]

            while True:
                try:
                    user_input = input("You: ").strip().lower()
                    if user_input in ["quit", "exit"]:
                        logging.info("\nExiting...")
                        break

                    messages.append({"role": "user", "content": user_input})

                    llm_response = self.llm_client.get_response(messages)
                    
                    # Check if this is a tool call before showing anything to the user
                    is_tool_call = self._is_tool_call(llm_response)
                    
                    if is_tool_call:
                        # Check if it's a proper JSON tool call
                        try:
                            tool_call = json.loads(llm_response.strip())
                            if "tool" in tool_call and "arguments" in tool_call:
                                tool_name = tool_call.get("tool", "unknown")
                                print(f"Assistant: Executing {tool_name}...")
                                
                                # Execute the tool and get the result
                                result = await self.process_llm_response(llm_response)
                                
                                # Add the tool call and result to conversation history
                                messages.append({"role": "assistant", "content": llm_response})
                                messages.append({"role": "system", "content": result})
                                
                                # Get the final human-readable response
                                final_response = self.llm_client.get_response(messages)
                                logging.info("\nAssistant: %s", final_response)
                                messages.append({"role": "assistant", "content": final_response})
                            else:
                                raise json.JSONDecodeError("Invalid tool call", "", 0)
                        except json.JSONDecodeError:
                            # Regular response, show it immediately
                            logging.info("\nAssistant: %s", llm_response)
                            messages.append({"role": "assistant", "content": llm_response})
                    else:
                        # Regular response, show it immediately
                        logging.info("\nAssistant: %s", llm_response)
                        messages.append({"role": "assistant", "content": llm_response})

                except KeyboardInterrupt:
                    logging.info("\nExiting...")
                    break

        finally:
            await self.cleanup_servers()


async def main() -> None:
    """Initialize and run the chat session."""
    config = Configuration()
    # Use the servers_config.json in the same directory as this script
    config_path = os.path.join(os.path.dirname(__file__), "servers_config.json")
    server_config = config.load_config(config_path)
    servers = [
        Server(name, srv_config)
        for name, srv_config in server_config["mcpServers"].items()
    ]
    llm_client = LLMClient(config.llm_api_key)
    chat_session = ChatSession(servers, llm_client)
    await chat_session.start()


if __name__ == "__main__":
    asyncio.run(main())