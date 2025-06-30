#!/usr/bin/env python3
"""
Simple MCP Service - Based on working test_mcp.py approach

This provides a straightforward MCP integration without complex locks or state management.
"""

import asyncio
import json
import logging
import os
import shutil
from contextlib import AsyncExitStack
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

# MCP client imports
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    logging.warning("MCP client not available. Install with: pip install mcp")

# Configure logging
logger = logging.getLogger('simple_mcp')

@dataclass
class MCPTool:
    """Represents an MCP tool with its properties."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    title: Optional[str] = None
    server_name: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert tool to dictionary format."""
        return {
            'name': self.name,
            'title': self.title,
            'description': self.description,
            'input_schema': self.input_schema,
            'server_name': self.server_name
        }
    
    def format_for_llm(self) -> str:
        """Format tool for LLM consumption (same as test_mcp.py)."""
        return f"{self.name}: {self.description}"

class Configuration:
    """Simple configuration loader (from test_mcp.py)."""
    
    @staticmethod
    def load_config(file_path: str) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config from {file_path}: {e}")
            return {}

class Server:
    """Simple MCP server (based on test_mcp.py)."""
    
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialize the server connection (from test_mcp.py)."""
        if self._initialized:
            return
            
        try:
            command = (
                shutil.which("npx")
                if self.config["command"] == "npx"
                else shutil.which(self.config["command"])
            )
            
            if command is None:
                raise ValueError(f"Command '{self.config['command']}' not found in PATH")

            server_params = StdioServerParameters(
                command=command,
                args=self.config["args"],
                env={**os.environ, **self.config["env"]}
                if self.config.get("env")
                else None,
                cwd=self.config.get("cwd"),
            )
            
            stdio_transport = await self.exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            read, write = stdio_transport
            session = await self.exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            self.session = session
            self._initialized = True
            
            logger.info(f"✅ MCP server '{self.name}' initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Error initializing MCP server '{self.name}': {e}")
            await self.cleanup()
            raise
    
    async def list_tools(self) -> List[MCPTool]:
        """List available tools from the server."""
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")
            
        try:
            tools_response = await self.session.list_tools()
            tools = []
            
            # Handle the response based on its actual structure
            if hasattr(tools_response, 'tools'):
                mcp_tools = tools_response.tools
            else:
                mcp_tools = tools_response

            for tool in mcp_tools:
                try:
                    tools.append(MCPTool(
                        name=tool.name,
                        description=tool.description,
                        input_schema=getattr(tool, 'inputSchema', getattr(tool, 'input_schema', {})),
                        title=getattr(tool, 'title', None),
                        server_name=self.name
                    ))
                except Exception as e:
                    logger.error(f"Error processing tool {getattr(tool, 'name', 'unknown')}: {e}")
                    
            return tools
                    
        except Exception as e:
            logger.error(f"Error listing tools for server '{self.name}': {e}")
            return []
    
    async def execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        retries: int = 2,
        delay: float = 1.0,
    ) -> Any:
        """Execute a tool with retry mechanism (from test_mcp.py)."""
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        attempt = 0
        while attempt < retries:
            try:
                logger.info(f"🔧 Executing tool '{tool_name}' on server '{self.name}'")
                result = await self.session.call_tool(tool_name, arguments)
                logger.info(f"✅ Tool '{tool_name}' executed successfully")
                return result

            except Exception as e:
                attempt += 1
                logger.warning(f"⚠️ Tool execution failed (attempt {attempt}/{retries}): {e}")
                if attempt < retries:
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"❌ Tool '{tool_name}' failed after {retries} attempts")
                    raise
    
    async def cleanup(self):
        """Clean up server resources."""
        try:
            await self.exit_stack.aclose()
            self.session = None
            self._initialized = False
            logger.info(f"🧹 MCP server '{self.name}' cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup of server '{self.name}': {e}")

class SimpleMCPService:
    """Simple MCP service manager (based on test_mcp.py)."""
    
    def __init__(self):
        self.servers: List[Server] = []
        self.all_tools: List[MCPTool] = []
        self._initialized = False
        self.config_path = None
        # Background thread and loop for persistent connections
        self._background_loop = None
        self._background_thread = None
        self._loop_ready = False
    
    @property
    def is_available(self) -> bool:
        """Check if MCP is available."""
        return MCP_AVAILABLE
    
    def set_config_path(self, config_path: Optional[str] = None):
        """Set the configuration file path."""
        if config_path is None:
            # Default to backend/mcp/mcp.json
            self.config_path = os.path.join(
                os.path.dirname(__file__), 
                "mcp", 
                "mcp.json"
            )
        else:
            self.config_path = config_path
    
    def _start_background_loop(self):
        """Start the background event loop for persistent MCP connections."""
        import threading
        import time
        
        def run_background_loop():
            """Run the background event loop."""
            self._background_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._background_loop)
            self._loop_ready = True
            logger.info("🔄 MCP background event loop started")
            
            try:
                self._background_loop.run_forever()
            except Exception as e:
                logger.error(f"❌ Background loop error: {e}")
            finally:
                self._background_loop.close()
                self._background_loop = None
                self._loop_ready = False
                logger.info("🔄 MCP background event loop stopped")
        
        if not self._background_thread or not self._background_thread.is_alive():
            self._background_thread = threading.Thread(target=run_background_loop, daemon=True)
            self._background_thread.start()
            
            # Wait for loop to be ready
            while not self._loop_ready:
                time.sleep(0.01)
    
    async def initialize(self) -> bool:
        """Initialize all MCP servers with persistent background loop."""
        if self._initialized:
            logger.info("✅ MCP already initialized")
            return True
            
        if not MCP_AVAILABLE:
            logger.warning("MCP not available - application will run without MCP tools")
            return False
        
        # Start background loop if not already running
        if not self._background_loop or not self._loop_ready:
            self._start_background_loop()
        
        if not self.config_path:
            self.set_config_path()
            
        # Schedule initialization on the background loop
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._initialize_in_background(), 
                self._background_loop
            )
            return future.result(timeout=30)
        except Exception as e:
            logger.error(f"❌ Error scheduling MCP initialization: {e}")
            return False
    
    async def _initialize_in_background(self) -> bool:
        """Initialize MCP servers in the background event loop."""
        try:
            logger.info(f"🚀 Initializing MCP service from {self.config_path}")
            
            # Load config (same as test_mcp.py)
            config = Configuration()
            server_config = config.load_config(self.config_path)
            
            if not server_config or "mcpServers" not in server_config:
                logger.error("❌ No mcpServers found in config")
                return False
            
            # Create servers (same as test_mcp.py)
            self.servers = [
                Server(name, srv_config)
                for name, srv_config in server_config["mcpServers"].items()
            ]
            
            logger.info(f"📋 Found {len(self.servers)} servers to initialize")
            
            # Initialize servers one by one (same as test_mcp.py)
            initialized_count = 0
            for server in self.servers:
                try:
                    await server.initialize()
                    initialized_count += 1
                except Exception as e:
                    logger.error(f"Failed to initialize server '{server.name}': {e}")
                    # Continue with other servers instead of failing completely
            
            if initialized_count == 0:
                logger.error("❌ No servers could be initialized")
                return False
            
            # Collect all tools from all servers
            self.all_tools = []
            logger.info("🔧 Collecting tools from initialized servers...")
            for server in self.servers:
                if server._initialized:
                    try:
                        logger.info(f"📋 Getting tools from server '{server.name}'...")
                        server_tools = await server.list_tools()
                        self.all_tools.extend(server_tools)
                        logger.info(f"✅ Server '{server.name}': {len(server_tools)} tools loaded")
                        logger.info(f"   Tools: {[tool.name for tool in server_tools]}")
                    except Exception as e:
                        logger.error(f"❌ Error listing tools from server '{server.name}': {e}")
            
            self._initialized = True
            logger.info(f"✅ MCP service initialized with {len(self.all_tools)} total tools from {initialized_count} servers")
            logger.info(f"🔧 All available tools: {[tool.name for tool in self.all_tools]}")
            logger.info(f"📊 Service ready: {self.is_ready()}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Error initializing MCP service: {e}")
            await self.cleanup()
            return False
    
    async def list_all_tools(self) -> List[MCPTool]:
        """List all available tools."""
        if not self._initialized:
            await self.initialize()
        return self.all_tools.copy()
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any], server_name: Optional[str] = None) -> Any:
        """Execute a tool by name using the background event loop."""
        if not self._initialized:
            success = await self.initialize()
            if not success:
                raise RuntimeError("MCP service not available")
        
        # Check if we're in the background loop
        try:
            current_loop = asyncio.get_running_loop()
            if current_loop == self._background_loop:
                # We're already in the background loop
                return await self._execute_tool_in_background(tool_name, arguments, server_name)
        except RuntimeError:
            # No running loop, proceed to schedule on background loop
            pass
        
        # Schedule execution on the background loop
        future = asyncio.run_coroutine_threadsafe(
            self._execute_tool_in_background(tool_name, arguments, server_name),
            self._background_loop
        )
        return future.result(timeout=30)
    
    async def _execute_tool_in_background(self, tool_name: str, arguments: Dict[str, Any], server_name: Optional[str] = None) -> Any:
        """Execute a tool in the background event loop."""
        # Find the server that has this tool using cached tools (avoid list_tools() call)
        target_server = None
        for tool in self.all_tools:
            if tool.name == tool_name:
                # If server_name is specified, only check that server
                if server_name and tool.server_name != server_name:
                    continue
                
                # Find the server object
                for server in self.servers:
                    if server.name == tool.server_name and server._initialized:
                        target_server = server
                        break
                break
        
        if target_server:
            try:
                return await target_server.execute_tool(tool_name, arguments)
            except Exception as e:
                logger.error(f"Error executing tool '{tool_name}' on server '{target_server.name}': {e}")
                raise
        
        raise RuntimeError(f"No server found with tool: {tool_name}")
    
    def get_tools_description(self) -> str:
        """Get tools description for LLM (same format as test_mcp.py)."""
        if not self.all_tools:
            return "MCP tools are initializing..."
        
        return "\n".join([tool.format_for_llm() for tool in self.all_tools])
    
    def is_ready(self) -> bool:
        """Check if MCP service is ready."""
        return self._initialized and len(self.all_tools) > 0
    
    def get_status(self) -> Dict[str, Any]:
        """Get MCP service status."""
        return {
            "available": MCP_AVAILABLE,
            "initialized": self._initialized,
            "servers_count": len([s for s in self.servers if s._initialized]),
            "total_servers": len(self.servers),
            "tools_count": len(self.all_tools),
            "server_names": [s.name for s in self.servers if s._initialized],
            "tool_names": [tool.name for tool in self.all_tools]
        }
    
    async def cleanup(self):
        """Cleanup all servers and stop background loop."""
        for server in self.servers:
            try:
                await server.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up server '{server.name}': {e}")
        
        # Stop background loop
        if self._background_loop and self._loop_ready:
            self._background_loop.call_soon_threadsafe(self._background_loop.stop)
            if self._background_thread and self._background_thread.is_alive():
                self._background_thread.join(timeout=5)
        
        self.servers.clear()
        self.all_tools.clear()
        self._initialized = False
        self._background_loop = None
        self._background_thread = None
        self._loop_ready = False
        logger.info("🧹 MCP service cleaned up")

# Global instance
_mcp_service = SimpleMCPService()

# Convenience functions
def get_mcp_service() -> SimpleMCPService:
    """Get the global MCP service."""
    return _mcp_service

async def initialize_mcp(config_path: Optional[str] = None) -> bool:
    """Initialize MCP service."""
    if config_path:
        _mcp_service.set_config_path(config_path)
    return await _mcp_service.initialize()

def is_mcp_ready() -> bool:
    """Check if MCP is ready."""
    return _mcp_service.is_ready()

def is_mcp_available() -> bool:
    """Check if MCP is available."""
    return MCP_AVAILABLE

async def get_mcp_tools() -> List[MCPTool]:
    """Get all MCP tools."""
    return await _mcp_service.list_all_tools()

def get_mcp_tools_description() -> str:
    """Get MCP tools description for LLM."""
    return _mcp_service.get_tools_description()

async def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any], server_name: Optional[str] = None) -> Any:
    """Execute an MCP tool."""
    return await _mcp_service.execute_tool(tool_name, arguments, server_name)

def get_mcp_status() -> Dict[str, Any]:
    """Get MCP status."""
    return _mcp_service.get_status()

async def cleanup_mcp():
    """Cleanup MCP service."""
    await _mcp_service.cleanup() 