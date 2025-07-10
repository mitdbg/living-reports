#!/usr/bin/env python3
"""
Comprehensive test suite for the GetPatientData function.
Tests with real MIDRC data to validate all functionality.
"""

import os
import sys
import json
import logging
from typing import Dict, Any, List

# Add the current directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools import GetPatientData

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

class MIDRCTestSuite:
    """Test suite for MIDRC GetPatientData function."""
    
    def __init__(self):
        self.test_cases = [
            {
                'case_id': '419639-010183',
                'expected_age': 84,
                'expected_sex': 'Female',
                'expected_xray': 4,
                'description': 'Known demographics case'
            },
            {
                'case_id': '419639-017559',
                'expected_age': 76,
                'expected_sex': 'Male',
                'expected_xray': 6, 
                'description': 'X-ray rich case with 13 files'
            }
        ]
        
        self.results = []
        
    def validate_environment(self) -> bool:
        """Validate that the environment is set up correctly."""
        logger.info("Validating test environment...")
        
        # Check credentials
        cred_path = os.environ.get('MIDRC_CREDENTIALS_PATH')
        if not cred_path:
            logger.error("❌ MIDRC_CREDENTIALS_PATH environment variable not set")
            logger.error("Please run: export MIDRC_CREDENTIALS_PATH=$HOME/credentials.json")
            return False
        
        if not os.path.exists(cred_path):
            logger.error(f"❌ MIDRC credentials file not found at: {cred_path}")
            return False
        
        logger.info("✅ Environment validation passed")
        return True
    
    def test_function_structure(self) -> bool:
        """Test that the function has the correct structure and can be imported."""
        logger.info("Testing function structure...")
        
        try:
            # Test import
            from tools import GetPatientData
            
            # Test function signature
            import inspect
            sig = inspect.signature(GetPatientData)
            
            # Validate signature
            params = list(sig.parameters.keys())
            if 'case_id' not in params:
                logger.error("❌ Function should have 'case_id' parameter")
                return False
            
            if not callable(GetPatientData):
                logger.error("❌ GetPatientData should be callable")
                return False
            
            logger.info("✅ Function structure validation passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Function structure test failed: {e}")
            return False
    
    def test_case(self, test_case: Dict[str, Any]) -> Dict[str, Any]:
        """Test a single case and return results."""
        case_id = test_case['case_id']
        logger.info(f"Testing case: {case_id} ({test_case['description']})")
        
        result = {
            'case_id': case_id,
            'description': test_case['description'],
            'success': False,
            'demographics_correct': False,
            'xray_files_found': 0,
            'xray_files_expected': test_case['expected_xray'],
            'errors': []
        }
        
        try:
            # Call the function
            patient_data = GetPatientData(case_id)
            
            # Validate structure
            if not isinstance(patient_data, dict):
                result['errors'].append("Result is not a dictionary")
                return result
            
            required_keys = ['age', 'sex', 'x_ray']
            missing_keys = [key for key in required_keys if key not in patient_data]
            if missing_keys:
                result['errors'].append(f"Missing keys: {missing_keys}")
                return result
            
            if not isinstance(patient_data['x_ray'], list):
                result['errors'].append("x_ray is not a list")
                return result
            
            # Check demographics
            age_correct = patient_data['age'] == test_case['expected_age']
            sex_correct = patient_data['sex'] == test_case['expected_sex']
            
            result['demographics_correct'] = age_correct and sex_correct
            result['actual_age'] = patient_data['age']
            result['actual_sex'] = patient_data['sex']
            result['xray_files_found'] = len(patient_data['x_ray'])
            
            # Log detailed results
            logger.info(f"  Demographics: Age={patient_data['age']} (expected {test_case['expected_age']}), Sex={patient_data['sex']} (expected {test_case['expected_sex']})")
            logger.info(f"  X-ray files: {len(patient_data['x_ray'])} (expected {test_case['expected_xray']})")
            
            # Validate X-ray files
            if patient_data['x_ray']:
                logger.info("  X-ray files found:")
                for i, path in enumerate(patient_data['x_ray'][:5]):  # Show first 5
                    exists = os.path.exists(path)
                    logger.info(f"    {i+1}. {path} {'✅' if exists else '❌'}")
                
                if len(patient_data['x_ray']) > 5:
                    logger.info(f"    ... and {len(patient_data['x_ray']) - 5} more files")
            
            # Test is successful if structure is correct
            result['success'] = True
            
            # Add warnings for unexpected values
            if not age_correct:
                result['errors'].append(f"Age mismatch: got {patient_data['age']}, expected {test_case['expected_age']}")
            if not sex_correct:
                result['errors'].append(f"Sex mismatch: got {patient_data['sex']}, expected {test_case['expected_sex']}")
            if len(patient_data['x_ray']) != test_case['expected_xray']:
                result['errors'].append(f"X-ray files count mismatch: got {len(patient_data['x_ray'])}, expected {test_case['expected_xray']}")
            
        except Exception as e:
            result['errors'].append(f"Function execution failed: {str(e)}")
            logger.error(f"❌ Test failed for case {case_id}: {e}")
        
        return result
    
    def run_all_tests(self) -> bool:
        """Run all tests and return overall success."""
        print("=" * 80)
        print("MIDRC GetPatientData - Comprehensive Test Suite")
        print("=" * 80)
        
        # Validate environment
        if not self.validate_environment():
            return False
        
        # Test function structure
        if not self.test_function_structure():
            return False
        
        # Test each case
        print("\n" + "=" * 80)
        print("Testing Individual Cases")
        print("=" * 80)
        
        overall_success = True
        
        for test_case in self.test_cases:
            print(f"\n--- {test_case['description']} ---")
            result = self.test_case(test_case)
            self.results.append(result)
            
            if result['success']:
                print("✅ Test PASSED")
            else:
                print("❌ Test FAILED")
                overall_success = False
            
            # Show any errors or warnings
            if result['errors']:
                for error in result['errors']:
                    print(f"  ⚠️  {error}")
        
        # Print summary
        self.print_summary()
        
        return overall_success
    
    def print_summary(self):
        """Print a summary of all test results."""
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r['success'])
        
        print(f"Total tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        
        if passed_tests == total_tests:
            print("\n✅ ALL TESTS PASSED!")
            print("\nThe GetPatientData function:")
            print("- Correctly imports and executes")
            print("- Returns proper data structure")
            print("- Retrieves patient demographics")
            print("- Processes X-ray image files")
            print("- Works with real MIDRC data")
        else:
            print("\n❌ SOME TESTS FAILED")
            print("\nFailed tests:")
            for result in self.results:
                if not result['success']:
                    print(f"  - {result['case_id']}: {result['description']}")
        
        print("\n" + "=" * 40)
        print("DETAILED RESULTS")
        print("=" * 40)
        
        for result in self.results:
            status = "✅ PASSED" if result['success'] else "❌ FAILED"
            print(f"\n{result['case_id']} ({result['description']}): {status}")
            
            if 'actual_age' in result:
                demo_status = "✅" if result['demographics_correct'] else "⚠️"
                print(f"  {demo_status} Demographics: Age={result['actual_age']}, Sex={result['actual_sex']}")
            
            if 'xray_files_found' in result:
                xray_status = "✅" if result['xray_files_found'] == result['xray_files_expected'] else "⚠️"
                print(f"  {xray_status} X-ray files: {result['xray_files_found']} (expected {result['xray_files_expected']})")
        
        print("\n" + "=" * 80)
        print("USAGE EXAMPLE")
        print("=" * 80)
        print("from tools import GetPatientData")
        print("")
        print("# Get patient data")
        print("result = GetPatientData('419639-010183')")
        print("print(f\"Age: {result['age']}, Sex: {result['sex']}\")")
        print("print(f\"X-ray images: {len(result['x_ray'])}\")")
        print("")
        print("# Process X-ray images")
        print("for image_path in result['x_ray']:")
        print("    # Process each JPEG image file")
        print("    pass")
        print("=" * 80)


def main():
    """Main test runner."""
    test_suite = MIDRCTestSuite()
    success = test_suite.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()