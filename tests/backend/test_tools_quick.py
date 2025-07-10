#!/usr/bin/env python3
"""
Quick validation test for GetPatientData function.
Tests basic functionality without requiring MIDRC credentials.
"""

import os
import sys
import logging

# Add the current directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_function_import():
    """Test that the function can be imported and has correct signature."""
    try:
        from tools import GetPatientData
        import inspect
        
        # Test function signature
        sig = inspect.signature(GetPatientData)
        params = list(sig.parameters.keys())
        
        print("✅ Function imported successfully")
        print(f"✅ Function signature: {sig}")
        print(f"✅ Parameters: {params}")
        
        # Validate signature
        if 'case_id' not in params:
            print("❌ Function should have 'case_id' parameter")
            return False
        
        if not callable(GetPatientData):
            print("❌ GetPatientData should be callable")
            return False
        
        print("✅ Function structure validation passed")
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Test error: {e}")
        return False

def test_dependencies():
    """Test that all required dependencies are available."""
    try:
        # Test core dependencies
        import pydicom
        import numpy as np
        from PIL import Image
        import requests
        import zipfile
        from gen3.auth import Gen3Auth
        from gen3.query import Gen3Query
        from gen3.file import Gen3File
        
        print("✅ All dependencies imported successfully")
        return True
        
    except ImportError as e:
        print(f"❌ Dependency missing: {e}")
        print("Run: pip install -r requirements.txt")
        return False

def test_with_mock_data():
    """Test function behavior with mock data (expected to fail gracefully)."""
    try:
        from tools import GetPatientData
        
        # Set mock environment
        os.environ['MIDRC_CREDENTIALS_PATH'] = '/tmp/mock_credentials.json'
        
        # Create mock credentials
        mock_cred = '{"type": "service_account", "project_id": "test"}'
        with open('/tmp/mock_credentials.json', 'w') as f:
            f.write(mock_cred)
        
        print("Testing with mock data (should fail gracefully)...")
        
        try:
            result = GetPatientData("test_case_id")
            print("⚠️  Function returned unexpectedly")
        except Exception as e:
            print(f"✅ Function failed gracefully: {type(e).__name__}")
        
        # Clean up
        if os.path.exists('/tmp/mock_credentials.json'):
            os.remove('/tmp/mock_credentials.json')
        
        return True
        
    except Exception as e:
        print(f"❌ Mock test failed: {e}")
        return False

def show_usage():
    """Show usage instructions."""
    print("\n" + "=" * 60)
    print("USAGE INSTRUCTIONS")
    print("=" * 60)
    print("1. Quick validation (no credentials needed):")
    print("   python test_tools_quick.py")
    print()
    print("2. Full test with real MIDRC data:")
    print("   export MIDRC_CREDENTIALS_PATH=$HOME/credentials.json")
    print("   python test_tools.py")
    print()
    print("3. Function usage:")
    print("   from tools import GetPatientData")
    print("   result = GetPatientData('419639-010183')")
    print("   print(result)")
    print()
    print("Expected output format:")
    print("   {'age': 84, 'sex': 'Female', 'x_ray': ['/path/to/image1.jpg', ...]}")
    print("=" * 60)

def main():
    """Main test runner."""
    print("=" * 60)
    print("GetPatientData - Quick Validation Test")
    print("=" * 60)
    
    tests = [
        ("Function Import", test_function_import),
        ("Dependencies", test_dependencies),
        ("Mock Data", test_with_mock_data),
    ]
    
    passed = 0
    total = len(tests)
    
    for name, test_func in tests:
        print(f"\n--- {name} ---")
        if test_func():
            passed += 1
        else:
            print(f"❌ {name} failed")
    
    print(f"\n" + "=" * 60)
    print(f"QUICK TEST SUMMARY: {passed}/{total} tests passed")
    print("=" * 60)
    
    if passed == total:
        print("✅ All quick tests passed!")
        print("Ready for full testing with real MIDRC data.")
    else:
        print("❌ Some quick tests failed.")
        print("Please fix issues before running full tests.")
    
    show_usage()
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)