from typing import Dict, Any, Optional, List
import re
from execution_result import ExecutionResult
from openai import OpenAI
from together import Together

class Template:
    """
    Represents a template with methods to process and execute it.
    """

    def __init__(self, template_text: str):
        """
        Initialize a template.

        Args:
            template_text: The raw template text
        """
        self.template_text = template_text
        self.variable_pattern = r"\{\{(\w+):=(.*?)\}\}"
        self.llm_pattern = r"^LLM\((.*)\)$"
        self.sum_pattern = r"^SUM\((.*)\)$"
        self.avg_pattern = r"^AVG\((.*)\)$"
        
    @staticmethod
    def _call_llm(client: Any, prompt: str):
            if isinstance(client, OpenAI):
                return client.chat.completions.create(
                    model="gpt-3.5-turbo",
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
                    
                    value = variables[var_name]["value"]
                    # Wrap in span with metadata for content-to-template mapping
                    return f'<span class="var-ref" data-var="{var_name}" data-instance="{variable_instances[var_name]}" data-value="{value}">{value}</span>'
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
                    
                    value = variables[var_name]["value"]
                    # Wrap in span with metadata for content-to-template mapping
                    return f'<span class="var-ref" data-var="{var_name}" data-instance="{variable_instances[var_name]}" data-value="{value}">{value}</span>'
                return f"{{{{${var_name}}}}}"  # Keep original if not found

            return re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, text)

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
                return f"${var_name}"  # Keep original if not found
            
            text = re.sub(r"\$(\w+)", substitute_variable, text)
            
            # Replace {{$name}} format with $name: value
            def substitute_curly_variable(match):
                var_name = match.group(1)
                if var_name in variables:
                    # Special marked-up format for variables
                    return f"$${var_name}:{{{variables[var_name]['value']}}}"
                return f"{{{{${var_name}}}}}"  # Keep original if not found
            
            return re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, text)
        
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
            return f"${var_name}"  # Keep original if not found

        content = re.sub(r"\$(\w+)", substitute_variable, content)

        # Replace {{$name}} format
        def substitute_curly_variable(match):
            var_name = match.group(1)
            if var_name in variables:
                return variables[var_name]["value"]
            return f"{{{{${var_name}}}}}"  # Keep original if not found

        return re.sub(r"\{\{\$(\w+)\}\}", substitute_curly_variable, content)
