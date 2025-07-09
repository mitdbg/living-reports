import os
import subprocess
import threading
import time
import logging


from gen3.auth import Gen3Auth
from gen3.query import Gen3Query

logger = logging.getLogger('midrc')

MIDRC_API = "https://data.midrc.org"

auth = Gen3Auth(MIDRC_API, refresh_file=os.environ.get('MIDRC_CREDENTIALS_PATH')) # authentication class
query = Gen3Query(auth)


def download_midrc_file_implementation(object_id, document_id, app, cred_path, output_dir):
    # Create unique download ID for tracking (sanitize object_id for URL safety)
    sanitized_object_id = object_id.replace('/', '_').replace('.', '_')
    download_id = f"{sanitized_object_id}_{int(time.time())}"
    
    # Store download status (you might want to use Redis or database for persistence)
    download_status = {
        'status': 'started',
        'progress': 'Initiating download...',
        'object_id': object_id,
        'download_id': download_id
    }
    
    # Store in memory (for simple implementation)
    if not hasattr(app, 'download_statuses'):
        app.download_statuses = {}
    app.download_statuses[download_id] = download_status
    
    def background_download():
        """Execute download in background thread"""
        try:
            app.download_statuses[download_id]['progress'] = 'Executing gen3 command...'
            
            # Build the gen3 command directly
            cmd = f"gen3 --auth {cred_path} --endpoint data.midrc.org drs-pull object {object_id} --output-dir {output_dir}"
            logger.info(f"Executing command: {cmd}")
            
            # Execute command directly with subprocess for better control
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                logger.info("✅ Command executed successfully")
                logger.info(f"STDOUT: {result.stdout}")
                
                # Find all downloaded files in the output directory
                downloaded_files = []
                for root, dirs, files in os.walk(output_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        downloaded_files.append(file_path)
                
                if downloaded_files:
                    file_path = downloaded_files[0]
                    app.download_statuses[download_id].update({
                        'status': 'completed',
                        'progress': 'Download completed successfully',
                        'file_path': file_path,
                        'downloaded_files': downloaded_files,
                        'success': True
                    })
                    logger.info(f"✅ MIDRC file downloaded successfully: {file_path}")
                else:
                    app.download_statuses[download_id].update({
                        'status': 'failed',
                        'progress': 'No files found after download',
                        'error': 'No files found after download',
                        'success': False
                    })
            else:
                error_msg = f"Command failed with exit code {result.returncode}"
                if result.stderr:
                    error_msg += f": {result.stderr}"
                app.download_statuses[download_id].update({
                    'status': 'failed',
                    'progress': f'Download failed: {error_msg}',
                    'error': error_msg,
                    'success': False
                })
                logger.error(f"❌ MIDRC download failed: {error_msg}")
                
        except subprocess.TimeoutExpired:
            app.download_statuses[download_id].update({
                'status': 'failed',
                'progress': 'Download timed out after 5 minutes',
                'error': 'Download timed out after 5 minutes',
                'success': False
            })
            logger.error("❌ MIDRC download timed out")
        except Exception as e:
            app.download_statuses[download_id].update({
                'status': 'failed',
                'progress': f'Error: {str(e)}',
                'error': str(e),
                'success': False
            })
            logger.error(f"❌ Background download error: {e}")
    
    # Start background thread
    thread = threading.Thread(target=background_download)
    thread.daemon = True
    thread.start()

    return {}


def access_midrc_info_by_caseid(case_ids):
    cases = query.raw_data_download(
                    data_type="case",
                    fields=None,
                    filter_object={
                        "AND": [
                            {"IN": {"case_ids": case_ids}},
                        ]
                    },
                    sort_fields=[{"submitter_id": "asc"}]
                )

    if len(cases) > 0 and "submitter_id" in cases[0]:
        case_ids = [i['submitter_id'] for i in cases] ## make a list of the case (patient) IDs returned
        print("Query returned {} case IDs.".format(len(cases)))
        print("Data is a list with rows like this:\n\t {}".format(cases[0:1]))
    else:
        print("Your query returned no data! Please, check that query parameters are valid.")


def access_midrc_files_by_caseid(case_ids, document_id, app, cred_path, output_dir):
    source_nodes = ["cr_series_file","dx_series_file","annotation_file","dicom_annotation_file"]
    modality = ["SEG", "CR", "DX"]
    auth = Gen3Auth(MIDRC_API, refresh_file=os.environ.get('MIDRC_CREDENTIALS_PATH')) # authentication class
    query = Gen3Query(auth)
    data_files = query.raw_data_download(
                    data_type="data_file",
                    fields=None,
                    filter_object={
                        "AND": [
                            {"IN": {"case_ids": case_ids}},
                            {"IN": {"source_node": source_nodes}},
                            {"IN": {"modality": modality}},
                        ]
                    },
                    sort_fields=[{"submitter_id": "asc"}]
                )

    if len(data_files) > 0:
        object_ids = [i['object_id'] for i in data_files if 'object_id' in i] ## make a list of the file object_ids returned by our query
        print("Query returned {} data files with {} object_ids.".format(len(data_files),len(object_ids)))
        print("Data is a list with rows like this:\n\t {}".format(data_files[0:1]))
    else:
        print("Your query returned no data! Please, check that query parameters are valid.")

    ## Build a list 
    object_ids = []
    for data_file in data_files:
        if 'object_id' in data_file:
            object_id = data_file['object_id']
            object_ids.append(object_id)

    object_id = object_ids[1]
    print("The first object_id of {}: '{}'".format(len(object_ids),object_id))
    download_id = download_midrc_file_implementation(object_id, document_id, app, cred_path, output_dir)
    return download_id


def gather_midrc_info_by_caseid(case_ids, document_id, app, cred_path, output_dir):
    cases = access_midrc_info_by_caseid(case_ids)
    download_id = access_midrc_files_by_caseid(case_ids, document_id, app, cred_path, output_dir)
    return cases, download_id





# query = Gen3Query(auth)