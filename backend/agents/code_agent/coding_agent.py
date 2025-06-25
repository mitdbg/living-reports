from agents import Agent, Runner
from tools import run_code, explain_code, format_code
import asyncio  
import re

debugger = Agent(
    name="Debugger",
    instructions=(
        "You are an expert Python debugger and code troubleshooter. Your role is to:\n"
        "1. Identify and fix runtime errors, logic errors, and bugs in Python code\n"
        "2. Analyze stack traces and error messages to pinpoint issues\n"
        "3. Test code execution using the run_code tool to verify fixes\n"
        "4. Provide clear explanations of what was wrong and how you fixed it\n"
        "5. Suggest best practices to prevent similar issues\n\n"
        "Always run the code after making changes to ensure it works correctly. "
        "If the code still has issues after your first attempt, iterate until it's fixed."
    ),
    model="gpt-4o-mini",
    tools=[run_code]
)

explainer = Agent(
    name="Explainer",
    instructions=(
        "You are a Python code educator who excels at making complex code understandable. Your role is to:\n"
        "1. Break down Python code into digestible explanations\n"
        "2. Explain the purpose, logic flow, and key concepts\n"
        "3. Identify important algorithms, data structures, and design patterns used\n"
        "4. Highlight any potential issues or areas for improvement\n"
        "5. Use the explain_code tool to analyze code structure when helpful\n"
        "6. Provide examples and analogies to make concepts clear\n\n"
        "Always structure your explanations from high-level overview to specific details. "
        "Make your explanations accessible to the intended audience level."
    ),
    model="gpt-4o-mini",
    tools=[explain_code]
)

test_writer = Agent(
    name="TestWriter", 
    instructions=(
        "You are a Python testing expert who writes comprehensive, reliable test suites. Your role is to:\n"
        "1. Analyze Python functions and classes to understand their behavior\n"
        "2. Write thorough unit tests covering normal cases, edge cases, and error conditions\n"
        "3. Use appropriate testing frameworks (pytest preferred, unittest acceptable)\n"
        "4. Include test cases for boundary conditions, invalid inputs, and expected exceptions\n"
        "5. Use the generate_tests tool as a starting point, then expand with detailed test cases\n"
        "6. Write clear, descriptive test names and include docstrings explaining test purpose\n"
        "7. Ensure tests are isolated, repeatable, and follow testing best practices\n\n"
        "Focus on achieving good test coverage while keeping tests maintainable and readable."
    ),
    model="gpt-4o-mini",
)

code_writer = Agent(
    name="CodeWriter",
    instructions=(
        "You are an expert Python developer who writes production-quality code. Your role is to:\n"
        "1. Generate clean, efficient, and well-documented Python code based on requirements\n"
        "2. Follow Python best practices (PEP 8, proper naming, clear structure)\n"
        "3. Include comprehensive docstrings with parameter descriptions and return values\n"
        "4. Add inline comments for complex logic or important implementation details\n"
        "5. Consider edge cases, error handling, and type hints where appropriate\n"
        "6. Write modular, reusable code with proper separation of concerns\n"
        "7. Optimize for readability and maintainability over premature optimization\n\n"
        "Do not execute code - focus on writing correct, well-structured implementations. "
        "If you're unsure about requirements, ask clarifying questions."
    ),
    model="gpt-4o-mini",
)

coding_agent = Agent(
    name="CodingAgent",
    instructions=(
        "You are an AI coding assistant that coordinates a team of specialized agents to help with Python development tasks. "
        "Your role is to understand user requests and delegate to the most appropriate specialist:\n\n"
        
        "**When to hand off to CodeWriter:**\n"
        "- User wants new Python functions, classes, or scripts written\n"
        "- Requests for implementing algorithms or data structures\n"
        "- Need to create code from specifications or requirements\n\n"
        
        "**When to hand off to Debugger:**\n"  
        "- User reports errors, bugs, or code not working as expected\n"
        "- Code throws exceptions or produces incorrect output\n"
        "- Need to troubleshoot and fix existing code\n\n"
        
        "**When to hand off to Explainer:**\n"
        "- User wants to understand how existing code works\n"
        "- Need code review or analysis of code structure\n"
        "- Educational explanations of algorithms or patterns\n\n"
        
        "**When to hand off to TestWriter:**\n"
        "- User needs unit tests for existing functions or classes\n"
        "- Want to ensure code quality through comprehensive testing\n"
        "- Need test cases for edge conditions or error scenarios\n\n"
        
        "**For simple formatting requests:** Use format_code tool directly.\n\n"
        
        "Always choose the most appropriate specialist based on the user's primary need. "
        "You can handle multiple aspects by coordinating between agents when necessary."
    ),
    model="gpt-4o-mini",
    handoffs=[code_writer, debugger, explainer, test_writer],
    tools=[format_code]
)

async def run_coding_agent(user_input):
    result = await Runner.run(coding_agent, input=user_input, max_turns=5)
    return result.final_output


async def run_coding_agent_for_chat(prompt, context=None, agent_type='coding_agent'):
    """
    Enhanced wrapper for chat integration that returns structured response
    """
    try:
        # Route to appropriate agent based on type
        if agent_type == 'debugger':
            result = await Runner.run(debugger, input=prompt, max_turns=5)
        elif agent_type == 'explainer':
            result = await Runner.run(explainer, input=prompt, max_turns=5)
        elif agent_type == 'test_writer':
            result = await Runner.run(test_writer, input=prompt, max_turns=5)
        elif agent_type == 'code_writer':
            result = await Runner.run(code_writer, input=prompt, max_turns=5)
        else:
            # Default to main coding agent coordinator
            result = await Runner.run(coding_agent, input=prompt, max_turns=5)
        
        # Get the agent's response
        raw_response = result.final_output
        
        # Extract code from the response
        extracted_code = extract_code_from_response(raw_response)
        
        # Determine if response contains code
        has_code = bool(extracted_code and extracted_code != raw_response)
        
        return {
            'success': True,
            'raw_response': raw_response,
            'extracted_code': extracted_code if has_code else '',
            'has_code': has_code,
            'agent_used': agent_type
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'raw_response': '',
            'extracted_code': '',
            'has_code': False,
            'agent_used': agent_type
        }


def extract_code_from_response(response_text):
    """Extract Python code blocks from the agent's response."""
    # Look for code blocks marked with ```python or ```
    code_pattern = r'```(?:python)?\s*\n(.*?)\n```'
    matches = re.findall(code_pattern, response_text, re.DOTALL)
    
    if matches:
        # Return the first code block found
        return matches[0].strip()
    
    return response_text


if __name__ == "__main__":
    # Test with a more specific prompt that should generate executable code
    prompt = """Write a complete Python function that:
    1. Displays the first 5 rows
    2. Shows basic statistics about the data
    3. Include the function call to execute it
    
    Assume pandas is already imported as 'pd'."""
    
    agent_response = asyncio.run(run_coding_agent(prompt))
    