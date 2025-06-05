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
        current_template_text: str = "",
        current_output: str = "",
        suggest_template: bool = True,
        view_action: Optional[str] = None
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
        print(f"Current template: {current_template_text[:50]}...")
        print(f"Suggest template: {suggest_template}")
        print(f"View action: {view_action}")
        print(f"Session in view_registry: {session_id in self.view_registry}")
        print(f"View type: {type(self.view_registry.get(session_id, 'Not found'))}")
        print("==== END REQUEST INFO ====")

        # Initialize view if it doesn't exist
        if session_id not in self.view_registry:
            # Initialize with current template text, or empty if none provided
            template = Template(current_template_text if current_template_text else "")
            execution_result = ExecutionResult()
            self.view_registry[session_id] = SimpleView(template, execution_result, self.client)
            print(f"Created new simple view for session {session_id}")

        # Initialize conversation history if it doesn't exist
        if session_id not in self.conversations:
            self.conversations[session_id] = []

        # Add user message to conversation history
        self.conversations[session_id].append({"role": "user", "content": user_message})

        try:
            # Get the current view
            current_view = self.view_registry[session_id]
            
            # If we're in a DiffView, switch to SimpleView using reject_suggestion
            if isinstance(current_view, DiffView):
                current_view = current_view.reject_suggestion()
                self.view_registry[session_id] = current_view
                print(f"Switched from DiffView to SimpleView for session {session_id}")

            # Process view actions if any
            if view_action:
                current_view = self._process_view_action(view_action, current_view, session_id)
                
                # If this is just a view action (accept/reject), we can return the response immediately
                # without generating new template suggestions
                if view_action in ["accept", "reject"]:
                    execution_result = self._get_execution_result_from_view(current_view)
                    output_data = current_view.render_output()
                    
                    # Create an appropriate message
                    action_message = f"Suggestion {view_action}ed. The template has been updated."
                    
                    # Add action message to conversation history
                    self.conversations[session_id].append(
                        {"role": "assistant", "content": action_message}
                    )
                    
                    # Return a response with the updated simple view
                    response = self._prepare_response(current_view, output_data, action_message)
                    return response

            # Get the current execution result from the view
            execution_result = self._get_execution_result_from_view(current_view)

            # Get chat response from LLM using the conversation history
            # Add template variables to the system message context
            system_context = None
            if execution_result.variables:
                var_context = "Available variables:\n"
                for name, data in execution_result.variables.items():
                    var_value = data["value"]
                    truncated = var_value[:50] + ("..." if len(var_value) > 50 else "")
                    var_context += f"${name} = {truncated}\n"

                system_context = {"role": "system", "content": var_context}

            # Create messages array with optional system context
            messages = []
            if system_context:
                messages.append(system_context)

            # Add conversation history
            messages.extend(self.conversations[session_id])

            # Choose the appropriate service based on request type
            if suggest_template and current_view.template.template_text.strip():
                # Use template suggestion service for "Ask AI" requests with existing template
                view = self._generate_template_suggestion(
                    current_view, user_message, session_id
                )
                assistant_message = "Sure, here's the improved template: " + view.suggested_template.template_text
            else:
                # Use default chat service for regular chat messages
                view = self._default_chat_service(current_view, user_message, session_id)
                assistant_message = view.suggested_template.template_text

            self.conversations[session_id].append(
                {"role": "assistant", "content": assistant_message}
            )

            # Get the view's output rendering
            output_data = view.render_output()

            # For backward compatibility, combine the view rendering with top-level fields
            response = self._prepare_response(view, output_data, assistant_message)

            return response

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

    def _process_view_action(
        self, view_action: str, current_view: View, session_id: str
    ) -> View:
        """
        Process view actions (accept/reject in DiffView).

        Args:
            view_action: The action to perform (accept/reject)
            current_view: The current view
            session_id: Session identifier

        Returns:
            Updated view
        """
        if view_action == "accept" and isinstance(current_view, DiffView):
            # Accept the suggestion, convert to SimpleView
            simple_view = current_view.accept_suggestion()
            
            # Update the view in the registry
            self.view_registry[session_id] = simple_view
            
            # Re-execute the template to ensure execution result is updated
            if isinstance(simple_view, SimpleView):
                template_text = simple_view.template.template_text
                template = Template(template_text)
                execution_result = template.execute(self.client, simple_view.execution_result)
                simple_view.execution_result = execution_result
            
            current_view = self.view_registry[session_id]
            print(f"Accepted suggestion: switched to SimpleView for session {session_id}")
            
        elif view_action == "reject" and isinstance(current_view, DiffView):
            # Reject the suggestion, convert to SimpleView
            simple_view = current_view.reject_suggestion()
            
            # Update the view in the registry
            self.view_registry[session_id] = simple_view
            
            # Re-execute the template to ensure execution result is updated
            if isinstance(simple_view, SimpleView):
                template_text = simple_view.template.template_text
                template = Template(template_text)
                execution_result = template.execute(self.client, simple_view.execution_result)
                simple_view.execution_result = execution_result
            
            current_view = self.view_registry[session_id]
            print(f"Rejected suggestion: switched to SimpleView for session {session_id}")
        
        return current_view

    def _get_execution_result_from_view(self, view: View) -> ExecutionResult:
        """
        Extract the execution result from a view.

        Args:
            view: The view to extract from

        Returns:
            ExecutionResult from the view
        """
        if isinstance(view, SimpleView):
            return view.execution_result
        elif isinstance(view, DiffView):
            return view.current_result
        else:
            raise ValueError(f"Unknown view type: {type(view)}")


    def _default_chat_service(self, current_view: SimpleView, user_message: str, session_id: str) -> str:
        """
        Default chat service for when no template is available.
        """
        chat_hisotry = self.conversations[session_id]
        chat_history_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_hisotry])
        print(f"Chat history: {chat_history_str}")

        prompt = f"""
        You are a helpful assistant that can answer questions about this document, and help with tasks.
        Here is the chat history:
        {chat_history_str}
        The user has a request or question: "{user_message}"
        
        Provide your answer in markdown format with proper formatting for code, lists, headers, etc.
        Be helpful and provide detailed explanations when appropriate.
        """
        current_template = current_view.template
        current_result = current_view.execution_result

        response = self._call_llm(prompt)

        answer = response.choices[0].message.content
        print(f"RAW ANSWER from LLM in Chat: {answer}")
        
        # Return the answer directly as markdown (no need to parse "ANSWER:" prefix)
        if answer and answer.strip():
            # Create a simple template with the answer content
            temp_result = ExecutionResult(
                variables={
                    k: v.copy() for k, v in current_result.variables.items()
                }
            )

            # Create suggested template with the answer
            suggested_template = Template(answer.strip())
            suggested_result = suggested_template.execute(
                self.client, temp_result
            )

            # Create a DiffView
            diff_view = DiffView(
                current_template,
                current_result,
                suggested_template,
                suggested_result,
                self.client
            )

            # Update the view registry
            self.view_registry[session_id] = diff_view

            # Return the DiffView
            return diff_view
        else:
            print("EMPTY ANSWER FROM LLM!!")
            return current_view

    def _generate_template_suggestion(
        self, current_view: SimpleView, user_message: str, session_id: str
    ) -> View:
        """
        Generate a template suggestion based on user message.

        Args:
            current_view: Current SimpleView
            user_message: User's message
            session_id: Session identifier

        Returns:
            Either a DiffView with suggestion or the original SimpleView
        """
        # Get the current template and result
        current_template = current_view.template
        current_result = current_view.execution_result

        # Create a prompt for template suggestions
        suggestion_prompt = f"""
I'm working with an LLM template system. Here's the current template:

```template
{current_template.template_text}
```

This template produces this output:

```output
{current_result.rendered_output}
```

The user has a request or question about this template: "{user_message}"

Provide a single improved template that addresses the user's request. Make changes to the template with minimal, targeted changes rather than rewriting large portions. Focus only on the specific changes needed to meet the user's request.

Format your response as:

TEMPLATE:
[The improved template]

Be concise and only include results text without any explanations or additional text.
"""

        # Get template suggestions from LLM
        suggestion_response = self._call_llm(suggestion_prompt)

        suggestion_text = suggestion_response.choices[0].message.content

        # Parse the template from the response
        template_match = re.search(r"TEMPLATE:\s*([\s\S]*?)(?=$)", suggestion_text)

        if template_match:
            suggested_template_text = template_match.group(1).strip()
            # Clean up the template (remove markdown code blocks if present)
            suggested_template_text = (
                suggested_template_text.replace("```template", "")
                .replace("```", "")
                .strip()
            )

            # Create and execute the suggested template
            if suggested_template_text:
                # Create a temporary execution result to avoid modifying the original
                temp_result = ExecutionResult(
                    variables={
                        k: v.copy() for k, v in current_result.variables.items()
                    }
                )

                # Create suggested template
                suggested_template = Template(suggested_template_text)
                suggested_result = suggested_template.execute(
                    self.client, temp_result
                )

                # Create a DiffView
                diff_view = DiffView(
                    current_template,
                    current_result,
                    suggested_template,
                    suggested_result,
                    self.client
                )

                # Update the view registry
                self.view_registry[session_id] = diff_view

                # Return the DiffView
                return diff_view
            else:
                # No changes suggested, keep using the current view
                return current_view
        else:
            # No template found in response, keep using the current view
            return current_view

    def _prepare_response(
        self, view: View, output_data: Dict[str, Any], assistant_message: str
    ) -> Dict[str, Any]:
        """
        Prepare the response to send back to the client.

        Args:
            view: Current view
            output_data: Output data from view.render_output()
            assistant_message: Assistant's chat response

        Returns:
            Response dictionary
        """
        # For backward compatibility, combine the view rendering with top-level fields
        response = {
            # Chat-specific field
            "response": assistant_message,
            # Include top-level fields for backward compatibility
            "result": output_data.get("result", ""),
            "variables": output_data.get("variables", {}),
            "cache_info": output_data.get(
                "cache_info", {"variables_count": 0, "cached": True}
            ),
            # Include the full template and output data
            "template": view.render_template(),
            "output": output_data,
            "view_type": output_data.get("view_type", "simple"),
            # For backward compatibility with existing code
            "suggested_templates": [
                view.suggested_template.template_text
                if hasattr(view, "suggested_template")
                else None,
                None,
            ],
            "suggested_outputs": [
                view.suggested_result.rendered_output
                if hasattr(view, "suggested_result")
                else None,
                None,
            ],
            "line_edits": view.line_diffs if hasattr(view, "line_diffs") else [],
        }

        return response

    def update_template(
        self,
        session_id: str,
        editor_content: str,
        change_type: Optional[str] = None,
        line_index: Optional[int] = None,
        line_content: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Handle updates to templates, especially for diff view editing.

        Args:
            session_id: Session identifier
            editor_content: Content from the editor
            change_type: Optional "current" or "suggested" for DiffView
            line_index: Optional line index for specific line changes
            line_content: Optional new content for line

        Returns:
            Response with updated template and view information
        """
        # Ensure we have a view for this session
        if session_id not in self.view_registry:
            # Initialize with the editor content if no view exists
            template = Template(editor_content)
            execution_result = ExecutionResult()
            self.view_registry[session_id] = SimpleView(template, execution_result, self.client)

        view = self.view_registry[session_id]

        try:
            # Update the view with the changes
            if isinstance(view, DiffView) and change_type:
                # For diff view with specific line changes
                view.update_from_editor(
                    editor_content, change_type, line_index, line_content
                )
            else:
                # For simple view or when full content is provided
                view.update_from_editor(editor_content)

            # Get outputs to return
            output_data = view.render_output()

            # Prepare response
            response = {
                "result": output_data.get("result", ""),
                "variables": output_data.get("variables", {}),
                "cache_info": output_data.get(
                    "cache_info", {"variables_count": 0, "cached": True}
                ),
                "template": view.render_template(),
                "output": output_data,
                "view_type": output_data.get("view_type", "simple"),
            }

            # Add diff view specific fields
            if isinstance(view, DiffView):
                response.update(
                    {
                        "suggested_templates": [
                            view.suggested_template.template_text,
                            None,
                        ],
                        "suggested_outputs": [view.suggested_result.rendered_output, None],
                        "line_edits": view.line_diffs,
                    }
                )

            return response

        except Exception as e:
            print(f"Error updating template: {e}")
            return {"error": f"Failed to update template: {str(e)}"}

    def get_debug_info(self, session_id: str) -> Dict[str, Any]:
        """
        Return debug information about the current state.

        Args:
            session_id: Session identifier

        Returns:
            Dictionary with debug information
        """
        # Get the execution result from the view if it exists
        has_execution_result = False
        if session_id in self.view_registry:
            view = self.view_registry[session_id]
            execution_result = self._get_execution_result_from_view(view)
            has_execution_result = bool(execution_result)
        
        debug_data = {
            "session_id": session_id,
            "has_execution_result": has_execution_result,
            "has_view": session_id in self.view_registry,
            "view_type": str(type(self.view_registry.get(session_id, None)).__name__)
            if session_id in self.view_registry
            else None,
            "has_conversation": session_id in self.conversations,
            "conversation_length": len(self.conversations.get(session_id, [])),
            "all_sessions": list(self.view_registry.keys()),
            "registry_sizes": {
                "view_registry": len(self.view_registry),
                "conversations": len(self.conversations),
            },
        }

        # Add view-specific debug info
        if session_id in self.view_registry:
            view = self.view_registry[session_id]
            if isinstance(view, SimpleView):
                debug_data["view_info"] = {
                    "template_length": len(view.template.template_text),
                    "output_length": len(view.execution_result.rendered_output),
                    "variable_count": len(view.execution_result.variables),
                }
            elif isinstance(view, DiffView):
                debug_data["view_info"] = {
                    "current_template_length": len(view.current_template.template_text),
                    "suggested_template_length": len(view.suggested_template.template_text),
                    "line_diff_count": len(view.line_diffs),
                    "current_output_length": len(view.current_result.rendered_output),
                    "suggested_output_length": len(view.suggested_result.rendered_output),
                }

        return debug_data

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