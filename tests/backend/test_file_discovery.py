#!/usr/bin/env python3
"""
Test file discovery functionality for GetPatientData.
Focus on finding all files even if download fails.
"""

import os
import sys
import logging

# Add the current directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen3.auth import Gen3Auth
from gen3.query import Gen3Query

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MIDRC_API = "https://data.midrc.org"

def test_file_discovery():
    """Test that we can find all files for case 10000000-1866-528."""
    
    case_id = "10000000-1866-528"
    
    try:
        # Initialize Gen3 authentication
        auth = Gen3Auth(MIDRC_API, refresh_file=os.environ.get('MIDRC_CREDENTIALS_PATH'))
        query = Gen3Query(auth)
        
        print(f"Testing file discovery for case: {case_id}")
        print("Expected: 13 X-ray files")
        print("=" * 60)
        
        # Step 1: Get case information
        print("Step 1: Getting case information...")
        case_info = query.raw_data_download(
            data_type="case",
            fields=None,
            filter_object={
                "AND": [
                    {"IN": {"submitter_id": [case_id]}},
                ]
            },
            sort_fields=[{"submitter_id": "asc"}]
        )
        
        if case_info:
            case_data = case_info[0]
            print(f"✅ Found case: Age={case_data.get('age_at_index')}, Sex={case_data.get('sex')}")
            
            # Get internal case ID
            internal_case_id = (case_data.get('id') or 
                              case_data.get('node_id') or 
                              case_data.get('uuid') or
                              case_data.get('case_id'))
            print(f"Internal case ID: {internal_case_id}")
        
        # Step 2: Find files using multiple approaches
        print("\nStep 2: Finding associated files...")
        all_files = []
        
        # Approach 1: Internal case ID
        if internal_case_id:
            try:
                files_1 = query.raw_data_download(
                    data_type="data_file",
                    fields=None,
                    filter_object={
                        "AND": [
                            {"IN": {"_case_id": [internal_case_id]}},
                        ]
                    },
                    sort_fields=[{"submitter_id": "asc"}]
                )
                all_files.extend(files_1)
                print(f"  Approach 1 (internal ID): {len(files_1)} files")
            except Exception as e:
                print(f"  Approach 1 failed: {e}")
        
        # Approach 2: case_ids field
        try:
            files_2 = query.raw_data_download(
                data_type="data_file",
                fields=None,
                filter_object={
                    "AND": [
                        {"IN": {"case_ids": [case_id]}},
                    ]
                },
                sort_fields=[{"submitter_id": "asc"}]
            )
            # Add files not already found
            existing_object_ids = {f.get('object_id') for f in all_files if f.get('object_id')}
            new_files = [f for f in files_2 if f.get('object_id') not in existing_object_ids]
            all_files.extend(new_files)
            print(f"  Approach 2 (case_ids): {len(new_files)} additional files")
        except Exception as e:
            print(f"  Approach 2 failed: {e}")
        
        # Approach 3: Pattern matching (limited to avoid large queries)
        try:
            # Query a subset and filter
            files_3 = query.raw_data_download(
                data_type="data_file",
                fields=["object_id", "file_name", "submitter_id", "case_ids"],
                filter_object={},
                sort_fields=[{"submitter_id": "asc"}]
            )
            
            # Filter files that match the case
            case_files = []
            for f in files_3[:1000]:  # Limit to first 1000 to avoid timeouts
                if (case_id in str(f.get('file_name', '')) or 
                    any(case_id in str(case) for case in f.get('case_ids', []))):
                    case_files.append(f)
            
            # Add files not already found
            existing_object_ids = {f.get('object_id') for f in all_files if f.get('object_id')}
            new_files = [f for f in case_files if f.get('object_id') not in existing_object_ids]
            all_files.extend(new_files)
            print(f"  Approach 3 (pattern): {len(new_files)} additional files")
        except Exception as e:
            print(f"  Approach 3 failed: {e}")
        
        # Remove duplicates
        seen_ids = set()
        unique_files = []
        for f in all_files:
            obj_id = f.get('object_id')
            if obj_id and obj_id not in seen_ids:
                seen_ids.add(obj_id)
                unique_files.append(f)
        
        print(f"\nTotal unique files found: {len(unique_files)}")
        print("=" * 60)
        
        # Display file details
        print("File details:")
        for i, file_data in enumerate(unique_files, 1):
            object_id = file_data.get('object_id', 'N/A')
            file_name = file_data.get('file_name', 'N/A')
            file_size = file_data.get('file_size', 'N/A')
            
            print(f"{i:2d}. Object ID: {object_id}")
            print(f"     File name: {file_name}")
            print(f"     File size: {file_size}")
            print()
        
        # Summary
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Case ID: {case_id}")
        print(f"Expected files: 13")
        print(f"Found files: {len(unique_files)}")
        
        if len(unique_files) >= 13:
            print("✅ SUCCESS: Found all expected files!")
        elif len(unique_files) > 0:
            print("⚠️  PARTIAL: Found some files, but not all expected")
        else:
            print("❌ FAILED: No files found")
        
        return len(unique_files)
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 0

if __name__ == "__main__":
    if not os.environ.get('MIDRC_CREDENTIALS_PATH'):
        print("❌ MIDRC_CREDENTIALS_PATH not set")
        print("Please run: export MIDRC_CREDENTIALS_PATH=$HOME/credentials.json")
        sys.exit(1)
    
    file_count = test_file_discovery()
    sys.exit(0 if file_count >= 13 else 1)