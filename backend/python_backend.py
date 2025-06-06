#!/usr/bin/env python3

import json
import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

# Make together import optional
try:
    from together import Together
except ImportError:
    Together = None

from chat_manager import ChatManager
from template import Template
from execution_result import ExecutionResult
from simple_view import SimpleView
from diff_view import DiffView  

# Add file processing imports
import pandas as pd
from bs4 import BeautifulSoup
import PyPDF2
import openpyxl
from pathlib import Path
import io
import base64

# Add parent directory to path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('backend')

app = Flask(__name__)
CORS(app)

# Initialize OpenAI client
try:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set! AI features will be limited.")
        logger.info("Set it with: export OPENAI_API_KEY='your-key'")
    
    client = OpenAI(api_key=api_key) if api_key else None
    if client:
        logger.info("✓ OpenAI client initialized successfully")
    else:
        api_key = os.getenv("TOGETHER_API_KEY")
        if api_key and Together:
            client = Together(api_key=api_key)
            logger.info("✓ Together client initialized successfully")
        else:
            if not Together:
                logger.warning("⚠ Together module not available (install with: pip install together)")
            logger.warning("⚠ Running without OpenAI or Together client")
        
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {e}")
    client = None

# Global state
view_registry = {}  # session_id -> View
chat_manager = ChatManager(client, view_registry) if client else None

# Persistent storage for all documents
DATABASE_DIR = 'database'
DOCUMENTS_FILE = os.path.join(DATABASE_DIR, 'documents.json')

def ensure_database_dir():
    """Ensure database directory exists"""
    if not os.path.exists(DATABASE_DIR):
        os.makedirs(DATABASE_DIR)
        logger.info(f"📁 Created database directory: {DATABASE_DIR}")

def load_documents():
    """Load all documents from file on startup"""
    global documents
    try:
        ensure_database_dir()
        if os.path.exists(DOCUMENTS_FILE):
            with open(DOCUMENTS_FILE, 'r') as f:
                documents = json.load(f)
                logger.info(f"📄 Loaded {len(documents)} documents from {DOCUMENTS_FILE}")
        else:
            documents = {}
            logger.info("📄 No existing documents file found. Starting fresh.")
    except Exception as e:
        logger.error(f"❌ Error loading documents: {e}")
        documents = {}

def save_documents():
    """Save all documents to file for persistence"""
    try:
        ensure_database_dir()
        with open(DOCUMENTS_FILE, 'w') as f:
            json.dump(documents, f, indent=2)
        logger.info(f"💾 Saved {len(documents)} documents to {DOCUMENTS_FILE}")
    except Exception as e:
        logger.error(f"❌ Error saving documents: {e}")

# Initialize storage
documents = {}  # Global storage for all documents
load_documents()

@app.before_request
def log_request():
    """Log all incoming requests for debugging."""
    # print(f"📥 Incoming request: {request.method} {request.url}", flush=True)
    if request.method == 'POST' and request.is_json:
        print(f"📄 Request data: {request.get_json()}", flush=True)

@app.route('/api/chat', methods=['POST'])
def handle_chat():
    """Handle chat messages using the ChatManager."""
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        session_id = data.get('session_id', 'default')
        current_template = data.get('current_template', '')
        suggest_template = data.get('suggest_template', False)  # Default to False for regular chat
        
        # Check if chat_manager is available (requires OpenAI API key)
        if chat_manager is None:
            return jsonify({
                'error': 'OpenAI API key not configured',
                'response': 'Sorry, I cannot process chat messages because the OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable and restart the server.',
                'content': 'To enable AI chat features, please:\n1. Get an OpenAI API key from https://platform.openai.com/\n2. Set it as an environment variable: export OPENAI_API_KEY="your-key-here"\n3. Restart the Python backend',
                'result': '',
                'variables': {},
                'cache_info': {'variables_count': 0, 'cached': False},
                'template': {'current_template': current_template, 'view_type': 'simple'},
                'output': {'result': '', 'variables': {}, 'view_type': 'simple'},
                'view_type': 'simple'
            })
        
        # Use chat_manager to handle the message
        response = chat_manager.handle_chat_message(
            user_message=user_message,
            session_id=session_id,
            current_template_text=current_template,
            suggest_template=suggest_template
        )
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'content': f'Error processing message: {str(e)}'
        }), 500

@app.route('/api/execute-template', methods=['POST'])
def execute_template():
    """Execute a template and return the result."""
    try:
        data = request.get_json()
        template_text = data.get('template_text', '')
        session_id = data.get('session_id', 'default')
        
        # Create or get the view for this session
        if session_id not in view_registry:
            template = Template(template_text)
            execution_result = ExecutionResult()
            view_registry[session_id] = SimpleView(template, execution_result, client)
        
        # Update the template and execute it
        view = view_registry[session_id]
        view.update_from_editor(template_text)
        
        # Get the rendered output
        output_data = view.render_output()
        template_data = view.render_template()
        
        print(output_data, flush=True)
        return jsonify({
            'success': True,
            'template_text': template_data.get('template_text', template_text),
            'rendered_output': output_data.get('result', ''),
            'variables': output_data.get('variables', {}),
            'view_type': output_data.get('view_type', 'simple')
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'rendered_output': f'Error executing template: {str(e)}'
        }), 500

@app.route('/api/file-context', methods=['POST'])
def set_file_context():
    """Set file context for chat."""
    try:
        data = request.get_json()
        file_name = data.get('fileName', '')
        content = data.get('content', '')
        session_id = data.get('session_id', 'default')
        
        # Create a template from the file content
        template = Template(content)
        execution_result = ExecutionResult()
        view_registry[session_id] = SimpleView(template, execution_result, client)
        
        return jsonify({
            'message': f'File "{file_name}" has been loaded as context for chat.',
            'success': True
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/file-context', methods=['DELETE'])
def clear_file_context():
    """Clear file context for chat."""
    try:
        session_id = request.args.get('session_id', 'default')
        
        if session_id in view_registry:
            del view_registry[session_id]
        
        return jsonify({
            'message': 'File context has been cleared.',
            'success': True
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/compute-diff', methods=['POST'])
def compute_diff():
    """Compute diff between current and suggested template/output."""
    try:
        data = request.get_json()
        current_text = data.get('current_text', '')
        suggested_text = data.get('suggested_text', '')
        session_id = data.get('session_id', 'default')
        content_type = data.get('content_type', 'template')  # 'template' or 'output'
        
        # Use the backend diff computation from DiffViewStrategy
        if content_type == 'template':
            # For templates, we need to execute both to get outputs
            current_template = Template(current_text)
            suggested_template = Template(suggested_text)
            
            # Execute both templates
            execution_result = ExecutionResult()
            current_result = current_template.execute(client, execution_result)
            suggested_result = suggested_template.execute(client, execution_result)
            
            # Create DiffView to compute diffs
            from diff_view import DiffView
            diff_view = DiffView(
                current_template=current_template,
                current_result=current_result,
                suggested_template=suggested_template,
                suggested_result=suggested_result,
                client=client
            )
            
            template_data = diff_view.render_template()
            output_data = diff_view.render_output()
            
            return jsonify({
                'success': True,
                'template_diffs': template_data.get('line_diffs', []),
                'current_template': template_data.get('current_template', ''),
                'suggested_template': template_data.get('suggested_template', ''),
                'current_output': output_data.get('current_output', ''),
                'suggested_output': output_data.get('suggested_output', ''),
                'output_diffs': compute_text_diff(
                    output_data.get('current_output', ''),
                    output_data.get('suggested_output', '')
                )
            })
        else:
            # For output-only diff
            diffs = compute_text_diff(current_text, suggested_text)
            return jsonify({
                'success': True,
                'output_diffs': diffs,
                'current_output': current_text,
                'suggested_output': suggested_text
            })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def compute_text_diff(current_text, suggested_text):
    """Helper function to compute line-by-line diff for any text."""
    current_lines = current_text.split('\n')
    suggested_lines = suggested_text.split('\n')
    max_lines = max(len(current_lines), len(suggested_lines))
    
    diffs = []
    for i in range(max_lines):
        current_line = current_lines[i] if i < len(current_lines) else ''
        suggested_line = suggested_lines[i] if i < len(suggested_lines) else ''
        
        if current_line != suggested_line:
            diffs.append({
                'line_index': i,
                'current_line': current_line,
                'suggested_line': suggested_line,
                'change_type': 'modified' if current_line and suggested_line 
                             else 'added' if not current_line 
                             else 'removed'
            })
    
    return diffs

@app.route('/api/view-action', methods=['POST'])
def handle_view_action():
    """Handle view actions like accept/reject in diff view."""
    try:
        data = request.get_json()
        action = data.get('action', '')
        session_id = data.get('session_id', 'default')
        
        if session_id not in view_registry:
            return jsonify({'error': 'No view found for session'}), 404
        
        view = view_registry[session_id]
        
        if isinstance(view, DiffView):
            if action == 'accept':
                new_view = view.accept_suggestion()
                view_registry[session_id] = new_view
                return jsonify({
                    'success': True,
                    'message': 'Suggestion accepted',
                    'view_type': 'simple'
                })
            elif action == 'reject':
                new_view = view.reject_suggestion()
                view_registry[session_id] = new_view
                return jsonify({
                    'success': True,
                    'message': 'Suggestion rejected',
                    'view_type': 'simple'
                })
        
        return jsonify({'error': 'Invalid action or view type'}), 400
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/get-view', methods=['GET'])
def get_current_view():
    """Get the current view state."""
    try:
        session_id = request.args.get('session_id', 'default')
        
        if session_id not in view_registry:
            return jsonify({
                'view_type': 'simple',
                'template_text': '',
                'rendered_output': '',
                'variables': {}
            })
        
        view = view_registry[session_id]
        template_data = view.render_template()
        output_data = view.render_output()
        
        response = {
            'view_type': output_data.get('view_type', 'simple'),
            'template_text': template_data.get('template_text', ''),
            'rendered_output': output_data.get('result', ''),
            'variables': output_data.get('variables', {})
        }
        
        # Add diff-specific data if it's a DiffView
        if isinstance(view, DiffView):
            response.update({
                'current_template': template_data.get('current_template', ''),
                'suggested_template': template_data.get('suggested_template', ''),
                'line_diffs': template_data.get('line_diffs', []),
                'current_output': output_data.get('current_output', ''),
                'suggested_output': output_data.get('suggested_output', '')
            })
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'view_type': 'simple',
            'template_text': '',
            'rendered_output': '',
            'variables': {}
        }), 500

@app.route('/api/chat/clear', methods=['POST'])
def clear_chat_history():
    """Clear chat history for a session."""
    try:
        data = request.get_json()
        session_id = data.get('session_id', 'default')
        
        # Clear conversation history in chat manager if it exists
        cleared = False
        if chat_manager:
            cleared = chat_manager.clear_conversation_history(session_id)
        
        return jsonify({
            'success': True,
            'cleared': cleared,
            'message': f'Chat history cleared for session {session_id}' if cleared else f'No chat history found for session {session_id}'
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

# File processing utility functions
def process_excel_file(file_content, file_name):
    """Process Excel file and extract text content."""
    try:
        # Create a BytesIO object from the content
        file_buffer = io.BytesIO(base64.b64decode(file_content))
        
        # Read Excel file
        if file_name.endswith('.xlsx'):
            workbook = openpyxl.load_workbook(file_buffer)
            content = f"Excel File: {file_name}\n\n"
            
            for sheet_name in workbook.sheetnames:
                sheet = workbook[sheet_name]
                content += f"Sheet: {sheet_name}\n"
                content += "-" * 40 + "\n"
                
                for row in sheet.iter_rows(values_only=True):
                    if any(cell is not None for cell in row):
                        row_text = "\t".join(str(cell) if cell is not None else "" for cell in row)
                        content += row_text + "\n"
                content += "\n"
        else:
            # For .xls files, use pandas
            df_dict = pd.read_excel(file_buffer, sheet_name=None)
            content = f"Excel File: {file_name}\n\n"
            
            for sheet_name, df in df_dict.items():
                content += f"Sheet: {sheet_name}\n"
                content += "-" * 40 + "\n"
                content += df.to_string(index=False) + "\n\n"
        
        return content
        
    except Exception as e:
        return f"Error processing Excel file: {str(e)}"

def process_pdf_file(file_content, file_name):
    """Process PDF file and extract text content."""
    try:
        # Create a BytesIO object from the content
        file_buffer = io.BytesIO(base64.b64decode(file_content))
        
        # Read PDF file
        pdf_reader = PyPDF2.PdfReader(file_buffer)
        content = f"PDF File: {file_name}\n"
        content += f"Number of pages: {len(pdf_reader.pages)}\n\n"
        
        for page_num, page in enumerate(pdf_reader.pages, 1):
            content += f"Page {page_num}:\n"
            content += "-" * 40 + "\n"
            try:
                page_text = page.extract_text()
                content += page_text + "\n\n"
            except Exception as e:
                content += f"Error extracting text from page {page_num}: {str(e)}\n\n"
        
        return content
        
    except Exception as e:
        return f"Error processing PDF file: {str(e)}"

def process_html_file(file_content, file_name):
    """Process HTML file and extract text content."""
    try:
        # If content is base64 encoded, decode it
        if isinstance(file_content, str) and len(file_content) > 100:
            try:
                html_content = base64.b64decode(file_content).decode('utf-8')
            except:
                html_content = file_content
        else:
            html_content = file_content
        
        # Parse HTML and extract text
        soup = BeautifulSoup(html_content, 'html.parser')
        
        content = f"HTML File: {file_name}\n\n"
        
        # Extract title if available
        title = soup.find('title')
        if title:
            content += f"Title: {title.get_text().strip()}\n\n"
        
        # Extract main content
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        
        # Get text content
        text = soup.get_text()
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        content += '\n'.join(chunk for chunk in chunks if chunk)
        
        return content
        
    except Exception as e:
        return f"Error processing HTML file: {str(e)}"

@app.route('/api/process-file', methods=['POST'])
def process_file():
    """Process uploaded files (Excel, PDF, HTML) and return extracted content."""
    try:
        data = request.get_json()
        file_name = data.get('fileName', '')
        file_content = data.get('content', '')  # Base64 encoded for binary files
        file_path = data.get('filePath', '')
        session_id = data.get('session_id', 'default')
        
        # Determine file type and process accordingly
        file_ext = Path(file_name).suffix.lower()
        
        if file_ext in ['.xlsx', '.xls']:
            processed_content = process_excel_file(file_content, file_name)
        elif file_ext == '.pdf':
            processed_content = process_pdf_file(file_content, file_name)
        elif file_ext in ['.html', '.htm']:
            processed_content = process_html_file(file_content, file_name)
        else:
            # For other file types, return as-is (assuming text)
            processed_content = file_content
        
        return jsonify({'success': True, 'message': 'File processed successfully', 'content': processed_content, 'fileName': file_name, 'filePath': file_path})
        
    except Exception as e:
        logger.error(f"Error processing file: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/documents', methods=['POST'])
def save_document():
    """Save a document to backend storage."""
    try:
        data = request.get_json()
        
        # Extract document data
        document_id = data.get('documentId')
        title = data.get('title', 'Untitled Document')
        template_content = data.get('template_content', '')
        source_content = data.get('source_content', '')
        preview_content = data.get('preview_content', '')
        session_id = data.get('sessionId')
        created_at = data.get('createdAt')
        last_modified = data.get('lastModified')
        chat_history = data.get('chatHistory', [])
        variables = data.get('variables', {})
        context_files = data.get('contextFiles', [])
        
        # Core document schema
        author = data.get('author')
        author_name = data.get('authorName', 'Unknown')
        editors = data.get('editors', [])
        viewers = data.get('viewers', [])
        
        # Extract comments data (new field)
        comments = data.get('comments', {})
        
        # Create document with unified schema
        document = {
            'id': document_id,
            'title': title,
            'source_content': source_content,
            'template_content': template_content,
            'preview_content': preview_content,
            'sessionId': session_id,
            'createdAt': created_at,
            'lastModified': last_modified,
            'chatHistory': chat_history,
            'variables': variables,
            'contextFiles': context_files,
            'author': author,
            'authorName': author_name,
            'editors': editors,
            'viewers': viewers,
            'comments': comments,  # Add comments to document schema
            'savedAt': datetime.now().isoformat()
        }
        
        # Store document
        documents[document_id] = document
        
        # Persist to file
        save_documents()
        
        # Log comment information for debugging
        comment_count = len(comments) if isinstance(comments, dict) else 0
        logger.info(f"Document '{title}' (ID: {document_id}) saved by {author_name} with {comment_count} comments")
        
        return jsonify({
            'success': True,
            'message': f'Document "{title}" has been saved',
            'documentId': document_id
        })
            
    except Exception as e:
        logger.error(f"Error saving document: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/documents', methods=['GET'])
def get_all_documents():
    """Get all documents."""
    try:
        documents_list = list(documents.values())
        
        logger.info(f"Returning {len(documents_list)} documents")
        
        return jsonify({
            'success': True,
            'documents': documents_list,
            'count': len(documents_list)
        })
        
    except Exception as e:
        logger.error(f"Error getting documents: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/documents/user/<user_id>', methods=['GET'])
def get_user_documents(user_id):
    """Get all documents accessible to a specific user."""
    try:
        accessible_docs = []
        
        for doc_id, doc in documents.items():
            # User can access if they are:
            # 1. The author
            # 2. In the editors list  
            # 3. In the viewers list
            if (doc.get('author') == user_id or
                user_id in doc.get('editors', []) or
                user_id in doc.get('viewers', [])):
                
                # Add permission info for frontend
                doc_copy = doc.copy()
                doc_copy['userPermission'] = {
                    'isAuthor': doc.get('author') == user_id,
                    'canEdit': doc.get('author') == user_id or user_id in doc.get('editors', []),
                    'canView': True  # If they can access it, they can view it
                }
                accessible_docs.append(doc_copy)
        
        # logger.info(f"Returning {len(accessible_docs)} accessible documents for user {user_id}")
        
        return jsonify({
            'success': True,
            'documents': accessible_docs,
            'count': len(accessible_docs)
        })
        
    except Exception as e:
        logger.error(f"Error getting documents for user {user_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/documents/<document_id>', methods=['GET'])
def get_shared_document(document_id):
    """Get a specific shared document by ID."""
    try:
        if document_id in documents:
            document = documents[document_id]
            # logger.info(f"Returning shared document: {document['title']}")
            
            return jsonify({
                'success': True,
                'document': document
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Document not found'
            }), 404
            
    except Exception as e:
        logger.error(f"Error getting shared document {document_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/documents/<document_id>', methods=['DELETE'])
def delete_document(document_id):
    """Delete a document."""
    try:
        if document_id in documents:
            document_title = documents[document_id]['title']
            del documents[document_id]
            
            # Persist changes
            save_documents()
            
            logger.info(f"Deleted document: {document_title}")
            
            return jsonify({
                'success': True,
                'message': f'Document "{document_title}" has been deleted'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Document not found'
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Python backend server...")
    app.run(host='127.0.0.1', port=5000, debug=True) 