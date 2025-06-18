import traceback
import io
import contextlib
import ast
from agents import function_tool


@function_tool
def run_code(code: str) -> str:
    """Execute Python code and return stdout or error."""
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer):
            exec(code, {})
        return buffer.getvalue()
    except Exception as e:
        return f"Error:\n{traceback.format_exc()}"

@function_tool
def explain_code(code: str) -> str:
    """Analyze and explain what a Python code snippet does."""
    try:
        tree = ast.parse(code)
        functions = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
        return f"Functions found: {functions}. AST structure parsed successfully."
    except Exception as e:
        return f"Failed to parse code: {e}"

@function_tool
def generate_tests(code: str) -> str:
    """Create simple test functions based on the provided Python function."""
    return (
        "# Basic test skeleton\n"
        "def test_function():\n"
        "    assert your_function() == expected_value\n"
        "# Replace with real inputs and outputs"
    )

@function_tool
def format_code(code: str) -> str:
    """Autoformat code using Black-style rules."""
    try:
        import black
        mode = black.FileMode()
        return black.format_str(code, mode=mode)
    except Exception as e:
        return f"Error formatting code: {e}"
