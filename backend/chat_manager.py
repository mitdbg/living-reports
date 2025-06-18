from typing import Dict, Any, Optional
import re
from execution_result import ExecutionResult
from template import Template
from simple_view import SimpleView
from diff_view import DiffView
from view import View
from together import Together

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
            model="gpt-3.5-turbo",
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
        Default chat service for when no template is available.
        """
        chat_hisotry = self.conversations[session_id]
        chat_history_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_hisotry])
        print(f"Chat history: {chat_history_str}")

        prompt = f"""
        You are a helpful assistant that can answer questions about this document, and help with tasks. The document has template and preview two modes.
        Here is the chat history:
        {chat_history_str}
        The user has a request or question: "{user_message}"
        
        Here is the current template:
        {current_template_text}
        Here is the current preview:
        {current_preview}
        The user is in {current_mode} mode.
        
        Provide your answer in markdown format with proper formatting for code, lists, headers, etc.
        Be helpful and provide detailed explanations when appropriate.
        """

        response = self._call_llm(prompt)

        answer = response.choices[0].message.content
        print(f"RAW ANSWER from LLM in Chat: {answer}")
        
        # Return the answer directly as markdown (no need to parse "ANSWER:" prefix)
        if answer and answer.strip():
            return answer
        else:
            print("EMPTY ANSWER FROM LLM!!")
            return ""
    

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