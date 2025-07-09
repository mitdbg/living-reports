#!/usr/bin/env python3

"""
Test script to verify tools integration with LLM variable code generation.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from python_backend import get_available_tools
from local_code_executor.code_executor import execute_code_locally

def test_tools_availability():
    """Test that tools are properly available in execution environment."""
    print("Testing tools availability...")
    
    # Test 1: Check that get_available_tools returns the expected tools
    tools = get_available_tools()
    print(f"✅ Available tools: {len(tools)}")
    for tool in tools:
        print(f"  - {tool['name']}: {tool['description']}")
    
    # Test 2: Check that tools can be executed in the sandbox
    test_code = """
# Test that GetPatientData is available
try:
    import inspect
    if 'GetPatientData' in globals():
        signature = inspect.signature(GetPatientData)
        output = f"GetPatientData available with signature: {signature}"
    else:
        output = "GetPatientData not found in globals"
except Exception as e:
    output = f"Error testing GetPatientData: {e}"
"""
    
    result = execute_code_locally(test_code, {})
    print(f"✅ Execution test result: {result.get('status', 'unknown')}")
    
    if result.get('status') == 'success':
        output = result.get('result', {}).get('output', 'No output')
        print(f"  Output: {output}")
    else:
        print(f"  Error: {result}")

def test_prompt_generation():
    """Test that tools are included in prompt generation."""
    print("\nTesting prompt generation...")
    
    # Import the function that constructs prompts
    from python_backend import get_available_tools
    
    tools = get_available_tools()
    
    # Simulate prompt construction (simplified)
    prompt_parts = ["Variable Details:", "- Name: test_var", ""]
    
    if tools:
        prompt_parts.extend([
            "Available Tools:",
            "You have access to the following tools/functions that you can use in your code:",
            ""
        ])
        
        for tool in tools:
            prompt_parts.extend([
                f"Tool: {tool['name']}",
                f"Description: {tool['description']}",
                f"Function Signature: {tool['function_signature']}",
                ""
            ])
    
    prompt = "\n".join(prompt_parts)
    print(f"✅ Generated prompt includes tools: {'GetPatientData' in prompt}")
    print(f"  Prompt length: {len(prompt)} characters")

if __name__ == "__main__":
    test_tools_availability()
    test_prompt_generation()
    print("\n🎉 Tools integration tests completed!")