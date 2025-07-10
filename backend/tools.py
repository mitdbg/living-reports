import os
import tempfile
import shutil
import logging
import zipfile
import requests
import subprocess
from typing import Dict, List, Optional, Any
import json
import openai
import urllib.parse

import pydicom
from PIL import Image
import numpy as np

from gen3.auth import Gen3Auth
from gen3.query import Gen3Query

logger = logging.getLogger('tools')

MIDRC_API = "https://data.midrc.org"


def GetPatientData(case_id: str) -> Dict[str, Any]:
    """
    Download MIDRC data for a case ID and extract patient demographics and X-ray images.
    
    Args:
        case_id (str): The MIDRC case ID to download data for
        
    Returns:
        Dict containing:
            - age: Patient age (int or None)
            - sex: Patient sex (str or None)  
            - x_ray: List of X-ray image file paths in JPEG format
    """
    # Initialize return structure
    result = {
        'age': None,
        'sex': None,
        'x_ray': []
    }
    
    # Create temporary directory for downloads
    temp_dir = tempfile.mkdtemp(prefix='midrc_download_')
    
    try:
        # Initialize Gen3 authentication
        auth = Gen3Auth(MIDRC_API, refresh_file=os.environ.get('MIDRC_CREDENTIALS_PATH'))
        query = Gen3Query(auth)
        
        # Step 1: Get case information to extract patient demographics
        logger.info(f"Querying case information for case_id: {case_id}")
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
        
        # Extract patient demographics from case info
        if case_info and len(case_info) > 0:
            case_data = case_info[0]
            result['age'] = case_data.get('age_at_index')
            result['sex'] = case_data.get('sex')
            logger.info(f"Found patient demographics - Age: {result['age']}, Sex: {result['sex']}")
            
        if len(case_info) > 0 and "submitter_id" in case_info[0]:
            case_ids = [i["submitter_id"] for i in case_info]
        
        # Step 2: Get X-ray files associated with the case
        logger.info(f"Querying X-ray files for case_id: {case_id}")
        
        # Use the proven working approach from the provided code
        x_ray_files = query.raw_data_download(
            data_type="data_file",
            fields=None,
            filter_object={
                "AND": [
                    {"IN": {"case_ids": case_ids}},
                ]
            },
            sort_fields=[{"submitter_id": "asc"}]
        )
        
        # Step 3: Download and process X-ray files
        if x_ray_files:
            logger.info(f"Found {len(x_ray_files)} X-ray files")
            
            # Create a simple app-like object for download tracking
            class DownloadTracker:
                def __init__(self):
                    self.download_statuses = {}
            
            app = DownloadTracker()
            cred_path = os.environ.get('MIDRC_CREDENTIALS_PATH')
            
            for file_info in x_ray_files:
                if 'object_id' in file_info:
                    object_id = file_info['object_id']
                    logger.info(f"Downloading file with object_id: {object_id}")
                    
                    # Create subdirectory for this file
                    file_output_dir = os.path.join(temp_dir, object_id.replace('/', '_'))
                    os.makedirs(file_output_dir, exist_ok=True)
                    
                    # Download the file synchronously
                    download_result = _download_file_sync(object_id, cred_path, file_output_dir)
                    
                    if download_result['success']:
                        # Flatten file structure first (like in the working code)
                        _flatten_downloaded_files(file_output_dir)
                        
                        # Get updated file list after flattening
                        updated_files = []
                        for root, dirs, files in os.walk(file_output_dir):
                            for file in files:
                                file_path = os.path.join(root, file)
                                updated_files.append(file_path)
                        
                        # Process downloaded DICOM files
                        for downloaded_file in updated_files:
                            if downloaded_file.lower().endswith(('.dcm', '.dicom')):
                                jpeg_path = _convert_dicom_to_jpeg(downloaded_file, temp_dir)
                                if jpeg_path:
                                    result['x_ray'].append(jpeg_path)
                                    logger.info(f"Converted DICOM to JPEG: {jpeg_path}")
                            elif downloaded_file.lower().endswith(('.zip', '.tar', '.gz')):
                                # Extract archives and process contents
                                extracted_files = _extract_archive(downloaded_file, file_output_dir)
                                for extracted_file in extracted_files:
                                    if extracted_file.lower().endswith(('.dcm', '.dicom')):
                                        jpeg_path = _convert_dicom_to_jpeg(extracted_file, temp_dir)
                                        if jpeg_path:
                                            result['x_ray'].append(jpeg_path)
                                            logger.info(f"Converted DICOM to JPEG: {jpeg_path}")
        
        logger.info(f"Successfully processed case {case_id}. Found {len(result['x_ray'])} X-ray images.")
        
    except Exception as e:
        logger.error(f"Error processing case {case_id}: {str(e)}")
        raise
    
    finally:
        # Clean up temporary directory (comment out if you want to keep files)
        # shutil.rmtree(temp_dir, ignore_errors=True)
        pass
    
    return result


def _flatten_downloaded_files(root_dir: str):
    """
    Flatten file structure by moving all files from subdirectories to the root directory.
    Based on the working MIDRC code.
    """
    try:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            if dirpath == root_dir:
                continue
            for filename in filenames:
                src_path = os.path.join(dirpath, filename)
                dst_path = os.path.join(root_dir, filename)
                
                # Avoid overwriting files with the same name
                if os.path.exists(dst_path):
                    base, ext = os.path.splitext(filename)
                    i = 1
                    while os.path.exists(dst_path):
                        new_filename = f"{base}_{i}{ext}"
                        dst_path = os.path.join(root_dir, new_filename)
                        i += 1
                
                shutil.move(src_path, dst_path)
                logger.info(f"Moved {src_path} to {dst_path}")
    except Exception as e:
        logger.warning(f"Error flattening files: {e}")


def _extract_archive(archive_path: str, output_dir: str) -> List[str]:
    """
    Extract ZIP/TAR archives and return list of extracted files.
    """
    extracted_files = []
    try:
        if archive_path.lower().endswith('.zip'):
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(output_dir)
                
            # Find all extracted files
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    if file != os.path.basename(archive_path):  # Skip the original archive
                        file_path = os.path.join(root, file)
                        extracted_files.append(file_path)
                        
        logger.info(f"Extracted {len(extracted_files)} files from {archive_path}")
    except Exception as e:
        logger.error(f"Error extracting archive {archive_path}: {e}")
    
    return extracted_files


def _download_file_sync(object_id: str, cred_path: str, output_dir: str) -> Dict[str, Any]:
    """
    Download a MIDRC file using the proven working gen3 command approach.
    
    Args:
        object_id: MIDRC object ID
        cred_path: Path to credentials file
        output_dir: Directory to download to
        
    Returns:
        Dict with 'success' flag and 'files' list
    """
    try:
        logger.info(f"Downloading file with object_id: {object_id}")
        
        # Use the proven working command from the provided code
        cmd = f"gen3 --auth {cred_path} --endpoint data.midrc.org drs-pull object {object_id} --output-dir {output_dir}"
        
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if result.returncode == 0:
            logger.info(f"Successfully downloaded {object_id}")
            
            # Find all downloaded files
            downloaded_files = []
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    downloaded_files.append(file_path)
            
            return {
                'success': True,
                'files': downloaded_files
            }
        else:
            logger.error(f"Download failed for {object_id}: {result.stderr}")
            return {
                'success': False,
                'files': []
            }
            
    except Exception as e:
        logger.error(f"Error downloading file {object_id}: {str(e)}")
        return {
            'success': False,
            'files': []
        }


def _convert_dicom_to_jpeg(dicom_path: str, output_dir: str) -> Optional[str]:
    """
    Convert a DICOM file to JPEG format.
    
    Args:
        dicom_path: Path to DICOM file
        output_dir: Directory to save JPEG file
        
    Returns:
        Path to converted JPEG file or None if conversion failed
    """
    try:
        # Read DICOM file
        dicom_data = pydicom.dcmread(dicom_path)
        
        # Get pixel array
        pixel_array = dicom_data.pixel_array
        
        # Handle different pixel array formats
        if len(pixel_array.shape) == 3:
            # Multi-frame or RGB image, take first frame
            pixel_array = pixel_array[0] if pixel_array.shape[0] < pixel_array.shape[1] else pixel_array
        
        # Normalize pixel values to 0-255 range
        pixel_array = pixel_array.astype(np.float64)
        pixel_array = ((pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min()) * 255).astype(np.uint8)
        
        # Convert to PIL Image
        image = Image.fromarray(pixel_array)
        
        # Generate output filename
        base_name = os.path.splitext(os.path.basename(dicom_path))[0]
        jpeg_path = os.path.join(output_dir, f"{base_name}.jpg")
        
        # Save as JPEG
        image.save(jpeg_path, 'JPEG', quality=95)
        
        logger.info(f"Converted DICOM to JPEG: {dicom_path} -> {jpeg_path}")
        return jpeg_path
        
    except Exception as e:
        logger.error(f"Error converting DICOM to JPEG {dicom_path}: {str(e)}")
        return None
    

def RenderImage(x_ray_image: str) -> str:
    """
    Render an image and return HTML container to display the image.
    
    Args:
        x_ray_image (str): Absolute path to the image file
        
    Returns:
        str: HTML string containing the image display container
    """
    try:
        # Validate file exists
        if not os.path.exists(x_ray_image):
            return f'<div class="image-error">⚠️ Image file not found: {os.path.basename(x_ray_image)}</div>'
        
        # Validate it's an image file
        image_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.svg', '.ico']
        file_ext = os.path.splitext(x_ray_image)[1].lower()
        
        if file_ext not in image_extensions:
            return f'<div class="image-error">⚠️ Unsupported image format: {file_ext}</div>'
        
        # Get file info
        file_name = os.path.basename(x_ray_image)
        file_size = os.path.getsize(x_ray_image)
        
        # Convert file size to human readable format
        def format_file_size(bytes):
            if bytes < 1024:
                return f"{bytes} B"
            elif bytes < 1024 * 1024:
                return f"{bytes // 1024} KB"
            else:
                return f"{bytes // (1024 * 1024)} MB"
        
        # Try to get image dimensions using PIL
        try:
            with Image.open(x_ray_image) as img:
                width, height = img.size
                image_info = f"Dimensions: {width}×{height}px"
        except Exception as e:
            logger.warning(f"Could not get image dimensions for {x_ray_image}: {e}")
            image_info = "Dimensions: Unknown"
        
        # Create a URL-friendly path for serving the image
        # Use the MIDRC file serving endpoint with query parameter for absolute paths
        # URL-encode the absolute path as a query parameter to avoid URL path issues
        encoded_path = urllib.parse.quote(x_ray_image, safe='')
        image_url = f"http://127.0.0.1:5000/api/serve-midrc-file?path={encoded_path}"
        
        # Return just the image URL instead of full HTML to avoid template processing issues
        # The template system will handle the HTML rendering
        logger.info(f"Successfully rendered image: {file_name}")
        return f'<img src="{image_url}" alt="{file_name}" style="max-width: 100%; height: auto;" />'
    
    except Exception as e:
        logger.error(f"Error rendering image {x_ray_image}: {str(e)}")
        return f'<div class="image-error">❌ Error rendering image: {str(e)}</div>'


def GenerateAnnotations(x_ray_image: str) -> str:
    """
    Generate annotations for a X-ray image and return as HTML table.
    """

    # Load the X-ray image
    image = Image.open(x_ray_image)

    prompt = """ Examine this image and look for any important clinical findings. 
Provide a summary in a table format where the positive clinical conditions are 1 and the negative clinical conditions are 0.
Designate each condition as left side, right side, or bilateral. Provide an ICD-10 code in a separate column for positive findings only or N/A if not applicable.

Table columns include: [Exam no., Finding No., Clinical Finding, Left Side, Right Side, Bilateral, ICD-10 Code, ICD-10 Description]

Additional instructions:
1. Normal findings should be excluded from the each table.
2. Group similar findings together where possible for each table.
3. Create a csv format that we can use to create a table.
"""

    response = openai.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a helpful Chest Radiographer. You are given a chest X-ray image and you need to generate a table of clinical findings.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_tokens=5000,
    )

    csv_content = response.choices[0].message.content.strip()
    print(csv_content)
    
    # Convert CSV to HTML table
    html_table = _convert_csv_to_html_table(csv_content)
    return html_table


def _convert_csv_to_html_table(csv_content: str) -> str:
    """
    Convert CSV content to HTML table format.
    
    Args:
        csv_content: CSV string content
        
    Returns:
        HTML table string
    """
    try:
        # Split content into lines
        lines = csv_content.strip().split('\n')
        
        if not lines:
            return '<div class="annotation-error">No data available for annotations</div>'
        
        # Start building HTML table with proper styling to handle span wrapper
        html = '<div class="annotations-table-container" style="display: block; width: 100%; overflow-x: auto;">\n'
        html += '<table class="annotations-table" style="display: table; width: 100%; border-collapse: collapse; margin: 0; padding: 0;">\n'
        
        # Process each line
        for i, line in enumerate(lines):
            if not line.strip():
                continue
                
            # Split by comma, handling quoted fields
            fields = _parse_csv_line(line)
            
            if i == 0:
                # Header row
                html += '<thead>\n<tr>\n'
                for field in fields:
                    html += f'<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2; font-weight: bold;">{field.strip()}</th>\n'
                html += '</tr>\n</thead>\n<tbody>\n'
            else:
                # Data row
                html += '<tr>\n'
                for field in fields:
                    # Clean up the field content
                    clean_field = field.strip().strip('"').strip("'")
                    html += f'<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">{clean_field}</td>\n'
                html += '</tr>\n'
        
        html += '</tbody>\n</table>\n</div>'
        
        return html
        
    except Exception as e:
        logger.error(f"Error converting CSV to HTML table: {str(e)}")
        return f'<div class="annotation-error">Error processing annotations: {str(e)}</div>'


def _parse_csv_line(line: str) -> List[str]:
    """
    Parse a CSV line, handling quoted fields properly.
    
    Args:
        line: CSV line string
        
    Returns:
        List of field values
    """
    fields = []
    current_field = ""
    in_quotes = False
    i = 0
    
    while i < len(line):
        char = line[i]
        
        if char == '"':
            if in_quotes and i + 1 < len(line) and line[i + 1] == '"':
                # Escaped quote
                current_field += '"'
                i += 2
                continue
            else:
                # Toggle quote state
                in_quotes = not in_quotes
        elif char == ',' and not in_quotes:
            # End of field
            fields.append(current_field)
            current_field = ""
        else:
            current_field += char
        
        i += 1
    
    # Add the last field
    fields.append(current_field)
    
    return fields