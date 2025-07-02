from typing import Dict, Any, Optional, List
import re
import json
import os
import base64
from execution_result import ExecutionResult
from openai import OpenAI
from together import Together

class Template:
    """
    Represents a template with methods to process and execute it.
    """

    def __init__(self, template_text: str, document_id: str = None):
        """
        Initialize a template.

        Args:
            template_text: The raw template text
            document_id: The document ID for loading data lake items
        """
        self.template_text = template_text
        self.document_id = document_id
        self.variable_pattern = r"\{\{(\w+):=(.*?)\}\}"
        self.llm_pattern = r"^LLM\((.*)\)$"
        self.sum_pattern = r"^SUM\((.*)\)$"
        self.avg_pattern = r"^AVG\((.*)\)$"
        self.data_lake_items = self._load_data_lake_items()
        
    def _load_data_lake_items(self) -> Dict[str, Any]:
        """Load data lake items for the current document."""
        if not self.document_id:
            return {}
            
        try:
            data_lake_file = os.path.join(os.path.dirname(__file__), 'database', 'data_lake.json')
            if os.path.exists(data_lake_file):
                with open(data_lake_file, 'r') as f:
                    all_data_lake = json.load(f)
                    document_data_lake = all_data_lake.get(self.document_id, [])
                    
                    # Convert to dict for easier lookup by reference name
                    data_lake_dict = {}
                    for item in document_data_lake:
                        data_lake_dict[item.get('referenceName', '')] = item
                    
                    return data_lake_dict
        except Exception as e:
            print(f"Error loading data lake items: {e}")
            
        return {}
    
    def _render_data_source(self, reference_name: str) -> str:
        """Render a data source based on its type."""
        if reference_name not in self.data_lake_items:
            return f"${reference_name}"  # Keep original if not found
            
        item = self.data_lake_items[reference_name]
        content = item.get('content', '')
        item_type = item.get('type', 'unknown').lower()
        name = item.get('name', reference_name)
        
        # Handle different content types
        if item_type.startswith('image/'):
            # For images, create an HTML img tag
            if content.startswith('data:'):
                # Already a data URL
                return f'<img src="{content}" alt="{name}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 10px 0;" />'
            elif content.startswith('http://') or content.startswith('https://'):
                # File URL - use directly without conversion
                return f'<img src="{content}" alt="{name}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 10px 0;" />'
            else:
                # Try to detect if it's base64 encoded binary data
                try:
                    # If content looks like binary data, encode it as base64
                    if isinstance(content, str) and len(content) > 0:
                        # Check if it's already base64 or if it contains binary characters
                        if not content.startswith('data:') and any(ord(c) > 127 or ord(c) < 32 for c in content if c not in '\r\n\t'):
                            # Convert to base64
                            content_bytes = content.encode('latin1') if isinstance(content, str) else content
                            content = base64.b64encode(content_bytes).decode('ascii')
                        
                        # Create data URL with proper MIME type
                        data_url = f"data:{item_type};base64,{content}"
                        return f'<img src="{data_url}" alt="{name}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 10px 0;" />'
                except Exception:
                    pass
                
                # Fallback - return as text
                return f"[Image: {name}] (Unable to display)"
                
        elif item_type.startswith('video/'):
            # For videos, create an HTML video tag
            if content.startswith('data:'):
                return f'<video controls style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 10px 0;"><source src="{content}" type="{item_type}">Your browser does not support the video tag.</video>'
            else:
                # Try to detect if it's base64 encoded binary data
                try:
                    if isinstance(content, str) and len(content) > 0:
                        if not content.startswith('data:') and any(ord(c) > 127 or ord(c) < 32 for c in content if c not in '\r\n\t'):
                            content_bytes = content.encode('latin1') if isinstance(content, str) else content
                            content = base64.b64encode(content_bytes).decode('ascii')
                        
                        data_url = f"data:{item_type};base64,{content}"
                        return f'<video controls style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 10px 0;"><source src="{data_url}" type="{item_type}">Your browser does not support the video tag.</video>'
                except Exception:
                    pass
                
                return f"[Video: {name}] (Unable to display)"
                
        elif item_type == 'text/csv' or name.lower().endswith('.csv'):
            # For CSV files, render as HTML table
            try:
                import csv
                import io
                
                # Parse CSV content
                csv_reader = csv.reader(io.StringIO(content))
                rows = list(csv_reader)
                
                if not rows:
                    return content  # Return raw content if empty
                
                # Build HTML table
                html_parts = ['<table class="csv-table" style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 14px;">']
                
                # Header row
                if len(rows) > 0:
                    html_parts.append('<thead><tr>')
                    for cell in rows[0]:
                        escaped_cell = self._escape_html(str(cell))
                        html_parts.append(f'<th style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; font-weight: 600; color: #495057;">{escaped_cell}</th>')
                    html_parts.append('</tr></thead>')
                
                # Data rows
                if len(rows) > 1:
                    html_parts.append('<tbody>')
                    for i, row in enumerate(rows[1:], 1):
                        row_style = 'background: #f8f9fa;' if i % 2 == 0 else 'background: white;'
                        html_parts.append(f'<tr style="{row_style}">')
                        for cell in row:
                            escaped_cell = self._escape_html(str(cell))
                            html_parts.append(f'<td style="border: 1px solid #dee2e6; padding: 8px 12px;">{escaped_cell}</td>')
                        html_parts.append('</tr>')
                    html_parts.append('</tbody>')
                
                html_parts.append('</table>')
                return ''.join(html_parts)
                
            except Exception:
                # If CSV parsing fails, return as plain text
                return content
                
        else:
            # For all other types (text, markdown, json, xml, etc.), return the raw content
            return content
            
    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        if not isinstance(text, str):
            text = str(text)
        return (text.replace('&', '&amp;')
                   .replace('<', '&lt;')
                   .replace('>', '&gt;')
                   .replace('"', '&quot;')
                   .replace("'", '&#x27;'))

    @staticmethod
    def _call_llm(client: Any, prompt: str):
            if isinstance(client, OpenAI):
                return client.chat.completions.create(
                    model="gpt-4.1-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                )
            elif isinstance(client, Together):
                return client.chat.completions.create(
                    model="Qwen/Qwen2.5-Coder-32B-Instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                )
            else:
                raise ValueError(f"Unsupported client type: {type(client)}")
            
    def execute(
        self, client: Any, existing_result: Optional[ExecutionResult] = None,
        mode: str = "output_only"
    ) -> ExecutionResult:
        """
        Execute the template and return the result.

        Args:
            client: Any client for LLM calls
            existing_result: Optional existing result to use for variables
            mode: Rendering mode, can be "output_only" or "output_and_variables"

        Returns:
            ExecutionResult containing the processed template and variables
        """
        # Initialize result with existing variables if provided
        result = existing_result or ExecutionResult()

        # Process the template based on mode
        if mode == "output_and_variables":
            processed_text = self._process_template_with_references(client, result.variables)
        else:
            processed_text = self._process_template(client, result.variables)

        print(f"++++++++++++ Template Processed text: {processed_text}")
        # Update the result
        result.rendered_output = processed_text
        result.rendering_mode = mode

        return result

    def _process_template(
        self, client: Any, variables: Dict[str, Dict[str, Any]]
    ) -> str:
        """Process the template text, evaluating variables and LLM calls."""

        # Track variable instance counts for unique identification
        variable_instances = {}

        # Helper function to substitute variables in any text
        def substitute_all_variables(text: str) -> str:
            # Replace $name format
            def substitute_variable(match):
                var_name = match.group(1)
                if var_name in variables:
                    # Track instance count for this variable
                    if var_name not in variable_instances:
                        variable_instances[var_name] = 0
                    variable_instances[var_name] += 1
                    
                    value = variables[var_name].get("value", "")
                    # Wrap in span with metadata for content-to-template mapping
                    return f'<span class="var-ref" data-var="{var_name}" data-instance="{variable_instances[var_name]}" data-value="{value}">{value}</span>'
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                
                return f"${var_name}"  # Keep original if not found

            text = re.sub(r"\$(\w+)", substitute_variable, text)

            # Replace {{$name}} format
            def substitute_curly_variable(match):
                var_name = match.group(1)
                if var_name in variables:
                    # Track instance count for this variable
                    if var_name not in variable_instances:
                        variable_instances[var_name] = 0
                    variable_instances[var_name] += 1
                    
                    value = variables[var_name].get("value", "")
                    # Wrap in span with metadata for content-to-template mapping
                    return f'<span class="var-ref" data-var="{var_name}" data-instance="{variable_instances[var_name]}" data-value="{value}">{value}</span>'
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                        
                return f"{{{{${var_name}}}}}"  # Keep original if not found

            text = re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, text)
            
            # Replace {{variable_name}} format (without $) - but avoid {{name:=value}} patterns
            def substitute_simple_curly_variable(match):
                var_name = match.group(1)
                # Skip if this looks like a variable assignment (contains :=)
                full_match = match.group(0)
                if ':=' in full_match:
                    return full_match  # Keep assignment syntax unchanged
                    
                if var_name in variables:
                    # Track instance count for this variable
                    if var_name not in variable_instances:
                        variable_instances[var_name] = 0
                    variable_instances[var_name] += 1
                    
                    value = variables[var_name].get("value", "")
                    # Wrap in span with metadata for content-to-template mapping
                    return f'<span class="var-ref" data-var="{var_name}" data-instance="{variable_instances[var_name]}" data-value="{value}">{value}</span>'
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                        
                return f"{{{{{var_name}}}}}"  # Keep original if not found

            return re.sub(r"\{\{(\w+)\}\}", substitute_simple_curly_variable, text)

        # Process {{name:=prompt}} format with multiple modes:
        # 1. {{name:=LLM(prompt)}} - Execute prompt with LLM and store the result
        # 2. {{name:=SUM(numbers)}} - Calculate sum of numbers and store the result
        # 3. {{name:=AVG(numbers)}} - Calculate average of numbers and store the result
        # 4. {{name:=value}} - Set the value directly without processing
        def process_prompt_template(match) -> str:
            name = match.group(1)
            content = match.group(2)

            # Substitute all variables in the content
            content = substitute_all_variables(content)

            # Check if this is an LLM call: {{name:=LLM(prompt)}}
            llm_match = re.match(self.llm_pattern, content)
            # Check if this is a SUM call: {{name:=SUM(numbers)}}
            sum_match = re.match(self.sum_pattern, content)
            # Check if this is an AVG call: {{name:=AVG(numbers)}}
            avg_match = re.match(self.avg_pattern, content)

            if llm_match:
                # This is an LLM call
                prompt = llm_match.group(1)

                # Check if the variable already exists and has the same prompt
                if name in variables and variables[name]["prompt"] == prompt:
                    # No need to recompute, use the cached value
                    print(f"Using cached value for variable '{name}'")
                    return variables[name]["value"]

                try:
                    # Execute prompt with LLM - only if the prompt is new or changed
                    prompt += "\n\n Directly return results."
                    response = Template._call_llm(client, prompt)

                    result = response.choices[0].message.content
                    # Store result and prompt in variables
                    variables[name] = {"value": result, "prompt": prompt}
                    print(f"Computed new value for variable '{name}' using LLM", result)
                    return result
                except Exception as e:
                    error_msg = f"Error processing template: {str(e)}"
                    return error_msg
            elif sum_match:
                # This is a SUM call
                numbers_content = sum_match.group(1)
                
                # Check if the variable already exists and has the same content
                if name in variables and variables[name]["prompt"] == numbers_content:
                    print(f"Using cached value for variable '{name}'")
                    return variables[name]["value"]
                
                # Process the SUM function
                result = self._process_sum(numbers_content, variables)
                variables[name] = {"value": result, "prompt": numbers_content}
                print(f"Computed SUM for variable '{name}': {result}")
                return result
            elif avg_match:
                # This is an AVG call
                numbers_content = avg_match.group(1)
                
                # Check if the variable already exists and has the same content
                if name in variables and variables[name]["prompt"] == numbers_content:
                    print(f"Using cached value for variable '{name}'")
                    return variables[name]["value"]
                
                # Process the AVG function
                result = self._process_avg(numbers_content, variables)
                variables[name] = {"value": result, "prompt": numbers_content}
                print(f"Computed AVG for variable '{name}': {result}")
                return result
            else:
                # This is a direct value assignment
                # Store the value directly
                variables[name] = {"value": content, "prompt": None}
                print(f"Set variable '{name}' directly to value")
                return content

        # Process all {{name:=content}} templates, where content can be LLM(prompt) or direct value
        processed = ""
        last_end = 0

        # Get the template to process. This will not be modified by the template execution. This will stay the same through the iteration
        template_to_process = self.template_text

        # Process templates one by one in order
        for match in re.finditer(self.variable_pattern, template_to_process):
            # Add text before this match
            processed += template_to_process[last_end : match.start()]

            # Process this template and add its result
            _ = process_prompt_template(match)

            # Update last_end position
            last_end = match.end()

        # Add any remaining text
        processed += template_to_process[last_end:]

        # Final variable substitution for any remaining variables
        processed = substitute_all_variables(processed)

        return processed
        
    def _process_template_with_references(self, client: Any, variables: Dict[str, Dict[str, Any]]) -> str:
        """
        Process the template text with variable references preserved.
        This works like _process_template but preserves variable references with format $name: value
        
        Args:
            client: Any client for LLM calls
            variables: Dictionary of variables to use for substitution
            
        Returns:
            Processed template text with variable references preserved
        """
        print(f"Processing template with references mode: {len(variables)} variables")
        # Helper function to substitute variables in text but preserving references
        def substitute_with_references(text: str) -> str:
            # Replace $name format with $name: value
            def substitute_variable(match):
                var_name = match.group(1)
                if var_name in variables:
                    # Special marked-up format for variables
                    formatted = f"$${var_name}:{{{variables[var_name]['value']}}}"
                    print(f"Formatting variable {var_name} as: {formatted}")
                    return formatted
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                
                return f"${var_name}"  # Keep original if not found
            
            text = re.sub(r"\$(\w+)", substitute_variable, text)
            
            # Replace {{$name}} format with $name: value
            def substitute_curly_variable(match):
                var_name = match.group(1)
                if var_name in variables:
                    # Special marked-up format for variables
                    return f"$${var_name}:{{{variables[var_name]['value']}}}"
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                        
                return f"{{{{${var_name}}}}}"  # Keep original if not found
            
            text = re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, text)
            
            # Replace {{variable_name}} format (without $) - but avoid {{name:=value}} patterns
            def substitute_simple_curly_variable(match):
                var_name = match.group(1)
                # Skip if this looks like a variable assignment (contains :=)
                full_match = match.group(0)
                if ':=' in full_match:
                    return full_match  # Keep assignment syntax unchanged
                    
                if var_name in variables:
                    # Special marked-up format for variables in references mode
                    return f"$${var_name}:{{{variables[var_name]['value']}}}"
                else:
                    # Check if it's a data source reference
                    rendered_data_source = self._render_data_source(var_name)
                    if rendered_data_source != f"${var_name}":  # Found a data source
                        return rendered_data_source
                        
                return f"{{{{{var_name}}}}}"  # Keep original if not found
            
            return re.sub(r"\{\{(\w+)\}\}", substitute_simple_curly_variable, text)
        
        # Process {{name:=prompt}} format like in _process_template
        # but without returning the processed result
        def process_prompt_template(match) -> str:
            name = match.group(1)
            content = match.group(2)
            
            # Substitute all variables in the content
            content = substitute_with_references(content)
            
            # Check if this is an LLM call: {{name:=LLM(prompt)}}
            llm_match = re.match(self.llm_pattern, content)
            # Check if this is a SUM call: {{name:=SUM(numbers)}}
            sum_match = re.match(self.sum_pattern, content)
            # Check if this is an AVG call: {{name:=AVG(numbers)}}
            avg_match = re.match(self.avg_pattern, content)
            
            if llm_match:
                # This is an LLM call
                prompt = llm_match.group(1)
                
                # Check if the variable already exists and has the same prompt
                if name in variables and variables[name]["prompt"] == prompt:
                    # Variable exists, empty string - we'll substitute it later
                    return ""
                
                try:
                    # Execute prompt with LLM if needed
                    response = Template._call_llm(client, prompt)
                    
                    result = response.choices[0].message.content
                    # Store result and prompt in variables
                    variables[name] = {"value": result, "prompt": prompt}
                    return ""
                except Exception as e:
                    error_msg = f"Error processing template: {str(e)}"
                    variables[name] = {"value": error_msg, "prompt": prompt}
                    return ""
            elif sum_match:
                # This is a SUM call
                numbers_content = sum_match.group(1)
                
                # Check if the variable already exists and has the same content
                if name in variables and variables[name]["prompt"] == numbers_content:
                    return ""
                
                # Process the SUM function
                result = self._process_sum(numbers_content, variables)
                variables[name] = {"value": result, "prompt": numbers_content}
                return ""
            elif avg_match:
                # This is an AVG call
                numbers_content = avg_match.group(1)
                
                # Check if the variable already exists and has the same content
                if name in variables and variables[name]["prompt"] == numbers_content:
                    return ""
                
                # Process the AVG function
                result = self._process_avg(numbers_content, variables)
                variables[name] = {"value": result, "prompt": numbers_content}
                return ""
            else:
                # This is a direct value assignment
                variables[name] = {"value": content, "prompt": None}
                return ""
        
        # Process all {{name:=content}} templates first to collect variables
        # This is similar to _process_template but doesn't insert the values yet
        processed = ""
        last_end = 0
        
        # Get the template to process
        template_to_process = self.template_text
        
        # First pass: Process all variable definitions
        for match in re.finditer(self.variable_pattern, template_to_process):
            # Add text before this match
            processed += template_to_process[last_end : match.start()]
            
            # Process this template without adding result yet
            _ = process_prompt_template(match)
            
            # Update last_end position
            last_end = match.end()
        
        # Add any remaining text
        processed += template_to_process[last_end:]
        
        # Second pass: substitute variables with the special format
        processed = substitute_with_references(processed)
        
        return processed

    def _parse_numbers(self, content: str) -> List[float]:
        """Parse numbers from a string, supporting various formats."""
        try:
            # Split by common delimiters and filter out empty strings
            parts = re.split(r'[,;\s]+', content.strip())
            numbers = []
            
            for part in parts:
                part = part.strip()
                if part:  # Skip empty parts
                    try:
                        # Try to convert to float
                        numbers.append(float(part))
                    except ValueError:
                        # Skip non-numeric parts
                        continue
            
            return numbers
        except Exception:
            return []

    def _process_sum(self, content: str, variables: Dict[str, Dict[str, Any]]) -> str:
        """Process SUM function: SUM(1,2,3) or SUM($var1,$var2) etc."""
        try:
            # First substitute any variables in the content
            content = self._substitute_variables_in_content(content, variables)
            
            # Parse numbers from the content
            numbers = self._parse_numbers(content)
            
            if not numbers:
                return "0"  # Return 0 if no valid numbers found
            
            result = sum(numbers)
            return str(result)
            
        except Exception as e:
            return f"Error in SUM: {str(e)}"

    def _process_avg(self, content: str, variables: Dict[str, Dict[str, Any]]) -> str:
        """Process AVG function: AVG(1,2,3) or AVG($var1,$var2) etc."""
        try:
            # First substitute any variables in the content
            content = self._substitute_variables_in_content(content, variables)
            
            # Parse numbers from the content
            numbers = self._parse_numbers(content)
            
            if not numbers:
                return "0"  # Return 0 if no valid numbers found
            
            result = sum(numbers) / len(numbers)
            return str(result)
            
        except Exception as e:
            return f"Error in AVG: {str(e)}"

    def _substitute_variables_in_content(self, content: str, variables: Dict[str, Dict[str, Any]]) -> str:
        """Helper function to substitute variables in content."""
        # Replace $name format
        def substitute_variable(match):
            var_name = match.group(1)
            if var_name in variables:
                return variables[var_name]["value"]
            else:
                # Check if it's a data source reference
                rendered_data_source = self._render_data_source(var_name)
                if rendered_data_source != f"${var_name}":  # Found a data source
                    return rendered_data_source
            
            return f"${var_name}"  # Keep original if not found

        content = re.sub(r"\$(\w+)", substitute_variable, content)

        # Replace {{$name}} format
        def substitute_curly_variable(match):
            var_name = match.group(1)
            if var_name in variables:
                return variables[var_name]["value"]
            else:
                # Check if it's a data source reference
                rendered_data_source = self._render_data_source(var_name)
                if rendered_data_source != f"${var_name}":  # Found a data source
                    return rendered_data_source
            
            return f"{{{{${var_name}}}}}"  # Keep original if not found

        return re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, content)
