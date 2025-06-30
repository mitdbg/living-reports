from typing import Dict, Any, Optional
import json
import asyncio
import logging
from together import Together

# Import simple MCP service (the one that actually gets initialized)
from simple_mcp_service import (
    execute_mcp_tool,
    is_mcp_ready,
    get_mcp_tools_description
)

logger = logging.getLogger('chat_manager')

class ChatManager:
    """
    Manages chat-related functionality including message handling,
    conversation history, template suggestions, and view interactions.
    """
    
    def __init__(self, client, view_registry):
        """
        Initialize the ChatManager.

        Args:
            client: The OpenAI client for API calls
            view_registry: Registry for views
        """
        self.client = client
        self.view_registry = view_registry
        self.conversations = {}  # session_id -> messages
        
    def _call_llm(self, prompt: str):
        if isinstance(self.client, Together):
            return self.client.chat.completions.create(
                model="Qwen/Qwen2.5-Coder-32B-Instruct",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )
        
        return self.client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )


    def handle_chat_message(
        self,
        user_message: str,
        session_id: str = "default",
        current_template: str = "",
        current_preview: str = "",
        current_mode: str = "",
        suggest_template: bool = True,
    ) -> Dict[str, Any]:
        """
        Process a chat message and return the appropriate response.

        Args:
            user_message: The user's message
            session_id: Session identifier
            current_template_text: Current template text in editor
            current_output: Current output in editor
            suggest_template: Whether to suggest a template improvement (True for Ask AI, False for regular chat)
            view_action: Optional action for DiffView (accept/reject)

        Returns:
            Dictionary with response data
        """
        # Enhanced logging for debugging
        print("==== CHAT REQUEST ====")
        print(f"Session ID: {session_id}")
        print(f"User message: {user_message}")
        print(f"Current template: {current_template[:50]}...")
        print(f"Current preview: {current_preview[:50]}...")
        print(f"Current mode: {current_mode}")
        print(f"Suggest template: {suggest_template}")
        print("==== END REQUEST INFO ====")
        # Initialize conversation history if it doesn't exist
        if session_id not in self.conversations:
            self.conversations[session_id] = []

        # Add user message to conversation history
        self.conversations[session_id].append({"role": "user", "content": user_message})

        try:
            # Create messages array with optional system context
            messages = []
            # Add conversation history
            messages.extend(self.conversations[session_id])

            # Use default chat service for regular chat messages
            assistant_message = self._default_chat_service(current_template, current_preview, current_mode, user_message, session_id)

            self.conversations[session_id].append(
                {"role": "assistant", "content": assistant_message}
            )

            return assistant_message

        except Exception as e:
            import traceback

            error_tb = traceback.format_exc()
            print("==== ERROR IN CHAT ENDPOINT ====")
            print(f"Error: {str(e)}")
            print(f"Traceback: {error_tb}")
            print("==== END ERROR ====")

            # Try to return a more helpful error message
            error_msg = str(e)
            if "suggested_template" in error_msg:
                error_msg = "Error accessing suggested template. Make sure you're in diff view mode."
            elif "line_diffs" in error_msg:
                error_msg = "Error processing line differences. Try refreshing the page."

            return {
                "error": error_msg,
                "details": error_tb,
                "recovery_suggestion": "Try refreshing the page or starting a new session.",
            }


    def _default_chat_service(self, current_template_text: str, current_preview: str, current_mode: str, user_message: str, session_id: str) -> str:
        """
        Default chat service with MCP tool integration.
        """
        
        # Get MCP tools description from the simple service
        mcp_tools_desc = get_mcp_tools_description()
        
        # Create system message similar to test_mcp.py
        system_message = (
            "You are a helpful assistant with access to these tools:\n\n"
            f"{mcp_tools_desc}\n\n"
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
            "- Document requests: search_drive_files, create_doc, etc.\n"
            "- Database queries: query, execute (for SQLite)\n"
            "- Web automation: screenshot, navigate, click, type (for Puppeteer)\n\n"
            "AUTHENTICATION:\n"
            "- System handles auth automatically - just call the tool\n"
            "- Only use start_google_auth if you get explicit auth errors\n\n"
            "EXAMPLES:\n"
            "User: 'check emails' → {\"tool\": \"search_gmail_messages\", \"arguments\": {\"query\": \"in:inbox\", \"user_google_email\": \"chjuncn@gmail.com\", \"page_size\": 10}}\n"
            "User: 'summarize email content' → {\"tool\": \"get_gmail_messages_content_batch\", \"arguments\": {\"message_ids\": [...], \"user_google_email\": \"chjuncn@gmail.com\"}}\n"
            "User: 'what's in my database?' → {\"tool\": \"query\", \"arguments\": {\"sql\": \"SELECT name FROM sqlite_master WHERE type='table'\"}}\n\n"
            f"CONTEXT:\n"
            f"- Current document preview: {current_preview[:200]}{'...' if len(current_preview) > 200 else ''}\n"
            f"- Current mode: {current_mode}\n\n"
            "🔥 REMEMBER: If you need a tool, respond with JSON ONLY! 🔥"
        )
        # Build messages array with system message (like test_mcp.py)
        messages = [{"role": "system", "content": system_message}]
        
        # Add conversation history without the current user message (it's already added)
        chat_history = self.conversations[session_id][:-1]  # Exclude the current message
        messages.extend(chat_history)
        
        # Add the current user message
        messages.append({"role": "user", "content": user_message})

        # Call LLM with proper messages array
        if isinstance(self.client, Together):
            response = self.client.chat.completions.create(
                model="Qwen/Qwen2.5-Coder-32B-Instruct",
                messages=messages,
                temperature=0.7,
            )
        else:
            response = self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=messages,
                temperature=0.7,
            )

        answer = response.choices[0].message.content
        print(f"RAW ANSWER from LLM in Chat: {answer}")
        
        # Check if this is a tool call (like test_mcp.py)
        if self._is_tool_call_request(answer):
            print("🔧 LLM requested a tool call")
            
            try:
                # Parse JSON tool call (like test_mcp.py format)
                tool_call = json.loads(answer.strip())
                if "tool" in tool_call and "arguments" in tool_call:
                    tool_name = tool_call.get("tool", "unknown")
                    print(f"Assistant: Executing {tool_name}...")
                    
                    # Execute the tool call using simple async approach (like test_mcp.py)
                    # Add user context to arguments if needed
                    arguments = tool_call["arguments"]
                    if "user_google_email" not in arguments and any(email_tool in tool_name for email_tool in ["gmail", "calendar", "drive"]):
                        arguments["user_google_email"] = "chjuncn@gmail.com"
                    
                    # Simple async execution like test_mcp.py
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        tool_result = loop.run_until_complete(execute_mcp_tool(tool_name, arguments))
                    finally:
                        loop.close()
                    
                    # Add tool call and result to conversation history (like test_mcp.py)
                    self.conversations[session_id].append({"role": "assistant", "content": answer})
                    self.conversations[session_id].append({"role": "system", "content": f"Tool execution result: {tool_result}"})
                    
                    # Get final human-readable response with full context
                    messages_with_result = [{"role": "system", "content": system_message}]
                    messages_with_result.extend(self.conversations[session_id])
                    
                    if isinstance(self.client, Together):
                        final_response = self.client.chat.completions.create(
                            model="Qwen/Qwen2.5-Coder-32B-Instruct",
                            messages=messages_with_result,
                            temperature=0.7,
                        )
                    else:
                        final_response = self.client.chat.completions.create(
                            model="gpt-4.1-mini",
                            messages=messages_with_result,
                            temperature=0.7,
                        )
                    
                    final_answer = final_response.choices[0].message.content
                    print(f"Final answer after tool execution: {final_answer}")
                    
                    # Return the final human-readable response
                    return final_answer if final_answer and final_answer.strip() else "✅ Tool execution completed!"
                    
                else:
                    raise json.JSONDecodeError("Invalid tool call format", "", 0)
                    
            except json.JSONDecodeError:
                # Fallback for non-JSON tool indicators
                return "I understand you want me to use a tool, but I need you to be more specific about what you're looking for."
            except Exception as e:
                logger.error(f"Error executing tool: {e}")
                
                # Check if this is an authentication error
                if "Authentication Required" in str(e) or "token" in str(e).lower():
                    return "🔐 I need to authenticate with your Google account to access that information. Please check the authentication setup."
                
                return f"I tried to use a tool to help, but encountered an error: {str(e)}"
        
        # Regular response (not a tool call)
        if answer and answer.strip():
            return answer
        else:
            print("EMPTY ANSWER FROM LLM!!")
            return "I'm sorry, I couldn't generate a response. Could you please rephrase your question?"
    

    def clear_conversation_history(self, session_id: str) -> bool:
        """
        Clear conversation history for a specific session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if history was cleared, False if session didn't exist
        """
        if session_id in self.conversations:
            del self.conversations[session_id]
            print(f"Cleared conversation history for session {session_id}")
            return True
        return False


    def _is_tool_call_request(self, llm_response: str) -> bool:
        """Check if the LLM response is a tool call JSON (like test_mcp.py)."""
        # First check if it's a proper JSON tool call
        try:
            tool_call = json.loads(llm_response.strip())
            return "tool" in tool_call and "arguments" in tool_call
        except json.JSONDecodeError:
            return False

    async def _execute_mcp_tool_call(self, tool_call_data: dict) -> str:
        """Execute an MCP tool call and return the result."""
        try:
            tool_name = tool_call_data.get("tool_name")
            arguments = tool_call_data.get("arguments", {})
            
            if not tool_name:
                return "Error: No tool name specified"
            
            logger.info(f"🔧 Executing MCP tool: {tool_name}")
            result = await execute_mcp_tool(tool_name, arguments)
            
            # Format the result for the conversation
            if isinstance(result, dict):
                return f"Tool '{tool_name}' executed successfully. Result: {json.dumps(result, indent=2)}"
            else:
                return f"Tool '{tool_name}' executed successfully. Result: {str(result)}"
                
        except Exception as e:
            logger.error(f"Error executing MCP tool: {e}")
            return f"Error executing tool '{tool_name}': {str(e)}"

    def _get_user_context(self, session_id: str) -> dict:
        """Get user context for tool calls (email, preferences, etc.)."""
        # TODO: In the future, this could be populated from user authentication
        # For now, return sensible defaults
        return {
            "user_google_email": "chjuncn@gmail.com",  # Default from your config
            "timezone": "UTC",
            "preferred_language": "en"
        }

    def _extract_tool_call_from_response(self, response: str, session_id: str = "default") -> Optional[dict]:
        """Extract tool call information from LLM response."""
        # First try to parse as JSON
        try:
            tool_call = json.loads(response.strip())
            if "tool_name" in tool_call and "arguments" in tool_call:
                return tool_call
        except json.JSONDecodeError:
            pass
        
        # If not JSON, try to infer the tool call from the response
        response_lower = response.lower()
        user_context = self._get_user_context(session_id)
        
        # Simple heuristics for common tool calls
        if "search" in response_lower and ("email" in response_lower or "gmail" in response_lower):
            return {
                "tool_name": "search_gmail_messages",
                "arguments": {
                    "query": "in:inbox",
                    "user_google_email": user_context["user_google_email"],
                    "page_size": 10
                }
            }
        elif "calendar" in response_lower and "event" in response_lower:
            return {
                "tool_name": "search_calendar_events",
                "arguments": {
                    "time_min": "2024-01-01T00:00:00Z",
                    "time_max": "2024-12-31T23:59:59Z",
                    "user_google_email": user_context["user_google_email"]
                }
            }
        elif "drive" in response_lower or "document" in response_lower:
            return {
                "tool_name": "search_drive_files",
                "arguments": {
                    "query": "type:document",
                    "user_google_email": user_context["user_google_email"],
                    "page_size": 10
                }
            }
        
        return None

    def get_mcp_status(self) -> dict:
        """Get current MCP status for debugging/testing."""
        # Use the simple service to get tools
        from simple_mcp_service import get_mcp_service
        tools = get_mcp_service().all_tools
        return {
            "mcp_available": is_mcp_ready(),
            "mcp_initialized": is_mcp_ready(),
            "tools_count": len(tools),
            "tool_names": [tool.name for tool in tools]
        }