from abc import ABC, abstractmethod
from typing import Dict, Any


class View(ABC):
    """
    Abstract base class for views that render templates and execution results.
    """

    @abstractmethod
    def render_template(self) -> Dict[str, Any]:
        """Render the template for display in the editor."""
        pass

    @abstractmethod
    def render_output(self) -> Dict[str, Any]:
        """Render the output for display."""
        pass

    @abstractmethod
    def update_from_editor(self, editor_content: str) -> None:
        """Update internal state from editor content."""
        pass

    @abstractmethod
    def handle_template_change(self, template_text: str) -> None:
        """Handle changes to the template from the editor."""
        pass

    @abstractmethod
    def to_simple_view(self) -> "SimpleView":
        """Convert this view to a SimpleView."""
        pass
