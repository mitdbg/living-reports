import sys
import json
import types
from io import StringIO
import os

# Add the backend directory to the Python path for importing tools
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

def execute_code_locally(code, parameters):
    print(f"{code}")
    print("================================================")
    print(f"parameters: {parameters}")
    
    if not code.strip():
        return {"output": {"error": "No code provided", "type": "ValueError"}}
    
    restricted_globals = {
        "__builtins__": {
            **__builtins__,
            "__import__": __import__,  # Allow imports
        },
        "__name__": "__main__",
        "__doc__": None,
        "__package__": None
    }
    
    # Pre-import common tools and libraries for convenience
    try:
        import pandas as pd
        import numpy as np
        from tools import GetPatientData, GenerateAnnotations
        
        # Make these available in the execution environment
        restricted_globals.update({
            'pd': pd,
            'np': np,
            'GetPatientData': GetPatientData,
            'GenerateAnnotations': GenerateAnnotations
        })
    except ImportError as e:
        # Log import errors but don't fail - tools may not be needed
        print(f"Warning: Could not import some tools: {e}", file=sys.stderr)
    
    # Also try to import other commonly used libraries
    try:
        import pydicom
        from PIL import Image
        import requests
        import json
        import os
        import tempfile
        
        restricted_globals.update({
            'pydicom': pydicom,
            'Image': Image,
            'requests': requests,
            'json': json,
            'os': os,
            'tempfile': tempfile
        })
    except ImportError as e:
        # These are optional for basic functionality
        print(f"Info: Some optional libraries not available: {e}", file=sys.stderr)
    
    # Initialize execution environment with parameters
    # CRITICAL: Use the same dict for globals and locals to fix import scoping
    execution_env = restricted_globals.copy()
    execution_env["parameters"] = parameters
    
    # Capture stdout to get print statements
    old_stdout = sys.stdout
    captured_output = StringIO()
    sys.stdout = captured_output
    
    try:
        exec(code, execution_env, execution_env)
        
        # Get the captured print output
        print_output = captured_output.getvalue()
        
        # Restore stdout
        sys.stdout = old_stdout
        
        # Comprehensive serialization filter
        def make_serializable(obj, max_depth=3, current_depth=0):
            if current_depth > max_depth:
                return f"<Max depth reached: {type(obj).__name__}>"
            
            try:
                # Test basic JSON serialization
                json.dumps(obj)
                return obj
            except (TypeError, ValueError, OverflowError):
                pass
            
            # Handle NumPy if available
            try:
                import numpy as np
                if isinstance(obj, np.ndarray):
                    return obj.tolist()
                elif isinstance(obj, np.integer):
                    return int(obj)
                elif isinstance(obj, np.floating):
                    return float(obj)
                elif isinstance(obj, np.bool_):
                    return bool(obj)
            except ImportError:
                pass
            
            # Handle pandas if available
            try:
                import pandas as pd
                if isinstance(obj, pd.DataFrame):
                    return obj.to_dict('records')
                elif isinstance(obj, pd.Series):
                    return obj.to_list()
            except ImportError:
                pass
            
            # Handle other types
            if isinstance(obj, (types.ModuleType, type)):
                return f"<{type(obj).__name__}: {obj}>"
            elif hasattr(obj, '__dict__'):
                try:
                    return {k: make_serializable(v, max_depth, current_depth + 1) 
                           for k, v in obj.__dict__.items()}
                except:
                    return f"<Object: {type(obj).__name__}>"
            elif isinstance(obj, (list, tuple)):
                try:
                    return [make_serializable(item, max_depth, current_depth + 1) for item in obj]
                except:
                    return f"<Sequence: {type(obj).__name__} with {len(obj)} items>"
            elif isinstance(obj, dict):
                try:
                    return {str(k): make_serializable(v, max_depth, current_depth + 1) 
                           for k, v in obj.items()}
                except:
                    return f"<Dict: {len(obj)} items>"
            elif isinstance(obj, set):
                try:
                    return list(obj)
                except:
                    return f"<Set with {len(obj)} items>"
            else:
                return f"<{type(obj).__name__}: {str(obj)[:100]}>"
        
        serializable_vars = {}
        for key, value in execution_env.items():
            # Skip built-in variables that we don't want to return
            if not key.startswith('__'):
                serializable_vars[key] = make_serializable(value)
        
        # Add print output if there is any
        if print_output.strip():
            serializable_vars["_stdout"] = print_output.strip()
        
        return {"result": serializable_vars, "status": "success"}
        
    except Exception as e:
        # Restore stdout in case of error
        sys.stdout = old_stdout
        return {
            "result": {
                "error": str(e), 
                "type": type(e).__name__,
                "status": "error"
            }
        }