import io
import os
import tempfile
import shutil
import logging
import zipfile
import httpx
import requests
import subprocess
import pandas as pd
from typing import Dict, List, Optional, Any
import json
import openai
import urllib.parse
import asyncio

import pydicom

# Import pixel data handlers for DICOM decompression
import pydicom.pixel_data_handlers.gdcm_handler
import pydicom.pixel_data_handlers.pylibjpeg_handler
import pydicom.pixel_data_handlers.pillow_handler
import pydicom.pixel_data_handlers.jpeg_ls_handler
import pydicom.pixel_data_handlers.rle_handler
from PIL import Image
import numpy as np

from gen3.auth import Gen3Auth
from gen3.query import Gen3Query

from udi_grammar_wrapper import udi_to_png
from read_dicom_metadata import extract_usecase_columns
from udi_grammar_py.spec import Chart
from udi_grammar_py.helpers import Op
import json
import random
import string

logger = logging.getLogger("tools")

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
            - x_ray_jpeg: List of X-ray image file paths in JPEG format
            - x_ray_dicom: List of X-ray image file paths in DICOM format
    """
    # Initialize return structure for demographics and both image formats
    result = {"age": None, "sex": None, "x_ray_jpeg": [], "x_ray_dicom": []}

    # Create temporary directory for downloads and conversions
    # temp_dir = tempfile.mkdtemp(prefix="midrc_download_")
    case_dir = f"database/midr_files/{case_id}"
    os.makedirs(case_dir, exist_ok=True)
    result_cache = os.path.join(case_dir, "result_cache.json")
    if os.path.exists(result_cache):
        logger.info(f"Loading cached results for case {case_id}")
        with open(result_cache, "r") as f:
            return json.load(f)
    else:
        try:
            # Initialize Gen3 authentication and query client
            auth = Gen3Auth(
                MIDRC_API, refresh_file=os.environ.get("MIDRC_CREDENTIALS_PATH")
            )
            query = Gen3Query(auth)

            # Step 1: Get case information to extract patient demographics
            logger.info(f"Querying case information for case_id: {case_id}")
            case_info = query.raw_data_download(
                data_type="case",
                fields=None,
                filter_object={"IN": {"case_ids": [case_id]}},
                sort_fields=[{"submitter_id": "asc"}],
            )
            # Extract patient demographics from case info
            if case_info and len(case_info) > 0:
                case_data = case_info[0]
                result["age"] = case_data.get("age_at_index")
                result["sex"] = case_data.get("sex")
                result["measurements"] = case_data.get("measurements", [])
                result["medications"] = case_data.get("medications", [])
                logger.info(
                    f"Found patient demographics - Age: {result['age']}, Sex: {result['sex']}"
                )

            # Step 2: Get X-ray files associated with the case
            logger.info(f"Querying X-ray files for case_id: {case_id}")
            x_ray_files = query.raw_data_download(
                data_type="data_file",
                fields=None,
                filter_object={"IN": {"case_ids": [case_id]}},
                sort_fields=[{"submitter_id": "asc"}],
            )[:10]

            # Step 3: Download and process X-ray files (DICOM and JPEG)
            if x_ray_files:
                logger.info(f"Found {len(x_ray_files)} X-ray files")
                cred_path = os.environ.get("MIDRC_CREDENTIALS_PATH")
                dicoms = []
                jpegs = []
                for file_info in x_ray_files:
                    if "object_id" in file_info:
                        object_id = file_info["object_id"]
                        print(f"Downloading file with object_id: {object_id}")
                        case_path = os.path.abspath(case_dir)
                        _ = _download_file_sync(object_id, cred_path, case_path)

                _flatten_directory(case_dir)
                for f in os.listdir(case_dir):
                    if f.lower().endswith((".zip", ".tar", ".gz")):
                        _ = _extract_archive(os.path.join(case_dir, f), case_dir)
                _flatten_directory(case_dir)

                for f in os.listdir(case_dir):
                    if f.lower().endswith((".dcm", ".dicom")):
                        dicoms.append(os.path.join(case_dir, f))
                        jpeg_path = _convert_dicom_to_jpeg(os.path.join(case_dir, f), case_dir)
                        if jpeg_path:
                            jpegs.append(case_dir+jpeg_path)
                            logger.info(f"Converted DICOM to JPEG: {jpeg_path}")

                result["x_ray_jpeg"] = jpegs
                result["x_ray_dicom"] = dicoms
            # Store result in json cache
            with open(result_cache, "w") as f:
                json.dump(result, f, indent=2)

            logger.info(
                f"Successfully processed case {case_id}. Found {len(result['x_ray_jpeg'])} JPEG and {len(result['x_ray_dicom'])} DICOM X-ray images."
            )

        except Exception as e:
            logger.error(f"Error processing case {case_id}: {str(e)}")
            raise
        return result


def _flatten_directory(root_dir: str):
    """
    Flatten file structure by moving all files from subdirectories to the root directory.
    Based on the working MIDRC code.
    """
    base_path = os.path.abspath(root_dir)

    for root, dirs, files in os.walk(base_path, topdown=False):
        if root == base_path:
            continue  # Skip the base directory

        for file in files:
            src = os.path.join(root, file)
            dst = os.path.join(base_path, file)
            # If a file with the same name exists, skip it 
            if os.path.exists(dst):
                logger.info("Skipping file due to name conflict: %s", file)
            else:
                shutil.move(src, dst)

        # Remove empty directory
        for d in dirs:
            shutil.rmtree(os.path.join(root, d), ignore_errors=True)
        shutil.rmtree(root, ignore_errors=True)


def _extract_archive(archive_path: str, output_dir: str) -> List[str]:
    """
    Extract ZIP/TAR archives and return list of extracted files.
    """
    extracted_files = []
    try:
        if archive_path.lower().endswith(".zip"):
            with zipfile.ZipFile(archive_path, "r") as zip_ref:
                zip_ref.extractall(output_dir)

            # Find all extracted files
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    if file != os.path.basename(archive_path):  # Skip the original archive
                        file_path = os.path.join(root, file)
                        extracted_files.append(file_path)

        os.remove(archive_path)

        logger.info(f"Extracted {len(extracted_files)} files from {archive_path}")
    except Exception as e:
        logger.error(f"Error extracting archive {archive_path}: {e}")

    return extracted_files


def _download_file_sync(
    object_id: str, cred_path: str, output_dir: str
) -> Dict[str, Any]:
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

        ret = os.system(cmd)
        if ret == 0:
            logger.info(f"Successfully downloaded {object_id}")

            # Find all downloaded files
            downloaded_files = []
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    downloaded_files.append(file_path)

            return {"success": True, "files": downloaded_files}
        else:
            logger.error(f"Download failed for {object_id}: {ret}")
            return {"success": False, "files": []}

    except Exception as e:
        logger.error(f"Error downloading file {object_id}: {str(e)}")
        return {"success": False, "files": []}


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
        # Debug: Check if handlers are available
        from pydicom.pixel_data_handlers import gdcm_handler, pylibjpeg_handler

        # Read DICOM file with force=True to bypass some validation
        dicom_data = pydicom.dcmread(dicom_path, force=True)

        # Check if pixel data exists
        if not hasattr(dicom_data, "pixel_array"):
            logger.warning(f"No pixel data found in DICOM file: {dicom_path}")
            return None

        # Get pixel array
        pixel_array = dicom_data.pixel_array

        # Handle different pixel array formats
        if len(pixel_array.shape) == 3:
            # Multi-frame or RGB image, take first frame
            pixel_array = (
                pixel_array[0]
                if pixel_array.shape[0] < pixel_array.shape[1]
                else pixel_array
            )

        # Normalize pixel values to 0-255 range
        pixel_array = pixel_array.astype(np.float64)
        pixel_array = (
            (pixel_array - pixel_array.min())
            / (pixel_array.max() - pixel_array.min())
            * 255
        ).astype(np.uint8)

        # Convert to PIL Image
        image = Image.fromarray(pixel_array)

        # Generate output filename
        base_name = os.path.splitext(os.path.basename(dicom_path))[0]
        jpeg_path = os.path.join(output_dir, f"{base_name}.jpg")

        # Save as JPEG
        image.save(jpeg_path, "JPEG", quality=95)

        logger.info(f"Converted DICOM to JPEG: {dicom_path} -> {jpeg_path}")
        return jpeg_path

    except Exception as e:
        logger.error(f"Error converting DICOM to JPEG {dicom_path}: {str(e)}")
        return None


def RenderImage(x_ray_jpeg: str) -> str:
    """
    Render an image and return HTML container to display the image.

    Args:
        x_ray_jpeg (str): Absolute path to the image file

    Returns:
        str: HTML string containing the image display container
    """
    try:
        logger.info(f"Rendering image: {x_ray_jpeg}")
        # Validate file exists
        exist_image = os.path.exists(x_ray_jpeg)
        logger.info(f"Image exists: {exist_image}")
        if not os.path.exists(x_ray_jpeg):
            return f'<div class="image-error">⚠️ Image file not found: {x_ray_jpeg}</div>'

        # Validate it's an image file
        image_extensions = [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".bmp",
            ".tiff",
            ".webp",
            ".svg",
            ".ico",
        ]
        file_ext = os.path.splitext(x_ray_jpeg)[1].lower()

        if file_ext not in image_extensions:
            return (
                f'<div class="image-error">⚠️ Unsupported image format: {file_ext}</div>'
            )

        # Get file info
        file_name = os.path.basename(x_ray_jpeg)
        file_size = os.path.getsize(x_ray_jpeg)

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
            with Image.open(x_ray_jpeg) as img:
                width, height = img.size
                image_info = f"Dimensions: {width}×{height}px"
        except Exception as e:
            logger.warning(f"Could not get image dimensions for {x_ray_jpeg}: {e}")
            image_info = "Dimensions: Unknown"

        # Create a URL-friendly path for serving the image
        # Use the MIDRC file serving endpoint with query parameter for absolute paths
        # URL-encode the absolute path as a query parameter to avoid URL path issues
        encoded_path = urllib.parse.quote(x_ray_jpeg, safe="")
        image_url = f"http://127.0.0.1:5001/api/serve-midrc-file?path={encoded_path}"

        # Return just the image URL instead of full HTML to avoid template processing issues
        # The template system will handle the HTML rendering
        logger.info(f"Successfully rendered image: {file_name}")
        return f'<img src="{image_url}" alt="{file_name}" style="max-width: 100%; height: 200px;" />'

    except Exception as e:
        logger.error(f"Error rendering image {x_ray_jpeg}: {str(e)}")
        return f'<div class="image-error">❌ Error rendering image: {str(e)}</div>'


def GenerateAnnotations(x_ray_jpeg: str) -> str:
    """
    Generate annotations for an X-ray image by analyzing it with GPT-4 vision model and return results as an HTML table.

    Args:
        x_ray_jpeg (str): File path to the X-ray image in JPEG format

    Returns:
        str: HTML table containing the clinical findings and annotations
             Each row represents a finding with its laterality and SNOMED codes
    """

    # Load the X-ray image
    image = Image.open(x_ray_jpeg)

    prompt = """ Examine this image and look for any important clinical findings. 
Provide a summary in a table format where the positive clinical conditions are 1 and the negative clinical conditions are 0.
Designate each condition as left side, right side, or bilateral. Provide an SNOMED_CT code in a separate column for positive findings only or N/A if not applicable.

Table columns include: [Exam no., Finding No., Clinical Finding, Left Side, Right Side, Bilateral, SNOMED_CT Code, SNOMED_CT Description]

Additional instructions:
1. Normal findings should be excluded from the each table.
2. Group similar findings together where possible for each table.
3. Create a csv format that we can use to create a table.
4. Do not include any other text in the response.
"""

    response = openai.chat.completions.create(
        model="gpt-4o",
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
        # Split content into lines and clean up
        lines = csv_content.strip().split("\n")

        # Filter out markdown code block markers and empty lines
        clean_lines = []
        for line in lines:
            line = line.strip()
            # Skip markdown code block markers and empty lines
            if line.startswith("```") or line == "```csv" or line == "```" or not line:
                continue
            clean_lines.append(line)

        if not clean_lines:
            return (
                '<div class="annotation-error">No data available for annotations</div>'
            )

        # Start building HTML table with proper styling to handle span wrapper
        html = '<div class="annotations-table-container" style="display: block; width: 100%; overflow-x: auto;">\n'
        html += '<table class="annotations-table" style="display: table; width: 100%; border-collapse: collapse; margin: 0; padding: 0;">\n'

        # Process each cleaned line
        header_processed = False
        for line in clean_lines:
            # Split by comma, handling quoted fields
            fields = _parse_csv_line(line)

            # Skip empty field arrays
            if not fields or all(not f.strip() for f in fields):
                continue

            if not header_processed:
                # Header row
                html += "<thead>\n<tr>\n"
                for field in fields:
                    html += f'<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2; font-weight: bold;">{field.strip()}</th>\n'
                html += "</tr>\n</thead>\n<tbody>\n"
                header_processed = True
            else:
                # Data row
                html += "<tr>\n"
                for field in fields:
                    # Clean up the field content
                    clean_field = field.strip().strip('"').strip("'")
                    html += f'<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">{clean_field}</td>\n'
                html += "</tr>\n"

        html += "</tbody>\n</table>\n</div>"

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
        elif char == "," and not in_quotes:
            # End of field
            fields.append(current_field)
            current_field = ""
        else:
            current_field += char

        i += 1

    # Add the last field
    fields.append(current_field)

    return fields


def _make_udi_spec(csv_path):
    chart = (
        Chart()
        .source("dicom", csv_path)
        .groupby(["PatientAge", "Modality", "PatientSex"])
        .rollup("count", count=Op.count())
        .mark("bar")
        .x(field="PatientAge", type="nominal")
        .y(field="count", type="quantitative")
        .color(field="PatientSex", type="nominal")
    )
    spec = chart.to_dict()
    for t in spec["transformation"]:
        if "rollup" in t and isinstance(t["rollup"], str):
            t["rollup"] = {"count": {"op": "count"}}
    # Add column encoding manually for faceting by Modality
    spec["representation"]["mapping"].append(
        {"encoding": "column", "field": "Modality", "type": "nominal"}
    )
    return spec


def _make_udi_spec_visitdate(csv_path):
    chart = (
        Chart()
        .source("dicom", csv_path)
        .groupby(["StudyDate"])
        .rollup("count", count=Op.count())
        .mark("bar")
        .x(field="StudyDate", type="nominal")
        .y(field="count", type="quantitative")
    )
    spec = chart.to_dict()
    for t in spec["transformation"]:
        if "rollup" in t and isinstance(t["rollup"], str):
            t["rollup"] = {"count": {"op": "count"}}
    return spec


def GetPatientAgePlot(x_ray_dicom_files: List[str]) -> str:
    """
    Generate a visualization plot showing patient age distribution from DICOM files.

    Args:
        x_ray_dicom_files (List[str]): List of paths to DICOM files containing patient data

    Returns:
        str: HTML string containing the rendered visualization plot image
             The plot shows patient age distribution grouped by modality and sex
    """
    rand_tag = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    csv_path = f"usecase_col_{rand_tag}.csv"
    extract_usecase_columns(x_ray_dicom_files, csv_path)

    local_csv = csv_path
    bucket = "neural-science"

    # Construct the AWS CLI command
    cmd = f"aws s3 cp {local_csv} s3://{bucket}/{csv_path}"

    # Run the command and print output
    result = os.system(cmd)
    if result == 0:
        print(f"Successfully uploaded {local_csv} to s3://{bucket}/{csv_path}")
    else:
        print("Upload failed. Make sure AWS CLI is installed and configured.")

    csv_path_s3 = f"https://neural-science.s3.us-east-1.amazonaws.com/{csv_path}"
    udi_spec = _make_udi_spec(csv_path_s3)
    print(json.dumps(udi_spec, indent=2))

    # Generate a random tag for the filename
    rand_tag = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    output_img = f"udi_chart_{rand_tag}.png"
    # Render the image (Jupyter supports top-level await)
    asyncio.run(udi_to_png(udi_spec, output_img))

    # Copy the generated image to a location that can be served by the backend
    chart_dir = "database/files/charts"
    os.makedirs(chart_dir, exist_ok=True)
    chart_path = os.path.join(chart_dir, output_img)

    # Copy the generated chart to the serveable location
    if os.path.exists(output_img):
        import shutil

        shutil.copy2(output_img, chart_path)
        # Clean up the original file
        os.remove(output_img)

        # Create URL for serving the chart
        relative_path = f"database/files/charts/{output_img}"
        chart_url = f"http://127.0.0.1:5001/api/serve-file/{relative_path}"

        return f'<img src="{chart_url}" alt="UDI Chart" style="max-width: 100%; height: 200px;" />'
    else:
        return f'<div class="image-error">❌ Error: Chart file not generated</div>'


def GetVisitDatePlot(x_ray_dicom_files: List[str]) -> str:
    """
    Generate a visualization plot showing visit date distribution from DICOM files.

    Args:
        x_ray_dicom_files (List[str]): List of paths to DICOM files containing patient data

    Returns:
        str: HTML string containing the rendered visualization plot image
             The plot shows visit date distribution grouped by modality and sex
    """
    rand_tag = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    csv_path = f"usecase_col_{rand_tag}.csv"
    extract_usecase_columns(x_ray_dicom_files, csv_path)

    local_csv = csv_path
    bucket = "neural-science"

    # Construct the AWS CLI command
    cmd = f"aws s3 cp {local_csv} s3://{bucket}/{csv_path}"

    # Run the command and print output
    result = os.system(cmd)
    if result == 0:
        print(f"Successfully uploaded {local_csv} to s3://{bucket}/{csv_path}")
    else:
        print("Upload failed. Make sure AWS CLI is installed and configured.")

    csv_path_s3 = f"https://neural-science.s3.us-east-1.amazonaws.com/{csv_path}"
    udi_spec = _make_udi_spec_visitdate(csv_path_s3)
    print(json.dumps(udi_spec, indent=2))

    # Generate a random tag for the filename
    rand_tag = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    output_img = f"udi_chart_{rand_tag}.png"
    # Render the image (Jupyter supports top-level await)
    asyncio.run(udi_to_png(udi_spec, output_img))

    # Copy the generated image to a location that can be served by the backend
    chart_dir = "database/files/charts"
    os.makedirs(chart_dir, exist_ok=True)
    chart_path = os.path.join(chart_dir, output_img)

    # Copy the generated chart to the serveable location
    if os.path.exists(output_img):
        import shutil

        shutil.copy2(output_img, chart_path)
        # Clean up the original file
        os.remove(output_img)

        # Create URL for serving the chart
        relative_path = f"database/files/charts/{output_img}"
        chart_url = f"http://127.0.0.1:5001/api/serve-file/{relative_path}"

        return f'<img src="{chart_url}" alt="UDI Chart" style="max-width: 100%; height: 200px;" />'
    else:
        return f'<div class="image-error">❌ Error: Chart file not generated</div>'


def get_codes_from_natural_language(natural_language_query):
    BASE = "http://localhost:8000"

    r = requests.get(
        f"{BASE}/cuis", params={"query": natural_language_query}, timeout=60
    )
    r.raise_for_status()
    matches = r.json()
    results = [m for m in matches["cuis"] if m["language_code"] == "ENG"]

    codes = {m["cui"]: m for m in results}
    snomed_codes = {}
    billing_codes = {}
    for key, cui in codes.items():
        r = requests.get(f"{BASE}/code-map/", params={"cui": key}, timeout=60)
        r.raise_for_status()
        matches = r.json()["code_maps"]
        for m in matches:
            if m["sab"] == "SNOMEDCT_US":
                snomed_codes[key] = m
                codes[key]["snomed"] = m
            elif m["sab"] == "ICD10CM":
                billing_codes[key] = m
                codes[key]["icd10m"] = m

    # Retain only CUI codes that have both SNOMED and ICD10CM codes
    return_codes = []
    for key in list(codes.keys()):
        if key in snomed_codes and key in billing_codes:
            return_codes.append(
                {
                    "cui": key,
                    "cui_name": codes[key]["name"],
                    "snomed_code": snomed_codes[key]["code"],
                    "snomed_name": snomed_codes[key]["name"],
                    "icd10cm_code": billing_codes[key]["code"],
                    "icd10cm_name": billing_codes[key]["name"],
                }
            )

    if not return_codes:
        return [
            {
                "cui": "N/A",
                "cui_name": "No matching CUI found",
                "snomed_code": "N/A",
                "snomed_name": "N/A",
                "icd10cm_code": "N/A",
                "icd10cm_name": "N/A",
            }
        ]

    return return_codes


def GetBillingTable(annotations_html_table: str) -> str:
    """
    Takes HTML table output from GenerateAnnotations and returns a billing HTML table with columns containing the billing codes (ICD-10-CM).

    Args:
        annotations_html_table (str): HTML table string from GenerateAnnotations output

    Returns:
        str: Billing HTML table with columns containing the billing codes (ICD-10-CM).
             ['cui', 'cui_name', 'icd10cm_code', 'icd10cm_name']
    """

    try:
        annotations_df = pd.read_html(io.StringIO(annotations_html_table), header=0)[0]
        conditions = annotations_df["Clinical Finding"].tolist()
        return_table = []
        for cond in conditions:
            logger.info(f"Mapping condition: {cond}")
            billing_codes = get_codes_from_natural_language(cond)
            logger.info(f"Billing codes found: {billing_codes}")
            return_table.extend(billing_codes)

        return_df = pd.DataFrame(return_table)

        # Build enhanced HTML table
        html = '<div class="billing-table-container" style="display: block; width: 100%; overflow-x: auto;">\n'
        html += '<table class="billing-table" style="display: table; width: 100%; border-collapse: collapse; margin: 0; padding: 0;">\n'

        html += '<thead>\n<tr>\n'
        for header in return_df.columns:
            html += f'<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2; font-weight: bold;">{header}</th>\n'
        html += '</tr>\n</thead>\n<tbody>\n'
        
        # Process each data row and add medical codes
        for index, row in return_df.iterrows():
            html += '<tr>\n'
            for col in return_df.columns:
                html += f'<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">{row[col]}</td>\n'
            
            html += '</tr>\n'

        html += "</tbody>\n</table>\n</div>"
        return html
        
    except Exception as e:
        logger.error(f"Error processing annotations table: {str(e)}")
        return f'<div class="annotation-error">❌ Error processing billing tabl {str(e)}</div>'
