from typing import Dict, Any
from template import Template
from execution_result import ExecutionResult
from view import View


class SimpleView(View):
    """
    View that handles a single template and execution result.
    """

    def __init__(self, template: Template, execution_result: ExecutionResult, client=None):
        """
        Initialize a SimpleView with a template and execution result.

        Args:
            template: The template to display and edit
            execution_result: The execution result for the template
            client: The OpenAI client instance
        """
        self.template = template
        self.execution_result = execution_result
        self.client = client
        self.view_type = "simple"

    def render_template(self) -> Dict[str, Any]:
        """
        Render the plain template text.

        Returns:
            Dictionary with template text and view type
        """
        return {
            "template_text": self.template.template_text,
            "view_type": self.view_type,
        }

    def render_output(self) -> Dict[str, Any]:
        """
        Render the execution result.

        Returns:
            Dictionary with execution result and view type
        """
        return {
            "result": self.execution_result.rendered_output,
            "variables": self.execution_result.get_variables_dict(),
            "cache_info": {
                "variables_count": len(self.execution_result.variables),
                "cached": True,  # Default to cached
            },
            "view_type": self.view_type,
        }

    def update_from_editor(self, editor_content: str, document_id: str = None) -> None:
        """
        Update template from editor content.

        Args:
            editor_content: The new content from the editor
            document_id: The document ID for loading data lake items
        """
        self.template = Template(editor_content, document_id)
        self.execution_result = self.template.execute(self.client, self.execution_result)

    def handle_template_change(self, template_text: str, document_id: str = None) -> None:
        """
        Handle changing the template.

        Args:
            template_text: The new template text
            document_id: The document ID for loading data lake items
        """
        self.template = Template(template_text, document_id)
        self.execution_result = self.template.execute(self.client, self.execution_result)

    def to_simple_view(self) -> "SimpleView":
        """Return self as we're already a SimpleView."""
        return self
