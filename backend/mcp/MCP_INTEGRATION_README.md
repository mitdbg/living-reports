# MCP Service Integration Guide

This guide explains how to use the MCP (Model Context Protocol) service that provides unified access to external tools and servers.

## Overview

The MCP service uses **Application-Level Initialization** design for optimal performance and simplicity:

- **Single initialization**: MCP is initialized once at application startup
- **Zero boilerplate**: Modules use MCP with zero setup code
- **Global tool availability**: All tools available to all modules immediately
- **Direct tool usage**: Simple function calls to execute any MCP tool

## Current MCP Service Summary

The system includes:

- **`simple_mcp_service.py`**: Simple MCP service with persistent background loop
- **`mcp/mcp.json`**: Production configuration with active servers
- **REST API endpoints**: Full HTTP interface for frontend integration
- **Automatic initialization**: MCP starts with the backend application

### Architecture

The MCP service uses a **persistent background loop** approach:
- **Background Thread**: Dedicated thread with persistent event loop for MCP operations
- **Server Connections**: MCP servers stay connected in the background loop
- **Cross-Thread Communication**: Tool execution scheduled from Flask threads to background loop
- **Event Loop Stability**: Connections persist throughout app lifetime

### Available MCP Servers

Your system is configured with these MCP servers:

1. **Google Workspace** - Gmail, Calendar, Drive operations
2. **SQLite** - Database queries and operations
3. **Puppeteer** - Web scraping and browser automation
4. **Sequential Thinking** - Enhanced reasoning capabilities

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Basic Module Integration

```python
from simple_mcp_service import execute_mcp_tool, get_mcp_tools, is_mcp_ready

class MyModule:
    async def process_request(self, user_request):
        # Check if MCP is ready
        if not is_mcp_ready():
            return "MCP tools not available"
        
        # Execute tool directly - no setup needed!
        if "email" in user_request:
            result = await execute_mcp_tool("search_gmail_messages", {
                "query": "in:inbox",
                "user_google_email": "chjuncn@gmail.com",
                "page_size": 10
            })
            return f"Found emails: {result}"
        
        return "Request processed"
```

### 3. List Available Tools

```python
async def show_available_tools():
    tools = await get_mcp_tools()
    for tool in tools:
        print(f"- {tool.name}: {tool.description}")
```

## Integration Patterns

### Pattern 1: Direct Tool Execution

For simple tool usage without complex logic:

```python
from simple_mcp_service import execute_mcp_tool

async def search_user_emails(query, user_email):
    return await execute_mcp_tool("search_gmail_messages", {
        "query": query,
        "user_google_email": user_email,
        "page_size": 20
    })

async def create_calendar_event(title, start_time, user_email):
    return await execute_mcp_tool("create_calendar_event", {
        "summary": title,
        "start": start_time,
        "user_google_email": user_email
    })
```

### Pattern 2: Tool-Aware Module

For modules that need to be aware of available tools:

```python
from simple_mcp_service import get_mcp_tools, execute_mcp_tool, is_mcp_ready

class TaskManager:
    def __init__(self):
        self.mcp_tools = []
    
    async def initialize(self):
        if is_mcp_ready():
            self.mcp_tools = await get_mcp_tools()
    
    async def create_task_with_reminder(self, task, reminder_time):
        # Create task normally
        task_id = self.create_task(task)
        
        # Add calendar reminder if Google Workspace is available
        calendar_tools = [t for t in self.mcp_tools if "calendar" in t.name]
        if calendar_tools:
            await execute_mcp_tool("create_calendar_event", {
                "summary": f"Task: {task}",
                "start": reminder_time,
                "user_google_email": "chjuncn@gmail.com"
            })
        
        return task_id
```

### Pattern 3: Error Handling

For robust production usage:

```python
from simple_mcp_service import execute_mcp_tool

async def safe_tool_execution(tool_name, arguments):
    try:
        result = await execute_mcp_tool(tool_name, arguments)
        return {"success": True, "data": result}
    
    except Exception as e:
        # Log error for debugging
        print(f"MCP tool error: {e}")
        
        # Return graceful fallback
        return {
            "success": False, 
            "error": str(e),
            "fallback": "Tool temporarily unavailable"
        }
```

## API Reference

### Core Functions

```python
# Check if MCP service is ready
is_mcp_ready() -> bool

# Get all available tools (async)
await get_mcp_tools() -> List[MCPTool]

# Execute any MCP tool (async)
await execute_mcp_tool(tool_name: str, arguments: dict, server_name: Optional[str] = None) -> Any

# Get tools description for LLM
get_mcp_tools_description() -> str

# Get MCP service status
get_mcp_status() -> Dict[str, Any]
```

### MCPTool Class

```python
class MCPTool:
    name: str           # Tool identifier
    description: str    # What the tool does
    input_schema: dict  # Required/optional parameters
    server_name: str    # Which server provides this tool
```

### Common Tool Examples

#### Gmail Tools
```python
# Search emails
await execute_mcp_tool("search_gmail_messages", {
    "query": "from:john subject:project",
    "user_google_email": "chjuncn@gmail.com",
    "page_size": 10
})

# Get message content
await execute_mcp_tool("get_gmail_message_content", {
    "message_id": "abc123",
    "user_google_email": "chjuncn@gmail.com"
})
```

#### Calendar Tools
```python
# Search events
await execute_mcp_tool("search_calendar_events", {
    "time_min": "2024-01-01T00:00:00Z",
    "time_max": "2024-01-31T23:59:59Z",
    "user_google_email": "chjuncn@gmail.com"
})

# Create event
await execute_mcp_tool("create_calendar_event", {
    "summary": "Team Meeting",
    "start": "2024-01-15T10:00:00Z",
    "end": "2024-01-15T11:00:00Z",
    "user_google_email": "chjuncn@gmail.com"
})
```

#### SQLite Tools
```python
# Query database
await execute_mcp_tool("query", {
    "sql": "SELECT * FROM users WHERE active = 1"
})

# Execute SQL
await execute_mcp_tool("execute", {
    "sql": "INSERT INTO logs (message) VALUES ('User logged in')"
})
```

## REST API Endpoints

For frontend integration:

### Get Status
```bash
GET /api/mcp/app-status
```
Returns MCP service status and available tool count.

### List Tools
```bash
GET /api/mcp/tools
```
Returns all available tools with descriptions and schemas.

### Execute Tool
```bash
POST /api/mcp/execute
Content-Type: application/json

{
    "tool_name": "search_gmail_messages",
    "arguments": {
        "query": "in:inbox",
        "user_google_email": "chjuncn@gmail.com",
        "page_size": 10
    }
}
```

## Configuration

### MCP Server Configuration

Edit `backend/mcp/mcp.json` to modify MCP servers:

```json
{
    "mcpServers": {
        "google_workspace": {
            "command": "uv",
            "args": ["run", "main.py", "--single-user"],
            "cwd": "/Users/chjun/Documents/GitHub/code/google_workspace_mcp",
            "env": {
                "MCP_SINGLE_USER_MODE": "1",
                "OAUTHLIB_INSECURE_TRANSPORT": "1"
            }
        },
        "sqlite": {
            "command": "uvx",
            "args": ["mcp-server-sqlite", "--db-path", "./test.db"]
        },
        "puppeteer": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
        },
        "sequential-thinking": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
        }
    }
}
```

### Adding New Servers

1. Add server configuration to `mcp.json`
2. Restart the backend application
3. New tools become available automatically

## Working Examples

### Chat Integration

The chat manager automatically uses MCP tools when users make relevant requests:

- **"Search my emails"** → Uses `search_gmail_messages`
- **"What's on my calendar?"** → Uses `search_calendar_events`  
- **"Find my documents"** → Uses `search_drive_files`

### Module Integration Example

```python
# Complete example for a new module
from simple_mcp_service import execute_mcp_tool, get_mcp_tools, is_mcp_ready

class DocumentProcessor:
    async def process_document_request(self, request, user_email):
        if not is_mcp_ready():
            return "Document tools not available"
        
        # Search for documents
        if "find" in request or "search" in request:
            docs = await execute_mcp_tool("search_drive_files", {
                "query": request,
                "user_google_email": user_email
            })
            return f"Found {len(docs)} documents"
        
        # Create new document
        if "create" in request:
            doc = await execute_mcp_tool("create_doc", {
                "title": request.replace("create", "").strip(),
                "user_google_email": user_email
            })
            return f"Created document: {doc.get('title')}"
        
        return "Request not recognized"
```

## Error Handling & Best Practices

### Graceful Degradation

```python
async def robust_tool_usage(tool_name, arguments):
    if not is_mcp_ready():
        return "Service temporarily unavailable"
    
    try:
        result = await execute_mcp_tool(tool_name, arguments)
        return result
    except Exception as e:
        # Log for debugging
        print(f"Tool execution failed: {e}")
        
        # Provide fallback
        return "Unable to complete request, please try again"
```

### Performance Tips

1. **Check availability once**: Use `is_mcp_ready()` at module initialization
2. **Cache tool list**: Store `await get_mcp_tools()` result to avoid repeated calls
3. **Handle errors gracefully**: Always wrap tool calls in try-catch
4. **Use specific tools**: Know which tools you need instead of searching every time
5. **Background loop efficiency**: The persistent background loop ensures MCP connections stay alive

## Troubleshooting

### Common Issues

**MCP not ready**: 
- Check if backend started properly
- Verify `mcp.json` configuration
- Check server dependencies are installed

**Tool not found**:
- Verify tool name spelling
- Check if server is running: `GET /api/mcp/app-status`
- Review available tools: `GET /api/mcp/tools`

**Authentication errors**:
- Check environment variables for Google Workspace
- Complete OAuth flow when prompted
- Verify user email format

### Debug Information

```python
# Check service status
print(f"MCP Ready: {is_mcp_ready()}")

# Get detailed status
from simple_mcp_service import get_mcp_status
status = get_mcp_status()
print(f"MCP Status: {status}")

# List available tools
tools = await get_mcp_tools()
print(f"Available tools: {[t.name for t in tools]}")

# Test tool execution
try:
    result = await execute_mcp_tool("search_gmail_messages", {
        "query": "test",
        "user_google_email": "chjuncn@gmail.com",
        "page_size": 1
    })
    print("✅ Tool execution successful")
except Exception as e:
    print(f"❌ Tool execution failed: {e}")
```

# How to setup Google Workspace Tool
## 1. Download MCP Server
```bash
git clone https://github.com/taylorwilsdon/google_workspace_mcp.git
cd google_workspace_mcp
```

### Prerequisites (More Details in [google_workspace_mcp GitHub Repo](https://github.com/taylorwilsdon/google_workspace_mcp.git))

- **Python 3.11+**
- **[uvx](https://github.com/astral-sh/uv)** (for instant installation) or [uv](https://github.com/astral-sh/uv) (for development)
- **Google Cloud Project** with OAuth 2.0 credentials

### Configuration

1. **Google Cloud Setup**:
   - Create OAuth 2.0 credentials (web application) in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable APIs: Calendar, Drive, Gmail, Docs, Sheets, Slides, Forms, Chat
   - Download credentials as `client_secret.json` in project root
     - To use a different location for `client_secret.json`, you can set the `GOOGLE_CLIENT_SECRETS` environment variable with that path
   - Add redirect URI: `http://localhost:8000/oauth2callback`

2. **Environment**:
   ```bash
   export OAUTHLIB_INSECURE_TRANSPORT=1  # Development only
   ```

3. **Server Configuration**:
   The server's base URL and port can be customized using environment variables:
   - `WORKSPACE_MCP_BASE_URI`: Sets the base URI for the server (default: http://localhost). This affects the server_url used for Gemini native function calling and the OAUTH_REDIRECT_URI.
   - `WORKSPACE_MCP_PORT`: Sets the port the server listens on (default: 8000). This affects the server_url, port, and OAUTH_REDIRECT_URI.

## 2. Update servers_config.json
   - Update `"cwd": "/Users/chjun/Documents/GitHub/code/google_workspace_mcp"` to point to your local server.
   - We can consider to setup a http server for this server, but it's not there yet.

## 3. Notes
   1. You will need to re-authenticate every day, as it will expire in 1 day.
