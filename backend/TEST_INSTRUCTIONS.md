# GetPatientData Test Instructions

## Overview
This document provides instructions for testing the `GetPatientData` function with real MIDRC data.

## Function Details
- **File**: `tools.py`
- **Function**: `GetPatientData(case_id: str) -> Dict[str, Any]`
- **Purpose**: Downloads MIDRC data for a case ID and extracts patient demographics and X-ray images

## Test Files
1. **`test_tools_simple.py`** - Basic structure and import tests (no credentials required)
2. **`test_tools.py`** - Full integration test with real MIDRC data (requires credentials)

## Prerequisites for Real Data Testing

### 1. MIDRC Access
- You need access to the MIDRC data commons
- Register at: https://data.midrc.org
- Follow MIDRC's data access procedures

### 2. Credentials Setup
- Download your MIDRC credentials file (usually a JSON file)
- Set the environment variable:
  ```bash
  export MIDRC_CREDENTIALS_PATH=/path/to/your/credentials.json
  ```

### 3. Dependencies
Install required packages:
```bash
pip install -r requirements.txt
```

## Running Tests

### Basic Test (No Credentials Required)
```bash
python test_tools_simple.py
```

This test verifies:
- Function imports correctly
- Has correct signature
- Handles errors gracefully

### Full Integration Test (Requires Credentials)
```bash
python test_tools.py
```

This test:
- Finds available case IDs with X-ray data
- Tests the function with real MIDRC data
- Validates the returned data structure
- Checks for actual downloaded files

## Expected Output Format

The `GetPatientData` function returns a dictionary with:

```python
{
    'age': 65,                    # Patient age in years (int/float or None)
    'sex': 'Male',                # Patient sex (str or None)
    'x_ray': [                    # List of X-ray image paths (list)
        '/path/to/image1.jpg',
        '/path/to/image2.jpg'
    ]
}
```

## Test Validation

The tests verify:
1. **Data Structure**: Correct dictionary keys and types
2. **Data Quality**: Age is non-negative, sex is valid string
3. **File Existence**: Downloaded JPEG files actually exist
4. **Error Handling**: Function handles missing credentials gracefully

## Example Test Cases

### Case with X-ray Data
```python
result = GetPatientData("MIDRC-RICORD-1C-419639-000025")
# Expected: {'age': 65, 'sex': 'Male', 'x_ray': ['/path/to/image1.jpg']}
```

### Case with No X-ray Data
```python
result = GetPatientData("case_with_no_xrays")
# Expected: {'age': 45, 'sex': 'Female', 'x_ray': []}
```

## Troubleshooting

### Common Issues

1. **Connection Error**: 
   - Check internet connection
   - Verify MIDRC credentials are valid
   - Ensure credentials file path is correct

2. **No Data Found**:
   - Try different case IDs
   - Some cases may not have X-ray data
   - Check MIDRC data access permissions

3. **DICOM Conversion Errors**:
   - Some DICOM files may have unsupported formats
   - Function should handle these gracefully

### Debug Mode
Add this to enable detailed logging:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Manual Testing Steps

1. **Find Valid Case IDs**:
   - Use MIDRC web interface to browse available cases
   - Look for cases with CR (Chest Radiography) or DX (Digital X-ray) data

2. **Test Individual Components**:
   - Test case info retrieval
   - Test file download
   - Test DICOM to JPEG conversion

3. **Verify Results**:
   - Check downloaded files exist
   - Validate JPEG image quality
   - Confirm patient demographics match MIDRC records

## Performance Notes
- Downloads may take several minutes per case
- Function creates temporary directories for processing
- Large DICOM files may require significant disk space

## Security Considerations
- Keep MIDRC credentials secure
- Temporary files are cleaned up after processing
- Follow MIDRC data use agreements