from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import os.path
import pickle
import time
import openai

# If modifying these scopes, delete the file token.pickle.
SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
]

CREDENTIALS_FILE = '/Users/chjun/Documents/GitHub/client_secret_365068632744-qjp8d3j5snp7sv3qrphtvqb8bibacp3v.apps.googleusercontent.com.json'

DOCUMENT_ID = '1BdqU3UWkyFUVb94PDm5Lg04ukuJ5CCPho70YI41e6Ew'

# OpenAI API key - replace with your actual key
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# Configure OpenAI
openai.api_key = OPENAI_API_KEY

def get_credentials():
    """Gets valid user credentials from storage.
    
    Returns:
        Credentials, the obtained credential.
    """
    creds = None
    # The file token.pickle stores the user's access and refresh tokens
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, SCOPES)
            # Explicitly set the redirect URI
            flow.redirect_uri = 'http://localhost:8080'
            creds = flow.run_local_server(port=8080)
        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
    
    return creds

def read_document(document_id):
    """Reads the content of a Google Doc.
    
    Args:
        document_id: The ID of the document to read.
    
    Returns:
        The document content.
    """
    creds = get_credentials()
    service = build('docs', 'v1', credentials=creds)
    
    # Retrieve the document
    document = service.documents().get(documentId=document_id).execute()
    return document

def update_document(document_id, new_content):
    """Updates the content of a Google Doc.
    
    Args:
        document_id: The ID of the document to update.
        new_content: The new content to write to the document.
    """
    creds = get_credentials()
    service = build('docs', 'v1', credentials=creds)
    
    # First, get the document to find its end index
    document = service.documents().get(documentId=document_id).execute()
    
    # Create the request to update the document
    requests = []
    
    # Only delete content if the document is not empty
    if len(document['body']['content']) > 1:  # Document has content beyond the initial section break
        end_index = document['body']['content'][-1]['endIndex'] - 1
        if end_index > 1:  # Only delete if there's actual content to delete
            requests.append({
                'deleteContentRange': {
                    'range': {
                        'startIndex': 1,
                        'endIndex': end_index
                    }
                }
            })
    
    # Always insert the new content
    requests.append({
        'insertText': {
            'location': {
                'index': 1
            },
            'text': new_content
        }
    })
    
    # Execute the request
    result = service.documents().batchUpdate(
        documentId=document_id,
        body={'requests': requests}
    ).execute()
    
    return result

def get_document_text(document):
    """Extracts plain text from a Google Doc document object.
    
    Args:
        document: The document object returned by the API.
    
    Returns:
        str: The plain text content of the document.
    """
    text = ""
    for content in document.get('body', {}).get('content', []):
        if 'paragraph' in content:
            for element in content.get('paragraph', {}).get('elements', []):
                if 'textRun' in element:
                    text += element.get('textRun', {}).get('content', '')
    return text.strip()

def get_document_comments(document_id):
    """Gets all comments from a Google Doc.
    
    Args:
        document_id: The ID of the document.
    
    Returns:
        A list of comment objects.
    """
    creds = get_credentials()
    drive_service = build('drive', 'v3', credentials=creds)
    
    # List all comments in the document
    comments = []
    page_token = None
    
    while True:
        response = drive_service.comments().list(
            fileId=document_id,
            fields="comments(id,content,createdTime,resolved),nextPageToken",
            includeDeleted=False,
            pageToken=page_token
        ).execute()
        
        comments.extend(response.get('comments', []))
        
        page_token = response.get('nextPageToken')
        if not page_token:
            break
    
    return comments

def ask_chatgpt_for_update(document_text, comment_text):
    """Ask ChatGPT to update the document based on the comment.
    
    Args:
        document_text: The current document text.
        comment_text: The comment requesting changes.
    
    Returns:
        str: The updated document text.
    """
    prompt = f"""
You are an AI assistant helping to update a Google Document based on a comment.

Here's the current document content:
---
{document_text}
---

A user has left the following comment requesting changes:
---
{comment_text}
---

Please provide an updated version of the document that addresses this comment.
Return ONLY the updated document text without any explanations or additional comments.
"""

    try:
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return None

def create_direct_update(document_id, original_text, updated_text):
    """Update the document directly with new content.
    
    Args:
        document_id: The ID of the document.
        original_text: The original text to be replaced.
        updated_text: The text to replace with.
    
    Returns:
        The result of the API call.
    """
    creds = get_credentials()
    service = build('docs', 'v1', credentials=creds)
    
    # Use a simpler approach - just replace the entire document content
    try:
        # First, get the document
        document = service.documents().get(documentId=document_id).execute()
        
        # Get the end index of the document content
        content_end_index = 1  # Start after initial section break
        if document.get('body', {}).get('content', []):
            last_content = document['body']['content'][-1]
            if 'endIndex' in last_content:
                content_end_index = last_content['endIndex']
        
        # Create a request to clear the document and add new content
        requests = []
        
        # Only delete if there's actual content
        if content_end_index > 1:
            requests.append({
                'deleteContentRange': {
                    'range': {
                        'startIndex': 1,  # Start after initial section break
                        'endIndex': content_end_index - 1  # End at last content minus 1
                    }
                }
            })
        
        # Insert the new content
        requests.append({
            'insertText': {
                'location': {
                    'index': 1
                },
                'text': updated_text
            }
        })
        
        # Execute the request
        result = service.documents().batchUpdate(
            documentId=document_id,
            body={'requests': requests}
        ).execute()
        
        print("Successfully updated document")
        return result
        
    except Exception as e:
        print(f"Error updating document: {e}")
        return None

def resolve_comment(document_id, comment_id, resolved=True):
    """Mark a comment as resolved.
    
    Args:
        document_id: The ID of the document.
        comment_id: The ID of the comment to resolve.
        resolved: Whether to mark as resolved (True) or not (False).
    
    Returns:
        The updated comment.
    """
    creds = get_credentials()
    drive_service = build('drive', 'v3', credentials=creds)
    
    comment = drive_service.comments().get(
        fileId=document_id,
        commentId=comment_id,
        fields='id,content,resolved'
    ).execute()
    
    # Update the resolved status
    comment['resolved'] = resolved
    
    updated_comment = drive_service.comments().update(
        fileId=document_id,
        commentId=comment_id,
        body=comment
    ).execute()
    
    return updated_comment

def poll_for_comments(document_id, poll_interval=10, last_check_time=None):
    """Poll for new comments and process them.
    
    Args:
        document_id: The ID of the document to monitor.
        poll_interval: How often to check for new comments (in seconds).
        last_check_time: RFC 3339 timestamp of the last check.
    
    Returns:
        None
    """
    if last_check_time is None:
        last_check_time = time.strftime('%Y-%m-%dT%H:%M:%S.%fZ', time.gmtime())
    
    while True:
        print(f"Checking for new comments since {last_check_time}...")
        
        # Get all comments
        comments = get_document_comments(document_id)
        
        # Filter for unresolved comments created after last_check_time
        new_comments = [
            comment for comment in comments 
            if not comment.get('resolved', False) and comment.get('createdTime', '') > last_check_time
        ]
        
        if new_comments:
            print(f"Found {len(new_comments)} new comments!")
            
            # Process each new comment
            for comment in new_comments:
                comment_id = comment['id']
                comment_text = comment['content']
                
                print(f"Processing comment: {comment_text}")
                
                # Get the current document
                document = read_document(document_id)
                document_text = get_document_text(document)
                
                # Ask ChatGPT for an update
                updated_text = ask_chatgpt_for_update(document_text, comment_text)
                
                if updated_text:
                    # Since suggestion mode isn't supported, update directly
                    result = create_direct_update(document_id, document_text, updated_text)
                    
                    if result:
                        print(f"Updated document in response to comment {comment_id}")
                        
                        # Add a reply to the comment
                        creds = get_credentials()
                        drive_service = build('drive', 'v3', credentials=creds)
                        
                        reply_content = "I've updated the document based on your comment. The changes have been applied directly."
                        
                        try:
                            drive_service.replies().create(
                                fileId=document_id,
                                commentId=comment_id,
                                body={'content': reply_content},
                                fields='id,content,createdTime'
                            ).execute()
                            print(f"Added reply to comment {comment_id}")
                        except Exception as e:
                            print(f"Error adding reply: {e}")
                            # Continue monitoring even if reply fails
                            continue
                else:
                    print(f"Failed to generate update for comment {comment_id}")
        
        # Update the last check time
        last_check_time = time.strftime('%Y-%m-%dT%H:%M:%S.%fZ', time.gmtime())
        
        # Wait for the next poll
        print(f"Waiting {poll_interval} seconds until next check...")
        time.sleep(poll_interval)

def main():
    """Main function to run the comment monitoring system."""
    print("Starting Google Doc comment monitoring system...")
    
    # Check if OpenAI API key is set
    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY environment variable is not set.")
        print("Please set it with: export OPENAI_API_KEY='your-api-key'")
        return
    
    try:
        # Start polling for comments
        poll_for_comments(DOCUMENT_ID, poll_interval=10)  # Check every 10 seconds
    except KeyboardInterrupt:
        print("\nMonitoring stopped by user.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
