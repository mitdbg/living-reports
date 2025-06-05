from typing import Dict, Any, List
from template import Template
from execution_result import ExecutionResult
from view import View
from simple_view import SimpleView


class DiffView(View):
    """
    View that handles two templates (current and suggested) with diffs.
    """

    def __init__(
        self,
        current_template: Template,
        current_result: ExecutionResult,
        suggested_template: Template,
        suggested_result: ExecutionResult,
        client=None,
        display_mode: str = "output_only"
    ):
        """
        Initialize a DiffView with current and suggested templates and results.

        Args:
            current_template: The current template
            current_result: The execution result for the current template
            suggested_template: The suggested template
            suggested_result: The execution result for the suggested template
            client: The OpenAI client instance
            display_mode: The mode to display the output (output_only, side_by_side, etc.)
        """
        self.current_template = current_template
        self.current_result = current_result
        self.suggested_template = suggested_template
        self.suggested_result = suggested_result
        self.client = client
        self.view_type = "diff"
        self.display_mode = display_mode
        self.line_diffs = self._compute_line_diffs()

    def _compute_line_diffs(self) -> List[Dict[str, Any]]:
        """
        Compute differences between the templates line by line.

        Returns:
            List of line change records
        """
        line_diffs = []
        current_lines = self.current_template.template_text.split("\n")
        suggested_lines = self.suggested_template.template_text.split("\n")

        # Improved diff algorithm
        max_lines = max(len(current_lines), len(suggested_lines))

        for i in range(max_lines):
            # Get the lines if they exist, or empty string otherwise
            current_line = current_lines[i] if i < len(current_lines) else ""
            suggested_line = suggested_lines[i] if i < len(suggested_lines) else ""

            # Check if lines differ to create a diff entry
            if current_line != suggested_line:
                line_diffs.append(
                    {
                        "lineIndex": i,
                        "originalLine": current_line,
                        "suggestedLine": suggested_line,
                        # Add metadata to help with rendering
                        "changeType": "modified"
                        if current_line and suggested_line
                        else "added"
                        if not current_line
                        else "removed",
                    }
                )

        return line_diffs

    def render_template(self) -> Dict[str, Any]:
        """
        Render the template with diff highlighting.

        Returns:
            Dictionary with template information and line diffs
        """
        return {
            "current_template": self.current_template.template_text,
            "suggested_template": self.suggested_template.template_text,
            "line_diffs": self.line_diffs,
            "view_type": self.view_type,
        }

    def render_output(self) -> Dict[str, Any]:
        """
        Render the output with diff highlighting.

        Returns:
            Dictionary with output information for both versions
        """
        # For the default API response format (backward compatibility)
        result = {
            "result": self.suggested_result.rendered_output,  # Default to suggested version
            "variables": self.suggested_result.get_variables_dict(),
            "cache_info": {
                "variables_count": len(self.suggested_result.variables),
                "cached": True,
            },
            "view_type": self.view_type,
            # Additional diff-specific fields
            "current_output": self.current_result.rendered_output,
            "suggested_output": self.suggested_result.rendered_output,
            "current_variables": self.current_result.get_variables_dict(),
            "suggested_variables": self.suggested_result.get_variables_dict(),
            "line_diffs": self.line_diffs,
            "display_mode": self.display_mode,
        }
        
        # Add variable references for the 'output_and_variables' mode
        if self.display_mode == "output_and_variables":
            # Add variable definitions to find differences
            result["current_variable_definitions"] = self._get_variable_definitions(self.current_template)
            result["suggested_variable_definitions"] = self._get_variable_definitions(self.suggested_template)
            
            # Create marked output with variable processing info
            result["variable_map"] = self.current_result.get_variables_dict()
            
            # Create a variable map for the frontend to use for display
            variables_info = self._create_variables_info()
            result["variables_info"] = variables_info

        return result
        
    def _create_variables_info(self) -> Dict[str, Dict[str, Any]]:
        """
        Create a comprehensive mapping of variables with all information needed for display.
        This helps the frontend correctly display and highlight variable references.
        
        Returns:
            Dictionary with variable information
        """
        variables_info = {}
        var_dict = self.current_result.get_variables_dict()
        
        # Get variable definitions
        current_defs = self._get_variable_definitions(self.current_template)
        suggested_defs = self._get_variable_definitions(self.suggested_template)
        
        # Build a comprehensive info structure for each variable
        for var_name, var_value in var_dict.items():
            variables_info[var_name] = {
                "name": var_name,
                "value": var_value,
                "current_definition": current_defs.get(var_name, ""),
                "suggested_definition": suggested_defs.get(var_name, ""),
                "has_diff": current_defs.get(var_name, "") != suggested_defs.get(var_name, "")
            }
            
        return variables_info
        
    def _get_variable_definitions(self, template: Template) -> Dict[str, str]:
        """
        Extract variable definitions from template.
        
        Args:
            template: Template object to extract variables from
            
        Returns:
            Dictionary mapping variable names to their definition strings
        """
        definitions = {}
        template_text = template.template_text
        
        # Simple regex pattern to find variable definitions
        import re
        # Find patterns like {{variable:=...}}
        pattern = r"{{([^:]+):=([^}]+)}}"
        matches = re.findall(pattern, template_text)
        
        for name, definition in matches:
            name = name.strip()
            definition = definition.strip()
            definitions[name] = f"{{{{{name}:={definition}}}}}"
        
        return definitions

    def update_from_editor(
        self,
        editor_content: str,
        change_type: str = None,
        line_index: int = None,
        line_content: str = None,
    ) -> None:
        """
        Parse the editor content and update appropriate templates.

        Args:
            editor_content: The complete editor content
            change_type: Optional - "current" or "suggested" indicating which template is being updated
            line_index: Optional - Index of the line being changed
            line_content: Optional - New content for the specific line
        """
        # If we have specific line changes with change_type
        if change_type and line_index is not None and line_content is not None:
            # Split the template into lines
            if change_type == "current":
                lines = self.current_template.template_text.split("\n")
                if 0 <= line_index < len(lines):
                    lines[line_index] = line_content
                    new_template_text = "\n".join(lines)
                    self.current_template = Template(new_template_text)
                    # Re-execute with current variables to update result
                    self.current_result = self.current_template.execute(
                        self.client,
                        ExecutionResult(variables=self.current_result.variables.copy()),
                        mode=self.display_mode
                    )
            elif change_type == "suggested":
                lines = self.suggested_template.template_text.split("\n")
                if 0 <= line_index < len(lines):
                    lines[line_index] = line_content
                    new_template_text = "\n".join(lines)
                    self.suggested_template = Template(new_template_text)
                    # Re-execute with current variables to update result
                    self.suggested_result = self.suggested_template.execute(
                        self.client,
                        ExecutionResult(variables=self.current_result.variables.copy()),
                        mode=self.display_mode
                    )
        else:
            # Parse the diff view editor content to extract both templates
            current_template_text, suggested_template_text = self.parse_diff_content(editor_content)
            
            # Update both templates and execute them
            if current_template_text is not None:
                self.current_template = Template(current_template_text)
                self.current_result = self.current_template.execute(
                    self.client,
                    ExecutionResult(variables=self.current_result.variables.copy()),
                    mode=self.display_mode
                )
                
            if suggested_template_text is not None:
                self.suggested_template = Template(suggested_template_text)
                self.suggested_result = self.suggested_template.execute(
                    self.client,
                    ExecutionResult(variables=self.current_result.variables.copy()),
                    mode=self.display_mode
                )

        # Recompute line diffs
        self.line_diffs = self._compute_line_diffs()
        
    def parse_diff_content(self, editor_content: str) -> tuple:
        """
        Parse the editor content from diff view to extract current and suggested templates.
        
        The diff view content has:
        - Regular lines (unchanged) - included in both templates
        - Lines with removed spans (<span class="removed-text">) - included only in current template
        - Lines with added spans (<span class="added-text">) - included only in suggested template
        
        Args:
            editor_content: The complete HTML editor content with diff markups
            
        Returns:
            Tuple of (current_template_text, suggested_template_text)
        """
        import re
        import html
        
        # Special case: if no HTML markup, this is plain text that should be used for both templates
        if not ("<span" in editor_content and "class=" in editor_content):
            return editor_content, editor_content
        
        # Get the original template structure to preserve exact newlines
        # First, extract all the divs with their line indices to ensure correct order
        div_pattern = r'<div[^>]*class="suggestion-line"[^>]*data-line-index="(\d+)"[^>]*>(.*?)</div>'
        line_matches = re.findall(div_pattern, editor_content, re.DOTALL)
        
        # Sort by line index to ensure correct order
        line_matches.sort(key=lambda x: int(x[0]))
        
        # Prepare two arrays to hold lines for each template
        # Use lists of the correct size filled with None initially
        max_line_index = max([int(idx) for idx, _ in line_matches]) if line_matches else 0
        current_lines = [None] * (max_line_index + 1)  
        suggested_lines = [None] * (max_line_index + 1)
        
        # Process each div and extract content for each template
        for line_index_str, line_content in line_matches:
            line_index = int(line_index_str)
            
            # Check if line has removals (red)
            has_removal = 'class="removed-text"' in line_content
            # Check if line has additions (green)
            has_addition = 'class="added-text"' in line_content
            
            if has_removal and has_addition:
                # Line has both removals and additions - extract each part
                removed_match = re.search(r'<span class="removed-text"[^>]*>(.*?)</span>', line_content)
                added_match = re.search(r'<span class="added-text"[^>]*>(.*?)</span>', line_content)
                
                if removed_match:
                    current_lines[line_index] = html.unescape(removed_match.group(1))
                if added_match:
                    suggested_lines[line_index] = html.unescape(added_match.group(1))
            elif has_removal:
                # Line only has removal - appears only in current template
                removed_match = re.search(r'<span class="removed-text"[^>]*>(.*?)</span>', line_content)
                if removed_match:
                    current_lines[line_index] = html.unescape(removed_match.group(1))
            elif has_addition:
                # Line only has addition - appears only in suggested template
                added_match = re.search(r'<span class="added-text"[^>]*>(.*?)</span>', line_content)
                if added_match:
                    suggested_lines[line_index] = html.unescape(added_match.group(1))
            else:
                # Regular line - appears in both templates
                # Remove any HTML tags and decode entities
                plain_line = re.sub(r'<[^>]*>', '', line_content)
                plain_line = html.unescape(plain_line)
                current_lines[line_index] = plain_line
                suggested_lines[line_index] = plain_line
        
        # Filter out None values while preserving empty lines
        current_lines = [line if line is not None else "" for line in current_lines]
        suggested_lines = [line if line is not None else "" for line in suggested_lines]
        
        # Join the lines with newlines to preserve original structure
        current_template_text = "\n".join(current_lines)
        suggested_template_text = "\n".join(suggested_lines)
        
        print(f"Parsed templates - Current: {len(current_template_text)} chars, Suggested: {len(suggested_template_text)} chars")
        
        return current_template_text, suggested_template_text

    def handle_template_change(self, template_text: str) -> None:
        """
        Handle changes to templates based on diff information.

        Args:
            template_text: The new template text
        """
        self.suggested_template = Template(template_text)
        self.suggested_result = self.suggested_template.execute(
            self.client,
            ExecutionResult(variables=self.current_result.variables.copy()),
            mode=self.display_mode
        )
        self.line_diffs = self._compute_line_diffs()

    def accept_suggestion(self) -> SimpleView:
        """
        Accept the suggested template.
        
        This uses the current state of the suggested template,
        which may have been updated through editor interactions.

        Returns:
            SimpleView with the suggested template
        """
        # Preserve the exact template text without modifying any whitespace
        template_text = self.suggested_template.template_text
        
        # Create a new template with the text
        template = Template(template_text)
        
        # Re-execute the template to ensure result is up-to-date
        result = template.execute(
            self.client,
            ExecutionResult(variables=self.suggested_result.variables.copy()),
            mode=self.display_mode
        )
        
        # Create a new SimpleView with the template and result
        simple_view = SimpleView(template, result, self.client)
        
        print(f"Accepting suggestion: Template length = {len(template_text)}, whitespace preserved")
        
        return simple_view

    def reject_suggestion(self) -> SimpleView:
        """
        Reject the suggested template.
        
        This uses the current state of the current template,
        which may have been updated through editor interactions.

        Returns:
            SimpleView with the current template
        """
        # Preserve the exact template text without modifying any whitespace
        template_text = self.current_template.template_text
        
        # Create a new template with the text
        template = Template(template_text)
        
        # Re-execute the template to ensure result is up-to-date
        result = template.execute(
            self.client,
            ExecutionResult(variables=self.current_result.variables.copy()),
            mode=self.display_mode
        )
        
        # Create a new SimpleView with the template and result
        simple_view = SimpleView(template, result, self.client)
        
        print(f"Rejecting suggestion: Template length = {len(template_text)}, whitespace preserved")
        
        return simple_view

    def to_simple_view(self) -> SimpleView:
        """
        Convert to a SimpleView using the current template.

        Returns:
            SimpleView with the current template
        """
        return SimpleView(self.current_template, self.current_result, self.client)
        
    def set_display_mode(self, mode: str) -> None:
        """
        Set the display mode for the diff view.
        
        Args:
            mode: The mode to display the output (output_only, etc.)
        """
        self.display_mode = mode