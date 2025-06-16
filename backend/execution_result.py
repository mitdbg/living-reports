from typing import Dict, Any, Optional


class ExecutionResult:
    """
    Represents the result of a template execution.
    Manages variables and provides access to execution results.
    """

    def __init__(
        self, rendered_output: str = "", variables: Dict[str, Dict[str, Any]] = None,
        rendering_mode: str = "output_only"
    ):
        """
        Initialize an execution result.

        Args:
            rendered_output: The final rendered text after template execution
            variables: Dictionary of variables and their data (value and prompt)
            rendering_mode: The mode used for rendering ("output_only" or "output_and_variables")
        """
        self.rendered_output = rendered_output
        self.variables = variables or {}
        self.rendering_mode = rendering_mode

    def get_variable(self, name: str) -> Optional[str]:
        """Get a variable's value by name."""
        if name in self.variables:
            return self.variables[name]["value"]
        return None

    def set_variable(self, name: str, value: str, prompt: Optional[str] = None) -> None:
        """Set a variable's value and optional prompt."""
        self.variables[name] = {"value": value, "prompt": prompt}

    def clear_variables(self) -> None:
        """Clear all variables."""
        self.variables.clear()

    def get_variables_dict(self) -> Dict[str, str]:
        """Get a simplified dictionary of variable names to values."""
        return {name: data.get("value") for name, data in self.variables.items()}

    def get_variable_count(self) -> int:
        """Get the number of variables."""
        return len(self.variables)

    def to_response_dict(self, was_cached: bool = True) -> Dict[str, Any]:
        """Convert the result to a dictionary suitable for API response."""
        return {
            "result": self.rendered_output,
            "variables": self.get_variables_dict(),
            "cache_info": {
                "variables_count": self.get_variable_count(),
                "cached": was_cached,
            },
            "rendering_mode": self.rendering_mode,
        }
