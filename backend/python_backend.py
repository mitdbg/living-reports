#!/usr/bin/env python3

import json
import os
import logging
from datetime import datetime
import shutil
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from openai import OpenAI

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, continue without .env support

# Make together import optional
try:
    from together import Together
except ImportError:
    Together = None

from chat_manager import ChatManager
from template import Template
from execution_result import ExecutionResult
from simple_view import SimpleView
from file_processor import process_excel_file, process_html_file, process_pptx_file
from pdf_processor import process_pdf_file
from local_code_executor.code_executor import execute_code_locally
from task_manager import TaskManager
from pathlib import Path

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
        logger.info("Set it in your .env file: OPENAI_API_KEY='your-key'")
    
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

# Initialize MCP service at application startup
from simple_mcp_service import initialize_mcp

# Global state
view_registry = {}  # session_id -> View
chat_manager = ChatManager(client, view_registry) if client else None
task_manager = TaskManager()

def initialize_mcp_at_startup():
    """Initialize MCP service at startup with persistent event loop."""
    import threading
    import asyncio
    
    def init_mcp():
        try:
            logger.info("🚀 Starting MCP initialization at startup...")
            # Use the service's own background loop initialization
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(initialize_mcp())
                if success:
                    logger.info("✅ MCP service initialized successfully at startup")
                else:
                    logger.warning("⚠️ MCP service initialization failed at startup")
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"❌ Error during MCP startup initialization: {e}")
    
    # Start initialization in background thread to not block Flask startup
    thread = threading.Thread(target=init_mcp, daemon=True)
    thread.start()
    logger.info("🔄 MCP initialization started in background thread")

# Initialize MCP at startup
initialize_mcp_at_startup()

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

# Persistent storage for document verifications
VERIFICATIONS_FILE = os.path.join(DATABASE_DIR, 'verifications.json')

def load_verifications():
    """Load all verifications from file"""
    try:
        ensure_database_dir()
        if os.path.exists(VERIFICATIONS_FILE):
            with open(VERIFICATIONS_FILE, 'r') as f:
                verifications = json.load(f)
                logger.info(f"📋 Loaded verifications for {len(verifications)} documents from {VERIFICATIONS_FILE}")
                return verifications
        else:
            logger.info("📋 No existing verifications file found. Starting fresh.")
            return {}
    except Exception as e:
        logger.error(f"❌ Error loading verifications: {e}")
        return {}

def save_verifications(verifications):
    """Save all verifications to file"""
    try:
        ensure_database_dir()
        with open(VERIFICATIONS_FILE, 'w') as f:
            json.dump(verifications, f, indent=2)
        logger.info(f"💾 Saved verifications for {len(verifications)} documents to {VERIFICATIONS_FILE}")
    except Exception as e:
        logger.error(f"❌ Error saving verifications: {e}")

# Initialize verifications storage
verifications = load_verifications()

# Persistent storage for Data Lake
DATA_LAKE_FILE = os.path.join(DATABASE_DIR, 'data_lake.json')

def load_data_lake():
    """Load all data lake items from file"""
    try:
        ensure_database_dir()
        if os.path.exists(DATA_LAKE_FILE):
            with open(DATA_LAKE_FILE, 'r') as f:
                data_lake = json.load(f)
                logger.info(f"🗂️ Loaded data lake for {len(data_lake)} documents from {DATA_LAKE_FILE}")
                return data_lake
        else:
            logger.info("🗂️ No existing data lake file found. Starting fresh.")
            return {}
    except Exception as e:
        logger.error(f"❌ Error loading data lake: {e}")
        return {}

def save_data_lake(data_lake):
    """Save all data lake items to file"""
    try:
        ensure_database_dir()
        with open(DATA_LAKE_FILE, 'w') as f:
            json.dump(data_lake, f, indent=2)
        logger.info(f"💾 Saved data lake for {len(data_lake)} documents to {DATA_LAKE_FILE}")
    except Exception as e:
        logger.error(f"❌ Error saving data lake: {e}")

# Initialize data lake storage
data_lake_storage = load_data_lake()

# Initialize task manager
task_manager = TaskManager(DATABASE_DIR)

# Persistent storage for Variables
VARIABLES_FILE = os.path.join(DATABASE_DIR, 'vars.json')

def load_variables():
    """Load all variables from file"""
    try:
        ensure_database_dir()
        if os.path.exists(VARIABLES_FILE):
            with open(VARIABLES_FILE, 'r') as f:
                variables = json.load(f)
                logger.info(f"📊 Loaded variables for {len(variables)} documents from {VARIABLES_FILE}")
                return variables
        else:
            logger.info("📊 No existing variables file found. Starting fresh.")
            return {}
    except Exception as e:
        logger.error(f"❌ Error loading variables: {e}")
        return {}

def save_variables(variables):
    """Save all variables to file"""
    try:
        ensure_database_dir()
        with open(VARIABLES_FILE, 'w') as f:
            json.dump(variables, f, indent=2)
        logger.info(f"💾 Saved variables for {len(variables)} documents to {VARIABLES_FILE}")
    except Exception as e:
        logger.error(f"❌ Error saving variables: {e}")

# Initialize variables storage
variables_storage = load_variables()

# Persistent storage for Tools
TOOLS_FILE = os.path.join(DATABASE_DIR, 'tools.json')

def load_tools():
    """Load all tools from file"""
    try:
        ensure_database_dir()
        if os.path.exists(TOOLS_FILE):
            with open(TOOLS_FILE, 'r') as f:
                tools = json.load(f)
                # Handle migration from array format to document_id keyed format
                if isinstance(tools, list):
                    # Migrate old format: move all tools to a 'global' document_id
                    logger.info(f"🔧 Migrating {len(tools)} tools from array to document-keyed format")
                    migrated_tools = {'global': tools}
                    save_tools(migrated_tools)
                    return migrated_tools
                elif isinstance(tools, dict):
                    logger.info(f"🔧 Loaded tools for {len(tools)} documents from {TOOLS_FILE}")
                    return tools
                else:
                    logger.warning("🔧 Invalid tools format, starting fresh")
                    return {}
        else:
            logger.info("🔧 No existing tools file found. Starting fresh.")
            return {}
    except Exception as e:
        logger.error(f"❌ Error loading tools: {e}")
        return {}

def save_tools(tools):
    """Save all tools to file"""
    try:
        ensure_database_dir()
        with open(TOOLS_FILE, 'w') as f:
            json.dump(tools, f, indent=2)
        total_tools = sum(len(doc_tools) for doc_tools in tools.values())
        logger.info(f"💾 Saved tools for {len(tools)} documents ({total_tools} total tools) to {TOOLS_FILE}")
    except Exception as e:
        logger.error(f"❌ Error saving tools: {e}")

# Initialize tools storage
tools_storage = load_tools()

@app.before_request
def log_request():
    """Log all incoming requests for debugging."""
    print(f"📥 Incoming request: {request.method} {request.url}", flush=True)

@app.route('/api/chat', methods=['POST'])
def handle_chat():
    """Handle chat messages using the ChatManager."""
    try:
        data = request.get_json()
        user_message = data.get('user_message', '')
        session_id = data.get('session_id', 'default')
        current_template = data.get('current_template', '')
        current_preview = data.get('current_preview', '')
        current_mode = data.get('current_mode', 'preview')
        suggest_template = data.get('suggest_template', False)  # Default to False for regular chat
        
        # Check if chat_manager is available (requires OpenAI API key)
        if chat_manager is None:
            return jsonify({
                'error': 'OpenAI API key not configured',
                'response': 'Sorry, I cannot process chat messages because the OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable and restart the server.',
                'content': 'To enable AI chat features, please:\n1. Get an OpenAI API key from https://platform.openai.com/\n2. Set it in your .env file: OPENAI_API_KEY="your-key-here"\n3. Restart the Python backend',
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
            current_template=current_template,
            current_preview=current_preview,
            current_mode=current_mode,
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
        document_id = data.get('document_id', None)

        print(f"📊 Document ID: {document_id}")
        print(f"📊 Session ID: {session_id}")
        print(f"📊 Template Text: {template_text}")
        
        # **FIRST: Load and merge variables from multiple sources**
        template_variables = variables_storage.get(document_id, {})
        logger.info(f"📊 Merged variables for {document_id}: {len(template_variables)} from template")

        # Create or get the view for this session with pre-loaded variables
        if session_id not in view_registry:
            template = Template(template_text, document_id)
            execution_result = ExecutionResult(variables=template_variables)
            view_registry[session_id] = SimpleView(template, execution_result, client)
        else:
            # Update existing view with merged variables
            view = view_registry[session_id]
            view.execution_result.variables = template_variables
        
        # Update the template and execute it (now with all variables available)
        view = view_registry[session_id]
        view.update_from_editor(template_text, document_id)
        

        for var_name, var_data in template_variables.items():
            print(f"📊 Variable {var_name}: {var_data}")

        # Get the rendered output with error handling
        try:
            output_data = view.render_output()
            print("✅ render_output() completed")
        except Exception as e:
            print(f"❌ Error in render_output(): {e}")
            raise e
            
        try:
            template_data = view.render_template()
            print("✅ render_template() completed")
        except Exception as e:
            print(f"❌ Error in render_template(): {e}")
            raise e
        
        # Safe debug print
        try:
            print(f"📊 Output data type: {type(output_data)}")
            if isinstance(output_data, dict):
                print(f"📊 Output data keys: {list(output_data.keys())}")
        except Exception as e:
            print(f"⚠️ Could not print output_data debug info: {e}")
            
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
        redirect_output_file_path = data.get('redirect_output_file_path', '')
        
        if redirect_output_file_path != "":
            with open(redirect_output_file_path, 'r') as f:
                content = f.read()

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

def fix_pptx_css_location(ai_generated_content, original_content):
    """
    Fix PPTX CSS that may have been moved to the wrong location by AI.
    Ensures CSS stays in <style> tags at the proper location.
    """
    try:
        import re
        
        # Extract original CSS from the original content
        original_css_match = re.search(r'<style[^>]*>(.*?)</style>', original_content, re.DOTALL | re.IGNORECASE)
        if not original_css_match:
            return ai_generated_content
        
        original_css = original_css_match.group(1)
        
        # Check if AI moved CSS outside of style tags
        # Look for CSS rules that appear as plain text
        css_pattern = r'\._css_\w+\s*\{[^}]*\}'
        loose_css_matches = re.findall(css_pattern, ai_generated_content)
        
        if loose_css_matches:
            # Remove loose CSS from content
            cleaned_content = ai_generated_content
            for css_rule in loose_css_matches:
                cleaned_content = cleaned_content.replace(css_rule, '')
            
            # Clean up extra whitespace
            cleaned_content = re.sub(r'\s+', ' ', cleaned_content).strip()
            
            # Ensure the original CSS is present in a style tag
            if '<style>' not in cleaned_content:
                # Add style tag with original CSS at the beginning
                cleaned_content = f'<style>{original_css}</style>\n{cleaned_content}'
            
            return cleaned_content
        
        # If no loose CSS found, return as-is
        return ai_generated_content
        
    except Exception as e:
        print(f"Error fixing PPTX CSS location: {e}")
        return ai_generated_content

@app.route('/api/ai-suggestion', methods=['POST'])
def get_ai_suggestion():
    """Get AI suggestion for content improvement in specific mode (preview, template, source)."""
    try:
        data = request.get_json()
        
        # Extract request data
        full_content = data.get('full_content', '')
        selected_text = data.get('selected_text', '')
        user_request = data.get('user_request', '')
        mode = data.get('mode', 'preview')  # 'preview', 'template', 'source'
        session_id = data.get('session_id', 'default')
        
        # Validate required fields
        if not full_content:
            return jsonify({
                'success': False,
                'error': 'Full content is required'
            }), 400
            
        if not selected_text:
            return jsonify({
                'success': False,
                'error': 'Selected text is required'
            }), 400
            
        if not user_request:
            return jsonify({
                'success': False,
                'error': 'User request is required'
            }), 400
        
        # Check if LLM client is available
        if client is None:
            return jsonify({
                'success': False,
                'error': 'AI service not available (API key not configured)'
            })
        
        # Detect if this is PPTX content with embedded CSS
        has_pptx_css = '<style>' in full_content and '_css_' in full_content
        
        # Define strings with backslashes outside f-string
        newline_instruction = 'Use <br> for line breaks, not newlines.'
        pptx_warning = 'CRITICAL - PPTX CONTENT DETECTED: This content contains PowerPoint slides with embedded CSS styles. You MUST preserve all <style> tags and CSS rules EXACTLY as they are. Do NOT move, modify, or relocate any CSS code. The CSS must remain in <style> tags at the top of the content.' if has_pptx_css else ''
        css_requirement = 'If content has <style> tags with CSS, preserve them EXACTLY in their original location' if has_pptx_css else 'You can modify any part of the content to address the user\'s request'
        css_rule = '6. DO NOT move or modify any <style> tags or CSS rules - they control slide formatting' if has_pptx_css else ''
        
        # Create structured prompt for LLM
        prompt = f"""You are an AI assistant helping to improve content based on user feedback.

MODE: {mode}
FULL CONTENT:
{full_content}

SELECTED TEXT: "{selected_text}"
USER REQUEST: "{user_request}"

The user has selected some text and made a request about it. Based on their request, you should provide an improved version of the ENTIRE content, not just the selected text. You can modify any part of the content to address the user's request - add, remove, or change any sections as needed.

IMPORTANT: The full_content is in HTML format. You must return the improved content in the SAME HTML format, preserving all HTML tags, attributes, and structure. {newline_instruction}

{pptx_warning}

Respond with ONLY a JSON object in this exact format:
{{
    "new_text": "the complete improved content in HTML format (entire document/content)",
    "explanation": "brief explanation of what changes were made and why",
    "confidence": 0.85
}}

Requirements:
1. "new_text" must contain the ENTIRE improved content in HTML format, not just a fragment
2. Preserve HTML structure - use <br> for line breaks, maintain existing HTML tags
3. {css_requirement}
4. "confidence" should be between 0.0 and 1.0
5. Return ONLY the JSON object, no other text
{css_rule}

JSON:"""
        try:
            # Call LLM for suggestion
            if hasattr(client, 'chat'):
                response = client.chat.completions.create(
                    model="gpt-4.1-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=8000
                )
                suggestion_text = response.choices[0].message.content.strip()
            else:
                # Together client
                response = client.chat.completions.create(
                    model="Qwen/Qwen2.5-Coder-32B-Instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=8000
                )
                suggestion_text = response.choices[0].message.content.strip()
            
            print(f"AI Suggestion Raw Response: {suggestion_text}")
            
            try:
                import json
                import re
                
                # Clean up the response to extract JSON
                json_match = re.search(r'\{[\s\S]*\}', suggestion_text)
                if json_match:
                    json_str = json_match.group()
                    parsed_suggestion = json.loads(json_str)
                else:
                    raise ValueError("No JSON found in response")
                
                required_fields = ['new_text', 'explanation', 'confidence']
                for field in required_fields:
                    if field not in parsed_suggestion:
                        raise ValueError(f"Missing required field: {field}")
                
                parsed_suggestion['confidence'] = parsed_suggestion.get('confidence', 0.7)
                new_text = parsed_suggestion.get('new_text', '')
                
                # Post-process PPTX content to ensure CSS stays in proper location
                if has_pptx_css:
                    new_text = fix_pptx_css_location(new_text, full_content)
                
                parsed_suggestion['new_text'] = new_text
                return jsonify({
                    'success': True,
                    'suggestion': parsed_suggestion,
                    'mode': mode,
                    'raw_response': suggestion_text
                })
                
            except (json.JSONDecodeError, ValueError) as parse_error:
                print(f"Error parsing AI response: {parse_error}")
                
                return jsonify({
                    'success': False,
                    'mode': mode,
                    'raw_response': suggestion_text,
                })
                
        except Exception as llm_error:
            print(f"Error calling LLM: {llm_error}")
            return jsonify({
                'success': False,
                'error': f'LLM error: {str(llm_error)}'
            }), 500
        
    except Exception as e:
        print(f"Error in AI suggestion endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
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



@app.route('/api/process-file', methods=['POST'])
def process_file():
    """Process uploaded files (Excel, PDF, HTML) and return extracted content."""
    try:
        data = request.get_json()
        file_name = data.get('fileName', '')
        file_content = data.get('content', '')  # Base64 encoded for binary files
        file_path = data.get('filePath', '')
        document_id = data.get('document_id', 'default')
        output_json_path_dir = "database/files/" + document_id
        # Determine file type and process accordingly
        file_ext = Path(file_name).suffix.lower()
        output_json_path = ""

        if file_ext in ['.xlsx', '.xls']:
            processed_content = process_excel_file(file_content, file_name)
        elif file_ext == '.pdf':
            output_json_path = output_json_path_dir+"/"+file_name+".json"
            output_image_dir = output_json_path_dir+"/"+file_name+"_images"
            processed_content = process_pdf_file(file_path, json_path=output_json_path, clean_image_dir=output_image_dir)
        elif file_ext in ['.html', '.htm']:
            processed_content = process_html_file(file_content, file_name)
        elif file_ext in ['.pptx', '.ppt']:
            processed_content = process_pptx_file(file_path)
        else:
            # For other file types, return as-is (assuming text)
            processed_content = file_content
        
        return jsonify({'success': True, 'message': 'File processed successfully', 'content': processed_content, 'fileName': file_name, 'filePath': file_path, 'output_file_path': output_json_path})
        
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
    """Delete a document and perform cascading cleanup of related data."""
    try:
        if document_id in documents:
            document_title = documents[document_id]['title']
            session_id = documents[document_id].get('sessionId', '')
            
            # Delete main document
            del documents[document_id]
            save_documents()
            
            # Cascading cleanup - remove related data
            cleanup_summary = []
            
            # Clean up variables for this document
            if document_id in variables_storage:
                variables_count = len(variables_storage[document_id])
                del variables_storage[document_id]
                save_variables(variables_storage)
                cleanup_summary.append(f"{variables_count} variables")
                logger.info(f"📊 Cleaned up {variables_count} variables for document {document_id}")
            
            # Clean up data lake entries for this document
            if document_id in data_lake_storage:
                data_lake_count = len(data_lake_storage[document_id])
                del data_lake_storage[document_id]
                save_data_lake(data_lake_storage)
                cleanup_summary.append(f"{data_lake_count} data lake items")
                logger.info(f"🗂️ Cleaned up {data_lake_count} data lake items for document {document_id}")
            
            # Clean up verifications for this document (using session_id)
            if session_id and session_id in verifications:
                verifications_count = sum(len(user_verifications) for user_verifications in verifications[session_id].values())
                del verifications[session_id]
                save_verifications(verifications)
                cleanup_summary.append(f"{verifications_count} verifications")
                logger.info(f"📋 Cleaned up {verifications_count} verifications for document {document_id} (session {session_id})")
            
            # Clean up tools for this document
            if document_id in tools_storage:
                tools_count = len(tools_storage[document_id])
                del tools_storage[document_id]
                save_tools(tools_storage)
                cleanup_summary.append(f"{tools_count} tools")
                logger.info(f"🔧 Cleaned up {tools_count} tools for document {document_id}")

            # Clean up tasks for this document
            tasks_count = task_manager.delete_tasks_by_document(document_id)
            if tasks_count > 0:
                cleanup_summary.append(f"{tasks_count} tasks")
                logger.info(f"📋 Cleaned up {tasks_count} tasks for document {document_id}")

            # Clean up file from the file system
            file_path = "database/files/" + document_id
            if os.path.exists(file_path):
                shutil.rmtree(file_path)
                logger.info(f"🗂️ Cleaned up file from the file system for document {document_id}")
            
            cleanup_message = f'Document "{document_title}" has been deleted'
            if cleanup_summary:
                cleanup_message += f" along with {', '.join(cleanup_summary)}"
            
            logger.info(f"✅ Complete deletion of document: {document_title} ({document_id})")
            
            return jsonify({
                'success': True,
                'message': cleanup_message,
                'cleanup_summary': cleanup_summary
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Document not found'
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/verify-document', methods=['POST'])
def verify_document():
    """Save document verification."""
    try:
        data = request.get_json()
        
        # Extract verification data
        session_id = data.get('session_id')
        user_id = data.get('user_id')
        user_name = data.get('user_name')
        user_emoji = data.get('user_emoji')
        verified_at = data.get('verified_at')
        document_content = data.get('document_content', '')
        
        if not session_id or not user_id or not user_name:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: session_id, user_id, user_name'
            }), 400
        
        # Create verification record
        verification = {
            'user_id': user_id,
            'user_name': user_name,
            'user_emoji': user_emoji,
            'verified_at': verified_at,
            'document_content_hash': hash(document_content) if document_content else None,
            'content_length': len(document_content) if document_content else 0,
            'saved_at': datetime.now().isoformat()
        }
        
        # Initialize verifications structure for this session if not exists
        if session_id not in verifications:
            verifications[session_id] = {}
        
        # Initialize user's verification list if not exists
        if user_id not in verifications[session_id]:
            verifications[session_id][user_id] = []
        
        # Add verification to the user's list
        verifications[session_id][user_id].append(verification)
        
        # Save to file
        save_verifications(verifications)
        
        logger.info(f"✅ Document verification saved: {user_name} verified document {session_id}")
        
        return jsonify({
            'success': True,
            'message': f'Document verified by {user_name}',
            'verification': verification
        })
        
    except Exception as e:
        logger.error(f"Error saving verification: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/get-verification/<session_id>', methods=['GET'])
def get_verification(session_id):
    """Get verification history for a document."""
    try:
        document_verifications = verifications.get(session_id, {})
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'verifications': document_verifications,
            'count': len(document_verifications)
        })
        
    except Exception as e:
        logger.error(f"Error getting verification for {session_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/data-lake', methods=['GET'])
def get_data_lake():
    """Get data lake items for a specific document."""
    try:
        document_id = request.args.get('documentId')
        window_id = request.args.get('windowId', 'default')
        session_id = request.args.get('session_id', 'default')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Get data lake items for this document
        document_data_lake = data_lake_storage.get(document_id, [])
        
        logger.info(f"🗂️ Returning {len(document_data_lake)} data lake items for document {document_id}")
        
        return jsonify({
            'success': True,
            'dataLake': document_data_lake,
            'documentId': document_id,
            'count': len(document_data_lake)
        })
        
    except Exception as e:
        logger.error(f"Error getting data lake: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/data-lake', methods=['POST'])
def save_data_lake_endpoint():
    """Save data lake items for a specific document."""
    try:
        data = request.get_json()
        
        document_id = data.get('documentId')
        window_id = data.get('windowId', 'default')
        session_id = data.get('session_id', 'default')
        data_lake_items = data.get('dataLake', [])
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId in request'
            }), 400
        
        # Store data lake items for this document
        data_lake_storage[document_id] = data_lake_items
        
        # Persist to file
        save_data_lake(data_lake_storage)
        
        logger.info(f"🗂️ Saved {len(data_lake_items)} data lake items for document {document_id}")
        
        return jsonify({
            'success': True,
            'message': f'Data lake saved for document {document_id}',
            'documentId': document_id,
            'count': len(data_lake_items)
        })
        
    except Exception as e:
        logger.error(f"Error saving data lake: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/variables', methods=['GET'])
def get_variables():
    """Get variables for a specific document."""
    try:
        document_id = request.args.get('documentId')
        window_id = request.args.get('windowId', 'default')
        session_id = request.args.get('session_id', 'default')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Get variables for this document
        document_variables = variables_storage.get(document_id, {})
        
        logger.info(f"📊 Returning {len(document_variables)} variables for document {document_id}")
        
        return jsonify({
            'success': True,
            'variables': document_variables,
            'documentId': document_id,
            'count': len(document_variables)
        })
        
    except Exception as e:
        logger.error(f"Error getting variables: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/variables', methods=['POST'])
def save_variables_endpoint():
    """Save variables for a specific document."""
    try:
        data = request.get_json()
        
        document_id = data.get('documentId')
        window_id = data.get('windowId', 'default')
        session_id = data.get('session_id', 'default')
        variables_data = data.get('variables', {})
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId in request'
            }), 400
        
        # Store variables for this document
        variables_storage[document_id] = variables_data
        
        # Persist to file
        save_variables(variables_storage)
        
        logger.info(f"📊 Saved {len(variables_data)} variables for document {document_id}")
        
        return jsonify({
            'success': True,
            'message': f'Variables saved for document {document_id}',
            'documentId': document_id,
            'count': len(variables_data)
        })
        
    except Exception as e:
        logger.error(f"Error saving variables: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/variables', methods=['DELETE'])
def delete_variables():
    """Delete variables for a specific document."""
    try:
        document_id = request.args.get('documentId')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Remove variables for this document
        if document_id in variables_storage:
            variables_count = len(variables_storage[document_id])
            del variables_storage[document_id]
            
            # Persist changes
            save_variables(variables_storage)
            
            logger.info(f"📊 Deleted {variables_count} variables for document {document_id}")
            
            return jsonify({
                'success': True,
                'message': f'Variables deleted for document {document_id}',
                'documentId': document_id,
                'deleted_count': variables_count
            })
        else:
            return jsonify({
                'success': True,
                'message': f'No variables found for document {document_id}',
                'documentId': document_id,
                'deleted_count': 0
            })
        
    except Exception as e:
        logger.error(f"Error deleting variables for document: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/data-lake', methods=['DELETE'])
def delete_data_lake():
    """Delete data lake entries for a specific document."""
    try:
        document_id = request.args.get('documentId')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Remove data lake entries for this document
        if document_id in data_lake_storage:
            entries_count = len(data_lake_storage[document_id])
            del data_lake_storage[document_id]
            
            # Persist changes
            save_data_lake(data_lake_storage)
            
            logger.info(f"🗂️ Deleted {entries_count} data lake entries for document {document_id}")
            
            return jsonify({
                'success': True,
                'message': f'Data lake entries deleted for document {document_id}',
                'documentId': document_id,
                'deleted_count': entries_count
            })
        else:
            return jsonify({
                'success': True,
                'message': f'No data lake entries found for document {document_id}',
                'documentId': document_id,
                'deleted_count': 0
            })
        
    except Exception as e:
        logger.error(f"Error deleting data lake entries for document: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/get-verification/<session_id>', methods=['DELETE'])
def delete_verification(session_id):
    """Delete verification history for a document (by session_id)."""
    try:
        # Remove verifications for this session
        if session_id in verifications:
            verifications_count = sum(len(user_verifications) for user_verifications in verifications[session_id].values())
            del verifications[session_id]
            
            # Persist changes
            save_verifications(verifications)
            
            logger.info(f"📋 Deleted {verifications_count} verifications for session {session_id}")
            
            return jsonify({
                'success': True,
                'message': f'Verifications deleted for session {session_id}',
                'session_id': session_id,
                'deleted_count': verifications_count
            })
        else:
            return jsonify({
                'success': True,
                'message': f'No verifications found for session {session_id}',
                'session_id': session_id,
                'deleted_count': 0
            })
        
    except Exception as e:
        logger.error(f"Error deleting verifications for session {session_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/suggest-variable', methods=['POST'])
def suggest_variable():
    """Get LLM-powered variable suggestions based on selected text and template context."""
    try:
        data = request.get_json()
        
        # Extract request data
        template_content = data.get('template_content', '')
        selected_text = data.get('selected_text', '')
        existing_variables = data.get('existing_variables', {})
        document_id = data.get('document_id', 'default')
        
        # Validate required fields
        if not selected_text:
            return jsonify({
                'success': False,
                'error': 'Selected text is required'
            }), 400
        
        # Check if LLM client is available
        if client is None:
            return jsonify({
                'success': False,
                'error': 'AI service not available (API key not configured)'
            })
        
        # Create structured prompt for LLM
        existing_vars_text = ""
        if existing_variables:
            existing_vars_text = "\nExisting variables in template:\n"
            for var_name, var_info in existing_variables.items():
                existing_vars_text += f"- {var_name}: {var_info.get('description', 'No description')} ({var_info.get('type', 'unknown')})\n"
        
        prompt = f"""You are an AI assistant helping to create template variables. Based on the selected text and template context, suggest appropriate variable information.

TEMPLATE CONTENT:
{template_content}

SELECTED TEXT: "{selected_text}"
{existing_vars_text}

IMPORTANT: The user selected the entire text "{selected_text}", but they likely want to keep descriptive labels and only replace the actual data values with variables.

Your task:
1. Analyze the selected text to identify what part should become a variable (like names, numbers, amounts, dates, etc.)
2. Identify what parts should remain as static text (like labels, descriptions, prefixes, etc.)
3. Suggest appropriate variable information

Consider:
- The context within the template
- The format and content of the selected text
- Avoid naming conflicts with existing variables
- Use meaningful, business-friendly names
- Detect data types from patterns ($ for currency, % for percentage, etc.)

IMPORTANT: Respond with ONLY a JSON object in this exact format:
{{
    "name": "suggested_variable_name",
    "description": "Clear description of what this variable represents",
    "type": "currency|number|percentage|date|text",
    "format": "format_string_if_applicable",
    "confidence": 0.95,
    "reasoning": "Brief explanation of why these suggestions were made",
    "value_to_replace": "the exact part that should become the variable",
    "static_prefix": "text that should remain before the variable (can be empty)",
    "static_suffix": "text that should remain after the variable (can be empty)"
}}

Requirements:
1. "name" must be valid variable name (letters, numbers, underscores only, start with letter)
2. "description" should be business-friendly and clear
3. "type" must be one of: currency, number, percentage, date, text
4. "format" should be appropriate for the type (can be empty)
5. "confidence" should be between 0.0 and 1.0
6. "value_to_replace" should be the exact substring that will become the variable
7. "static_prefix" + "value_to_replace" + "static_suffix" should equal the original selected text
8. Return ONLY the JSON object, no other text

JSON:"""
        
        try:
            # Call LLM for suggestion
            if hasattr(client, 'chat'):
                # OpenAI client
                response = client.chat.completions.create(
                    model="gpt-4.1-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=400
                )
                suggestion_text = response.choices[0].message.content.strip()
            else:
                # Together client
                response = client.chat.completions.create(
                    model="Qwen/Qwen2.5-Coder-32B-Instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=400
                )
                suggestion_text = response.choices[0].message.content.strip()
            
            print(f"Variable Suggestion Raw Response: {suggestion_text}")
            
            # Parse LLM response
            try:
                import json
                import re
                
                # Clean up the response to extract JSON
                json_match = re.search(r'\{[\s\S]*\}', suggestion_text)
                if json_match:
                    json_str = json_match.group()
                    suggestion = json.loads(json_str)
                    
                    # Validate suggestion structure
                    required_fields = ['name', 'description', 'type', 'value_to_replace']
                    if all(field in suggestion for field in required_fields):
                        # Ensure name is valid
                        import re
                        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', suggestion['name']):
                            suggestion['name'] = re.sub(r'[^a-zA-Z0-9_]', '_', suggestion['name'])
                            if not suggestion['name'][0].isalpha() and suggestion['name'][0] != '_':
                                suggestion['name'] = 'var_' + suggestion['name']
                        
                        # Ensure type is valid
                        valid_types = ['currency', 'number', 'percentage', 'date', 'text']
                        if suggestion['type'] not in valid_types:
                            suggestion['type'] = 'text'
                        
                        # Set default values for optional fields
                        suggestion.setdefault('format', '')
                        suggestion.setdefault('confidence', 0.8)
                        suggestion.setdefault('reasoning', 'AI-generated suggestion')
                        suggestion.setdefault('static_prefix', '')
                        suggestion.setdefault('static_suffix', '')
                        
                        # Validate that the parts add up to the original text
                        reconstructed = suggestion['static_prefix'] + suggestion['value_to_replace'] + suggestion['static_suffix']
                        
                        # Normalize whitespace for comparison (handle non-breaking spaces, etc.)
                        def normalize_whitespace(text):
                            return re.sub(r'\s+', ' ', text.replace('\xa0', ' ').replace('\u00a0', ' '))
                        
                        original_normalized = normalize_whitespace(selected_text)
                        reconstructed_normalized = normalize_whitespace(reconstructed)
                        
                        if reconstructed_normalized != original_normalized:
                            print("Warning: Reconstructed text doesn't match original after normalization.")
                            print(f"  Original: '{selected_text}' (normalized: '{original_normalized}')")
                            print(f"  Reconstructed: '{reconstructed}' (normalized: '{reconstructed_normalized}')")
                            # Fallback: treat entire text as variable
                            suggestion['value_to_replace'] = selected_text
                            suggestion['static_prefix'] = ''
                            suggestion['static_suffix'] = ''
                        else:
                            print(f"✓ Text reconstruction successful: '{original_normalized}'")
                        
                        logger.info(f"Generated variable suggestion for '{selected_text}': {suggestion['name']} (replacing '{suggestion['value_to_replace']}')")
                        
                        return jsonify({
                            'success': True,
                            'suggestion': suggestion,
                            'analysis': {
                                'selected_text_length': len(selected_text),
                                'template_length': len(template_content),
                                'existing_variables_count': len(existing_variables),
                                'document_id': document_id
                            }
                        })
                    else:
                        raise ValueError("Missing required fields in LLM response")
                else:
                    raise ValueError("No valid JSON found in LLM response")
                    
            except (json.JSONDecodeError, ValueError) as parse_error:
                print(f"Error parsing LLM response: {parse_error}")
                print(f"Raw response: {suggestion_text}")
                
                return jsonify({
                    'success': False,
                    'warning': 'Used fallback suggestion due to LLM parsing error'
                })
                
        except Exception as llm_error:
            print(f"Error calling LLM: {llm_error}")

            return jsonify({
                'success': True,
                'suggestion': {},
                'warning': 'Used fallback suggestion due to LLM error'
            })
        
    except Exception as e:
        logger.error(f"Error in suggest_variable: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/suggest-operator-config', methods=['POST'])
def suggest_operator_config():
    """Get LLM-powered operator configuration suggestions based on tool code analysis."""
    try:
        data = request.get_json()
        
        # Extract request data
        tool_name = data.get('tool_name', '')
        tool_description = data.get('tool_description', '')
        tool_code = data.get('tool_code', '')
        document_id = data.get('document_id', 'default')
        
        # Validate required fields
        if not tool_code:
            return jsonify({
                'success': False,
                'error': 'Tool code is required'
            }), 400
            
        if not tool_name:
            return jsonify({
                'success': False,
                'error': 'Tool name is required'
            }), 400
        
        # Check if LLM client is available
        if client is None:
            return jsonify({
                'success': False,
                'error': 'AI service not available (API key not configured)'
            })
        
        # Create structured prompt for LLM
        prompt = f"""Analyze this Python tool code and suggest operator configuration:

Tool Name: {tool_name}
Tool Description: {tool_description or 'No description provided'}

Code:
```python
{tool_code}
```

Please analyze the code and provide suggestions in JSON format with the following structure:
{{
  "operatorName": "suggested name for this operator instance (based on tool name)",
  "parameters": [
    {{
      "name": "parameter_name",
      "type": "literal|dataset", 
      "description": "what this parameter does",
      "defaultValue": "suggested default value if any, or empty string"
    }}
  ],
  "outputs": [
    {{
      "config": "output path (e.g., 'output', 'output.data', 'output.result')",
      "variable": "suggested_variable_name",
      "description": "what this output represents"
    }}
  ]
}}

Guidelines:
1. For operatorName: Create a descriptive name based on the tool's purpose
2. For parameters: Look for function parameters, configurable values, input requirements
   - Use "dataset" type for data inputs (DataFrames, files, etc.)
   - Use "literal" type for configuration values (numbers, strings, booleans)
3. For outputs: **CAREFULLY ANALYZE RETURN STATEMENTS AND OUTPUT STRUCTURE**
   - Look at all return statements in the code
   - If the function returns a dictionary, suggest one output for each dictionary key
   - Use config paths like "output.key_name" for dictionary fields
   - If the function returns a simple value, use "output" as the config
   - If the function returns a list/array, consider "output" or "output.items" based on context
   - Create meaningful variable names that reflect what each output field represents
   - Example: if code returns {{"summary": df.describe(), "correlation": df.corr()}}, suggest:
     * config: "output.summary", variable: "data_summary" 
     * config: "output.correlation", variable: "correlation_matrix"
4. Only include parameters and outputs that make sense based on the code analysis
5. If you cannot determine good suggestions for any section, use empty arrays

**PAY SPECIAL ATTENTION TO:**
- What the function actually returns (dict, list, single value, object)
- Dictionary keys and their meanings
- Variable names used in return statements
- Data types being returned (DataFrames, numbers, strings, etc.)

IMPORTANT: Respond with ONLY a JSON object in the exact format above, no additional text or explanation.

JSON:"""
        
        try:
            # Call LLM for suggestion
            if hasattr(client, 'chat'):
                # OpenAI client
                response = client.chat.completions.create(
                    model="gpt-4.1-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=800
                )
                suggestion_text = response.choices[0].message.content.strip()
            else:
                # Together client
                response = client.chat.completions.create(
                    model="Qwen/Qwen2.5-Coder-32B-Instruct",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=800
                )
                suggestion_text = response.choices[0].message.content.strip()
            
            print(f"Operator Config Suggestion Raw Response: {suggestion_text}")
            
            # Parse LLM response with multiple fallback strategies
            try:
                import json
                import re
                
                suggestions = None
                
                # Try multiple approaches to extract JSON
                try:
                    # First, try to parse the entire response as JSON
                    suggestions = json.loads(suggestion_text)
                except json.JSONDecodeError:
                    # If that fails, try to extract JSON block
                    json_match = re.search(r'\{[\s\S]*\}', suggestion_text)
                    if json_match:
                        try:
                            suggestions = json.loads(json_match.group())
                        except json.JSONDecodeError:
                            # If JSON parsing still fails, try to find the largest JSON-like structure
                            json_matches = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', suggestion_text)
                            if json_matches:
                                for match in json_matches:
                                    try:
                                        suggestions = json.loads(match)
                                        break  # Use the first valid JSON we find
                                    except json.JSONDecodeError:
                                        continue
                
                if suggestions and isinstance(suggestions, dict):
                    # Validate and clean the suggestion structure
                    validated_suggestion = {
                        'operatorName': str(suggestions.get('operatorName', '')).strip(),
                        'parameters': [],
                        'outputs': []
                    }
                    
                    # Validate parameters
                    if 'parameters' in suggestions and isinstance(suggestions['parameters'], list):
                        for param in suggestions['parameters']:
                            if isinstance(param, dict) and param.get('name'):
                                # Clean parameter name to be a valid identifier
                                param_name = re.sub(r'[^a-zA-Z0-9_]', '_', str(param['name']))
                                if param_name and (param_name[0].isalpha() or param_name[0] == '_'):
                                    validated_param = {
                                        'name': param_name,
                                        'type': param.get('type', 'literal') if param.get('type') in ['literal', 'dataset'] else 'literal',
                                        'description': str(param.get('description', '')).strip(),
                                        'defaultValue': str(param.get('defaultValue', '')).strip()
                                    }
                                    validated_suggestion['parameters'].append(validated_param)
                    
                    # Validate outputs
                    if 'outputs' in suggestions and isinstance(suggestions['outputs'], list):
                        for output in suggestions['outputs']:
                            if isinstance(output, dict) and output.get('variable'):
                                # Clean variable name to be a valid identifier
                                var_name = re.sub(r'[^a-zA-Z0-9_]', '_', str(output['variable']))
                                if var_name and (var_name[0].isalpha() or var_name[0] == '_'):
                                    validated_output = {
                                        'config': str(output.get('config', 'output')).strip(),
                                        'variable': var_name,
                                        'description': str(output.get('description', '')).strip()
                                    }
                                    validated_suggestion['outputs'].append(validated_output)
                    
                    logger.info(f"Generated operator config suggestion for tool '{tool_name}': {validated_suggestion}")
                    
                    return jsonify({
                        'success': True,
                        'suggestion': validated_suggestion,
                        'analysis': {
                            'tool_name': tool_name,
                            'code_length': len(tool_code),
                            'parameters_count': len(validated_suggestion['parameters']),
                            'outputs_count': len(validated_suggestion['outputs']),
                            'document_id': document_id
                        }
                    })
                else:
                    raise ValueError("No valid JSON structure found in LLM response")
                    
            except Exception as parse_error:
                print(f"Error parsing LLM response: {parse_error}")
                print(f"Raw response: {suggestion_text}")
                
                # Provide fallback suggestion based on tool name
                fallback_suggestion = {
                    'operatorName': f"{tool_name} Instance",
                    'parameters': [],
                    'outputs': [
                        {
                            'config': 'output',
                            'variable': f"{re.sub(r'[^a-zA-Z0-9_]', '_', tool_name.lower())}_result",
                            'description': f"Output from {tool_name}"
                        }
                    ]
                }
                
                return jsonify({
                    'success': True,
                    'suggestion': fallback_suggestion,
                    'warning': 'Used fallback suggestion due to LLM parsing error',
                    'analysis': {
                        'tool_name': tool_name,
                        'code_length': len(tool_code),
                        'parameters_count': 0,
                        'outputs_count': 1,
                        'document_id': document_id,
                        'fallback_used': True
                    }
                })
                
        except Exception as llm_error:
            print(f"Error calling LLM: {llm_error}")
            
            # Provide fallback suggestion
            fallback_suggestion = {
                'operatorName': f"{tool_name} Instance",
                'parameters': [],
                'outputs': [
                    {
                        'config': 'output',
                        'variable': f"{re.sub(r'[^a-zA-Z0-9_]', '_', tool_name.lower())}_result",
                        'description': f"Output from {tool_name}"
                    }
                ]
            }

            return jsonify({
                'success': True,
                'suggestion': fallback_suggestion,
                'warning': 'Used fallback suggestion due to LLM error',
                'analysis': {
                    'tool_name': tool_name,
                    'code_length': len(tool_code),
                    'parameters_count': 0,
                    'outputs_count': 1,
                    'document_id': document_id,
                    'fallback_used': True
                }
            })
        
    except Exception as e:
        logger.error(f"Error in suggest_operator_config: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Tools API endpoints
@app.route('/api/tools', methods=['GET'])
def get_tools():
    """Get tools for a specific document"""
    try:
        document_id = request.args.get('documentId')
        window_id = request.args.get('windowId', 'default')
        session_id = request.args.get('session_id', 'default')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Get tools for this document
        document_tools = tools_storage.get(document_id, [])
        
        logger.info(f"🔧 Returning {len(document_tools)} tools for document {document_id}")
        
        return jsonify({
            'success': True,
            'tools': document_tools,
            'documentId': document_id,
            'count': len(document_tools)
        })
    except Exception as e:
        logger.error(f"❌ Error getting tools: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tools', methods=['POST'])
def save_tools_endpoint():
    """Save tools for a specific document"""
    try:
        data = request.get_json()
        
        document_id = data.get('documentId')
        window_id = data.get('windowId', 'default')
        session_id = data.get('session_id', 'default')
        tools = data.get('tools', [])
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId in request'
            }), 400
        
        # Validate tools structure
        if not isinstance(tools, list):
            return jsonify({
                'success': False,
                'error': 'Tools must be an array'
            }), 400
        
        # Validate each tool has required fields
        for tool in tools:
            if not isinstance(tool, dict) or 'id' not in tool or 'name' not in tool:
                return jsonify({
                    'success': False,
                    'error': 'Each tool must have id and name fields'
                }), 400
        
        # Store tools for this document
        tools_storage[document_id] = tools
        
        # Persist to file
        save_tools(tools_storage)
        
        logger.info(f"🔧 Saved {len(tools)} tools for document {document_id}")
        
        return jsonify({
            'success': True,
            'message': f'Tools saved for document {document_id}',
            'documentId': document_id,
            'count': len(tools)
        })
        
    except Exception as e:
        logger.error(f"❌ Error saving tools: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tools/<tool_id>', methods=['DELETE'])
def delete_tool(tool_id):
    """Delete a specific tool from a document"""
    try:
        document_id = request.args.get('documentId')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Get tools for this document
        document_tools = tools_storage.get(document_id, [])
        
        # Find and remove the tool
        original_count = len(document_tools)
        updated_tools = [tool for tool in document_tools if tool.get('id') != tool_id]
        
        if len(updated_tools) == original_count:
            return jsonify({
                'success': False,
                'error': 'Tool not found'
            }), 404
        
        # Update storage for this document
        tools_storage[document_id] = updated_tools
        
        # Save updated tools
        save_tools(tools_storage)
        
        logger.info(f"🔧 Deleted tool {tool_id} from document {document_id}")
        
        return jsonify({
            'success': True,
            'message': f'Successfully deleted tool {tool_id} from document {document_id}',
            'documentId': document_id
        })
        
    except Exception as e:
        logger.error(f"❌ Error deleting tool: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tools', methods=['DELETE'])
def delete_tools():
    """Delete all tools for a specific document."""
    try:
        document_id = request.args.get('documentId')
        
        if not document_id:
            return jsonify({
                'success': False,
                'error': 'Missing documentId parameter'
            }), 400
        
        # Remove tools for this document
        if document_id in tools_storage:
            tools_count = len(tools_storage[document_id])
            del tools_storage[document_id]
            
            # Persist changes
            save_tools(tools_storage)
            
            logger.info(f"🔧 Deleted {tools_count} tools for document {document_id}")
            
            return jsonify({
                'success': True,
                'message': f'Tools deleted for document {document_id}',
                'documentId': document_id,
                'deleted_count': tools_count
            })
        else:
            return jsonify({
                'success': True,
                'message': f'No tools found for document {document_id}',
                'documentId': document_id,
                'deleted_count': 0
            })
        
    except Exception as e:
        logger.error(f"Error deleting tools for document: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generate-variable-code', methods=['POST'])
def generate_variable_code():
    """Generate code for a variable using LLM"""
    try:
        data = request.get_json()
        
        variable_name = data.get('variable_name', '')
        variable_type = data.get('variable_type', 'text')
        variable_description = data.get('variable_description', '')
        data_source = data.get('data_source', '')
        document_id = data.get('document_id', 'default')
        
        if not variable_name:
            return jsonify({
                'success': False,
                'error': 'Variable name is required'
            }), 400
        
        if not data_source:
            return jsonify({
                'success': False,
                'error': 'Data source is required'
            }), 400
        
        # Check if LLM client is available
        if client is None:
            return jsonify({
                'success': False,
                'error': 'AI service not available (API key not configured)'
            })
        
        # Get data source information from data lake
        data_lake_data = data_lake_storage.get(document_id, [])
        selected_data_source = None
        
        for item in data_lake_data:
            if item.get('filePath') == data_source:
                selected_data_source = item
                break
        
        if not selected_data_source:
            return jsonify({
                'success': False,
                'error': f'Data source "{data_source}" not found'
            }), 404
        
        # Create LLM prompt for code generation
        prompt = f"""
Generate Python code to extract data for a variable from a data source.

Variable Details:
- Name: {variable_name}
- Type: {variable_type}
- Description: {variable_description}

Data Source Details:
- Name: {selected_data_source.get('name', 'Unknown')}
- Type: {selected_data_source.get('type', 'unknown')}
- Reference: ${data_source}

Requirements:
1. Generate Python code that processes the data source to extract the value for this variable
2. The code should return a single value of the appropriate type ({variable_type})
3. Use appropriate data processing libraries (pandas, numpy, etc.)
4. Handle common data formats (CSV, Excel, JSON, etc.)
5. Include error handling
6. The data source will be available as a variable named 'data_source'
7. Please write functions, and call the function at the end. You can assume you get the parameters from parameters dict like parameters['data_source'].
7. Return the final result in a variable named 'output'

Example structure:
```python
import pandas as pd
import numpy as np

# Process the data source
# data_source contains the loaded data
function extract_metrics(data_source)
    try:
        # Your processing code here
        result = processed_value
    except Exception as e:
        result = f"Error: {{e}}"
    return result

output = extract_metrics(parameters['data_source'])
```

Generate ONLY the Python code, no explanations or markdown formatting.
"""
        
        # Call LLM
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful Python code generator. Generate clean, efficient Python code based on the requirements."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=5000
        )
        
        generated_code = response.choices[0].message.content.strip()
        
        # Clean up code (remove markdown formatting if present)
        if generated_code.startswith('```python'):
            generated_code = generated_code[9:]
        elif generated_code.startswith('```'):
            generated_code = generated_code[3:]
        
        if generated_code.endswith('```'):
            generated_code = generated_code[:-3]
        
        generated_code = generated_code.strip()
        
        logger.info(f"✅ Generated code for variable {variable_name}")
        
        return jsonify({
            'success': True,
            'code': generated_code,
            'variable_name': variable_name,
            'data_source': data_source
        })
        
    except Exception as e:
        logger.error(f"❌ Error generating variable code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/execute-code', methods=['POST'])
def execute_code_endpoint():
    """Execute generated code in a safe environment"""
    try:
        data = request.get_json()
        code = data.get('code', '')
        parameters = data.get('parameters', {})
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Code is required'
            }), 400
        
        result = execute_code_locally(code, parameters)
        print("================================================")
        print(result)
        print("================================================")
        if result.get('status') and result.get('status') == "success": 
            return jsonify({
                'success': True,
                'output': result.get('result').get('output')
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            })

    except Exception as e:
        logger.error(f"❌ Error generating variable code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Coding Agent Integration
@app.route('/api/agents/coding', methods=['POST'])
def execute_coding_agent():
    """Execute coding agent with user prompt and context"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        context = data.get('context', {})
        agent_type = data.get('agent_type', 'coding_agent')
        
        if not prompt:
            return jsonify({
                "success": False, 
                "error": "Prompt is required"
            })
        
        logger.info(f"🤖 Executing {agent_type} with prompt: {prompt[:100]}...")
        
        # Import and call the coding agent
        try:
            import sys
            import os
            from pathlib import Path
            
            # Add the coding agent directory to Python path
            coding_agent_dir = Path(__file__).parent / 'agents' / 'code_agent'
            sys.path.insert(0, str(coding_agent_dir))
            
            from coding_agent import run_coding_agent_for_chat
            
            # Build enhanced prompt with context
            enhanced_prompt = build_enhanced_prompt(prompt, context)
            
            # Execute the agent
            import asyncio
            if hasattr(asyncio, 'run'):
                # Python 3.7+
                result = asyncio.run(run_coding_agent_for_chat(enhanced_prompt, context, agent_type))
            else:
                # Fallback for older Python versions
                loop = asyncio.get_event_loop()
                result = loop.run_until_complete(run_coding_agent_for_chat(enhanced_prompt, context, agent_type))
            
            return jsonify(result)
            
        except ImportError as e:
            logger.error(f"❌ Failed to import coding agent: {e}")
            return jsonify({
                "success": False,
                "error": f"Coding agent not available: {str(e)}"
            })
            
    except Exception as e:
        logger.error(f"❌ Error executing coding agent: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        })


def build_enhanced_prompt(user_prompt, context):
    """Build an enhanced prompt with context information"""
    enhanced_parts = [user_prompt]
    
    if context:
        if context.get('current_source_code'):
            enhanced_parts.append(f"\nCurrent source code in editor:\n```python\n{context['current_source_code']}\n```")
        
        if context.get('variables'):
            enhanced_parts.append(f"\nAvailable variables: {context['variables']}")
        
        if context.get('available_datasets'):
            datasets = ', '.join(context['available_datasets'])
            enhanced_parts.append(f"\nAvailable datasets: {datasets}")
        
        if context.get('document_type'):
            enhanced_parts.append(f"\nDocument type: {context['document_type']}")
    
    return '\n'.join(enhanced_parts)


# File serving endpoint for PDF images and other files
@app.route('/api/serve-file/<path:file_path>')
def serve_file(file_path):
    """Serve files from the database directory (for PDF images, etc.)"""
    try:
        # Security check: ensure the path is within the database directory
        safe_path = os.path.normpath(file_path)
        if '..' in safe_path or safe_path.startswith('/'):
            logger.warning(f"🚫 Blocked potentially unsafe file path: {file_path}")
            return jsonify({'error': 'Invalid file path'}), 400
        
        # Construct full file path - note: file_path should start with 'database/'
        full_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), safe_path)
        
        # Check if file exists
        if not os.path.exists(full_path):
            logger.warning(f"📄 File not found: {full_path}")
            return jsonify({'error': 'File not found'}), 404
        
        # Check if it's actually a file (not a directory)
        if not os.path.isfile(full_path):
            logger.warning(f"🚫 Not a file: {full_path}")
            return jsonify({'error': 'Not a file'}), 400
        
        logger.info(f"📎 Serving file: {safe_path}")
        return send_file(full_path)
        
    except Exception as e:
        logger.error(f"❌ Error serving file {file_path}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# ============================================================================
# TASK MANAGEMENT API ENDPOINTS
# ============================================================================

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get all tasks with optional filtering"""
    try:
        document_id = request.args.get('document_id')
        assignee = request.args.get('assignee')
        status = request.args.get('status')
        search = request.args.get('search')
        
        if document_id:
            tasks = task_manager.get_tasks_by_document(document_id)
        elif assignee:
            tasks = task_manager.get_tasks_by_assignee(assignee)
        elif status:
            tasks = task_manager.get_tasks_by_status(status)
        elif search:
            tasks = task_manager.search_tasks(search, document_id)
        else:
            tasks = list(task_manager.tasks.values())
        
        # Convert tasks to dictionaries for JSON serialization
        tasks_data = [task.to_dict() for task in tasks]
        
        return jsonify({
            'success': True,
            'tasks': tasks_data,
            'count': len(tasks_data)
        })
        
    except Exception as e:
        logger.error(f"❌ Error getting tasks: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks', methods=['POST'])
def create_task():
    """Create a new task"""
    try:
        data = request.get_json()
        
        # Required fields
        document_id = data.get('document_id')
        title = data.get('title')
        description = data.get('description')
        created_by = data.get('created_by', 'default_user')
        
        if not all([document_id, title, description]):
            return jsonify({
                'success': False,
                'error': 'document_id, title, and description are required'
            }), 400
        
        # Optional fields
        priority = data.get('priority', 'medium')
        assignee = data.get('assignee')
        tags = data.get('tags', [])
        due_date = data.get('due_date')
        
        task = task_manager.create_task(
            document_id=document_id,
            title=title,
            description=description,
            created_by=created_by,
            priority=priority,
            assignee=assignee,
            tags=tags,
            due_date=due_date
        )
        
        return jsonify({
            'success': True,
            'task': task.to_dict()
        }), 201
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"❌ Error creating task: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>', methods=['GET'])
def get_task(task_id):
    """Get a specific task by ID"""
    try:
        task = task_manager.get_task(task_id)
        
        if not task:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'task': task.to_dict()
        })
        
    except Exception as e:
        logger.error(f"❌ Error getting task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    """Update a task"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        task = task_manager.update_task(task_id, data)
        
        if not task:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'task': task.to_dict()
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"❌ Error updating task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    try:
        success = task_manager.delete_task(task_id)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'message': 'Task deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"❌ Error deleting task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>/subtasks', methods=['POST'])
def add_subtask(task_id):
    """Add a subtask to a task"""
    try:
        data = request.get_json()
        title = data.get('title')
        
        if not title:
            return jsonify({
                'success': False,
                'error': 'Subtask title is required'
            }), 400
        
        subtask = task_manager.add_subtask(task_id, title)
        
        if not subtask:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'subtask': {
                'id': subtask.id,
                'title': subtask.title,
                'completed': subtask.completed,
                'created_at': subtask.created_at
            }
        }), 201
        
    except Exception as e:
        logger.error(f"❌ Error adding subtask to task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>/subtasks/<subtask_id>', methods=['PUT'])
def update_subtask(task_id, subtask_id):
    """Update a subtask"""
    try:
        data = request.get_json()
        completed = data.get('completed')
        
        if completed is None:
            return jsonify({
                'success': False,
                'error': 'completed status is required'
            }), 400
        
        subtask = task_manager.update_subtask(task_id, subtask_id, completed)
        
        if not subtask:
            return jsonify({
                'success': False,
                'error': 'Task or subtask not found'
            }), 404
        
        return jsonify({
            'success': True,
            'subtask': {
                'id': subtask.id,
                'title': subtask.title,
                'completed': subtask.completed,
                'created_at': subtask.created_at
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Error updating subtask {subtask_id} in task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>/subtasks/<subtask_id>', methods=['DELETE'])
def delete_subtask(task_id, subtask_id):
    """Delete a subtask"""
    try:
        success = task_manager.delete_subtask(task_id, subtask_id)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Task or subtask not found'
            }), 404
        
        return jsonify({
            'success': True,
            'message': 'Subtask deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"❌ Error deleting subtask {subtask_id} from task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>/comments', methods=['POST'])
def add_task_comment(task_id):
    """Add a comment to a task"""
    try:
        data = request.get_json()
        content = data.get('content')
        author = data.get('author', 'default_user')
        
        if not content:
            return jsonify({
                'success': False,
                'error': 'Comment content is required'
            }), 400
        
        comment = task_manager.add_comment(task_id, content, author)
        
        if not comment:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'comment': {
                'id': comment.id,
                'content': comment.content,
                'author': comment.author,
                'created_at': comment.created_at,
                'attachments': comment.attachments or []
            }
        }), 201
        
    except Exception as e:
        logger.error(f"❌ Error adding comment to task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/<task_id>/comments/<comment_id>', methods=['DELETE'])
def delete_task_comment(task_id, comment_id):
    """Delete a comment from a task"""
    try:
        success = task_manager.delete_comment(task_id, comment_id)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Task or comment not found'
            }), 404
        
        return jsonify({
            'success': True,
            'message': 'Comment deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"❌ Error deleting comment {comment_id} from task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/search', methods=['POST'])
def search_tasks():
    """Search tasks by query"""
    try:
        data = request.get_json()
        query = data.get('query', '')
        document_id = data.get('document_id')
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Search query is required'
            }), 400
        
        tasks = task_manager.search_tasks(query, document_id)
        tasks_data = [task.to_dict() for task in tasks]
        
        return jsonify({
            'success': True,
            'tasks': tasks_data,
            'count': len(tasks_data),
            'query': query
        })
        
    except Exception as e:
        logger.error(f"❌ Error searching tasks: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tasks/statistics', methods=['GET'])
def get_task_statistics():
    """Get task statistics"""
    try:
        document_id = request.args.get('document_id')
        
        stats = task_manager.get_task_statistics(document_id)
        
        return jsonify({
            'success': True,
            'statistics': stats
        })
        
    except Exception as e:
        logger.error(f"❌ Error getting task statistics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =============================================================================
# MCP Service Integration - REST API Endpoints
# =============================================================================

@app.route('/api/mcp/status', methods=['GET'])
def get_mcp_status():
    """Get MCP service status and available servers"""
    try:
        from simple_mcp_service import get_mcp_status, is_mcp_available
        
        return jsonify({
            'success': True,
            'available': is_mcp_available(),
            'servers': get_mcp_status()
        })
    except Exception as e:
        logger.error(f"❌ Error getting MCP status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/mcp/tools', methods=['GET'])
def get_mcp_tools():
    """Get all available MCP tools"""
    try:
        from simple_mcp_service import is_mcp_ready, initialize_mcp
        
        # Use the simple service - initialize if needed
        if not is_mcp_ready():
            logger.info("🔄 MCP not ready, initializing...")
            # Initialize synchronously in a new event loop
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(initialize_mcp())
            finally:
                loop.close()
        
        # Get tools from service (no async needed in sync context)
        from simple_mcp_service import get_mcp_service
        tools = get_mcp_service().all_tools
        
        # Convert tools to dict format for JSON response
        tools_data = [tool.to_dict() for tool in tools]
        
        return jsonify({
            'success': True,
            'tools': tools_data,
            'count': len(tools_data)
        })
    
    except Exception as e:
        logger.error(f"❌ Error getting MCP tools: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/mcp/execute', methods=['POST'])
def execute_mcp_tool_endpoint():
    """Execute an MCP tool (simple approach like test_mcp.py)"""
    try:
        from simple_mcp_service import execute_mcp_tool
        import asyncio
        
        data = request.get_json()
        tool_name = data.get('tool_name')
        arguments = data.get('arguments', {})
        server_name = data.get('server_name')  # Optional
        
        if not tool_name:
            return jsonify({
                'success': False,
                'error': 'tool_name is required'
            }), 400
        
        async def run_tool():
            return await execute_mcp_tool(tool_name, arguments, server_name)
        
        # Execute the tool (simple approach like test_mcp.py)
        logger.info(f"🔧 Executing MCP tool: {tool_name}")
        
        # Simple asyncio.run approach like test_mcp.py
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_tool())
            logger.info(f"✅ MCP tool '{tool_name}' executed successfully")
            
            return jsonify({
                'success': True,
                'result': result,
                'tool_name': tool_name
            })
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"❌ Error executing MCP tool '{tool_name}': {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/mcp/servers/<server_name>/restart', methods=['POST'])
def restart_mcp_server(server_name):
    """Restart a specific MCP server"""
    try:
        import asyncio
        
        async def restart():
            # Simple service doesn't support restart - we'll need to reinitialize
            logger.warning("Server restart not supported in simple service, reinitializing instead")
            return await initialize_mcp()
        
        if hasattr(asyncio, 'run'):
            success = asyncio.run(restart())
        else:
            loop = asyncio.get_event_loop()
            success = loop.run_until_complete(restart())
        
        if success:
            logger.info(f"✅ MCP server '{server_name}' restarted successfully")
            return jsonify({
                'success': True,
                'message': f"Server '{server_name}' restarted successfully"
            })
        else:
            return jsonify({
                'success': False,
                'error': f"Failed to restart server '{server_name}'"
            }), 500
    
    except Exception as e:
        logger.error(f"❌ Error restarting MCP server '{server_name}': {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/mcp/initialize', methods=['POST'])
def initialize_mcp_endpoint():
    """Initialize MCP service"""
    try:
        from simple_mcp_service import initialize_mcp
        
        # Use async initialization in a new event loop
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            success = loop.run_until_complete(initialize_mcp())
        except Exception as e:
            logger.error(f"Error during MCP initialization: {e}")
            success = False
        finally:
            loop.close()
        
        if success:
            logger.info("✅ MCP service initialized via API")
            return jsonify({
                'success': True,
                'message': 'MCP service initialized successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to initialize MCP service'
            }), 500
    
    except Exception as e:
        logger.error(f"❌ Error initializing MCP service: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/mcp/chat-status', methods=['GET'])
def get_chat_mcp_status():
    """Get MCP status from chat manager"""
    try:
        if chat_manager:
            status = chat_manager.get_mcp_status()
            return jsonify({
                'success': True,
                'chat_mcp_status': status
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Chat manager not available'
            }), 500
    
    except Exception as e:
        logger.error(f"❌ Error getting chat MCP status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
      
      
if __name__ == '__main__':
    print("Starting Python backend server...")
    app.run(host='127.0.0.1', port=5000, debug=True) 