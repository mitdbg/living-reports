// Tools Management Module
import { addMessageToUI } from './chat.js';
import { getTextContentWithLineBreaks } from './utils.js';

class ToolsManager {
  constructor() {
    this.tools = [];
    this.currentEditingTool = null;
  }

  async init() {
    await this.loadTools();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Tools button click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tools-btn')) {
        this.showToolsPanel();
      }
    });

    // Dialog event listeners
    this.setupDialogListeners();
  }

  setupDialogListeners() {
    // Add tool button (in panel)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-tool-btn')) {
        this.showAddToolDialog();
      }
    });

    // Save tool
    document.addEventListener('click', (e) => {
      if (e.target.id === 'save-tool-btn') {
        this.saveTool();
      }
    });

    // Cancel add tool
    document.addEventListener('click', (e) => {
      if (e.target.id === 'cancel-add-tool-btn' || e.target.id === 'close-add-tool-btn') {
        this.hideAddToolDialog();
      }
    });

    // Tool item actions
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('load-btn')) {
        const toolId = e.target.dataset.toolId;
        this.loadTool(toolId);
      } else if (e.target.classList.contains('edit-btn')) {
        const toolId = e.target.dataset.toolId;
        this.editTool(toolId);
      } else if (e.target.classList.contains('remove-btn')) {
        const toolId = e.target.dataset.toolId;
        this.removeTool(toolId);
      }
    });

    // Search functionality - use event delegation since there might be multiple search inputs
    document.addEventListener('input', (e) => {
      if (e.target.id === 'tools-search' || e.target.classList.contains('tools-search')) {
        this.filterTools(e.target.value);
      }
    });

    // Close tools dialog
    document.addEventListener('click', (e) => {
      if (e.target.id === 'close-tools-btn' || e.target.id === 'close-tools-bottom-btn') {
        this.hideToolsPanel();
      }
    });

    // Close dialogs when clicking overlay
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('dialog-overlay')) {
        if (e.target.closest('.add-tool-dialog')) {
          this.hideAddToolDialog();
        } else if (e.target.closest('.tools-dialog')) {
          this.hideToolsPanel();
        }
      }
    });
  }

  showToolsPanel() {
    const toolsDialog = document.getElementById('tools-dialog');
    if (toolsDialog) {
      toolsDialog.style.display = 'flex';
      this.refreshToolsList();
      addMessageToUI('system', 'Tools dialog opened.');
    } else {
      addMessageToUI('system', 'Tools dialog not found.');
    }
  }

  hideToolsPanel() {
    const toolsDialog = document.getElementById('tools-dialog');
    if (toolsDialog) {
      toolsDialog.style.display = 'none';
      addMessageToUI('system', 'Tools dialog closed.');
    }
  }

  showAddToolDialog(editTool = null) {
    // Close tools dialog first
    this.hideToolsPanel();
    
    const dialog = document.getElementById('add-tool-dialog');
    if (dialog) {
      dialog.style.display = 'flex';
      
      // Clear or populate form
      const nameInput = document.getElementById('tool-name');
      const descriptionInput = document.getElementById('tool-description');
      const codeInput = document.getElementById('tool-code');
      
          if (editTool) {
      this.currentEditingTool = editTool;
      nameInput.value = editTool.name;
      descriptionInput.value = editTool.description || '';
      // Properly set content with line breaks for contenteditable div
      this.setCodeEditorContent(codeInput, editTool.code);
        
        // Update dialog title
        const title = dialog.querySelector('.dialog-header h3');
        title.textContent = '✏️ Edit Tool';
      } else {
        this.currentEditingTool = null;
        nameInput.value = '';
        descriptionInput.value = '';
        this.setCodeEditorContent(codeInput, '');
        
        // Update dialog title
        const title = dialog.querySelector('.dialog-header h3');
        title.textContent = '➕ Add New Tool';
      }
      
      // Focus on name input
      nameInput.focus();
    }
  }

  hideAddToolDialog() {
    const dialog = document.getElementById('add-tool-dialog');
    if (dialog) {
      dialog.style.display = 'none';
      this.currentEditingTool = null;
    }
  }

  async saveTool() {
    const nameInput = document.getElementById('tool-name');
    const descriptionInput = document.getElementById('tool-description');
    const codeInput = document.getElementById('tool-code');
    
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    // Preserve formatting for source code - save innerHTML to preserve <br> tags and formatting
    const code = codeInput.innerHTML;
    
    // Validation
    if (!name) {
      addMessageToUI('system', 'Please enter a tool name.');
      nameInput.focus();
      return;
    }
    
    // Check if code has any meaningful content (not just whitespace or empty HTML tags)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = code;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    if (!textContent.trim()) {
      addMessageToUI('system', 'Please enter source code for the tool.');
      codeInput.focus();
      return;
    }
    
    // Check for duplicate names (only if not editing)
    if (!this.currentEditingTool && this.tools.some(tool => tool.name.toLowerCase() === name.toLowerCase())) {
      addMessageToUI('system', 'A tool with this name already exists. Please choose a different name.');
      nameInput.focus();
      return;
    }
    
    const toolData = {
      id: this.currentEditingTool ? this.currentEditingTool.id : this.generateId(),
      name: name,
      description: description,
      code: code,
      createdAt: this.currentEditingTool ? this.currentEditingTool.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (this.currentEditingTool) {
      // Update existing tool
      const index = this.tools.findIndex(tool => tool.id === this.currentEditingTool.id);
      if (index !== -1) {
        this.tools[index] = toolData;
        addMessageToUI('system', `Tool "${name}" updated successfully.`);
      }
    } else {
      // Add new tool
      this.tools.push(toolData);
      addMessageToUI('system', `Tool "${name}" added successfully.`);
    }
    
    await this.saveTools();
    this.refreshToolsList();
    this.hideAddToolDialog();
    
    // Refresh operators tools sidebar if operators dialog is open
    this.refreshOperatorsToolsIfOpen();
  }

  loadTool(toolId) {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) {
      addMessageToUI('system', 'Tool not found.');
      return;
    }
    
    // Load tool code into the source editor
    const activeDocumentId = window.documentManager?.activeDocumentId;
    if (!activeDocumentId) {
      addMessageToUI('system', 'No active document found. Please create or open a document first.');
      return;
    }
    
    const container = document.getElementById(`document-${activeDocumentId}`);
    if (!container) {
      addMessageToUI('system', 'Document container not found.');
      return;
    }
    
    const sourceEditor = container.querySelector('.source-editor');
    if (sourceEditor) {
      // Load innerHTML to preserve formatting including <br> tags
      sourceEditor.innerHTML = tool.code;
      addMessageToUI('system', `Loaded tool "${tool.name}" into source editor.`);
      
      // Close tools dialog
      this.hideToolsPanel();
      
      // Switch to source mode
      const sourceModeBtn = container.querySelector('.source-mode-btn');
      if (sourceModeBtn) {
        sourceModeBtn.click();
      }
    } else {
      addMessageToUI('system', 'Source editor not found. Please make sure you have a document open.');
    }
  }

  editTool(toolId) {
    const tool = this.tools.find(t => t.id === toolId);
    if (tool) {
      this.showAddToolDialog(tool);
    }
  }

  async removeTool(toolId) {
    const tool = this.tools.find(t => t.id === toolId);
    if (tool) {
      if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
        this.tools = this.tools.filter(t => t.id !== toolId);
        await this.saveTools();
        this.refreshToolsList();
        addMessageToUI('system', `Tool "${tool.name}" deleted successfully.`);
        
        // Refresh operators tools sidebar if operators dialog is open
        this.refreshOperatorsToolsIfOpen();
      }
    }
  }

  refreshOperatorsToolsIfOpen() {
    // Check if operators panel is open (either as dialog or embedded in document)
    const operatorsDialog = document.getElementById('operators-dialog');
    const operatorsPanel = document.querySelector('.operators-panel.active');
    
    if ((operatorsDialog && operatorsDialog.style.display !== 'none') || operatorsPanel) {
      // Refresh the tools sidebar in operators dialog/panel
      if (window.operatorsModule && window.operatorsModule.refreshOperatorsToolsList) {
        window.operatorsModule.refreshOperatorsToolsList();
      }
    }
  }

  filterTools(searchTerm) {
    const toolItems = document.querySelectorAll('.tool-item');
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    toolItems.forEach(item => {
      const name = item.querySelector('.tool-item-name').textContent.toLowerCase();
      const description = item.querySelector('.tool-item-description').textContent.toLowerCase();
      
      const matches = name.includes(lowerSearchTerm) || description.includes(lowerSearchTerm);
      item.classList.toggle('filtered-out', !matches);
    });
  }

  refreshToolsList() {
    const toolsItems = document.querySelector('#tools-dialog .tools-items');
    if (!toolsItems) return;
    
    const noToolsMessage = toolsItems.querySelector('.no-tools-message');
    
    // Clear existing items except the no-tools message
    const existingItems = toolsItems.querySelectorAll('.tool-item');
    existingItems.forEach(item => item.remove());
    
    if (this.tools.length === 0) {
      noToolsMessage.style.display = 'block';
    } else {
      noToolsMessage.style.display = 'none';
      
      // Sort tools by name
      const sortedTools = [...this.tools].sort((a, b) => a.name.localeCompare(b.name));
      
      sortedTools.forEach(tool => {
        const toolElement = this.createToolElement(tool);
        toolsItems.appendChild(toolElement);
      });
    }
  }

  createToolElement(tool) {
    const element = document.createElement('div');
    element.className = 'tool-item';
    
    const createdDate = new Date(tool.createdAt).toLocaleDateString();
    const updatedDate = new Date(tool.updatedAt).toLocaleDateString();
    const codeLength = tool.code.length;
    
    element.innerHTML = `
      <div class="tool-item-info">
        <div class="tool-item-icon">🛠️</div>
        <div class="tool-item-details">
          <div class="tool-item-name">${this.escapeHtml(tool.name)}</div>
          <div class="tool-item-description">${this.escapeHtml(tool.description || 'No description')}</div>
          <div class="tool-item-meta">
            <span>Created: ${createdDate}</span>
            <span>Updated: ${updatedDate}</span>
            <span>${codeLength} chars</span>
          </div>
        </div>
      </div>
      <div class="tool-item-actions">
        <button class="tool-item-btn load-btn" data-tool-id="${tool.id}">Load</button>
        <button class="tool-item-btn edit-btn" data-tool-id="${tool.id}">Edit</button>
        <button class="tool-item-btn remove-btn" data-tool-id="${tool.id}">Delete</button>
      </div>
    `;
    
    return element;
  }

  generateId() {
    return 'tool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Properly set content in a contenteditable div while preserving line breaks
   * @param {HTMLElement} codeInput - The contenteditable div
   * @param {string} content - The content to set
   */
  setCodeEditorContent(codeInput, content) {
    if (!content) {
      codeInput.innerHTML = '';
      return;
    }
    
    // If content already contains HTML (like <br> tags), use it directly
    // Otherwise, convert newlines to <br> tags for proper display in contenteditable div
    if (content.includes('<br>') || content.includes('<div>') || content.includes('<p>')) {
      codeInput.innerHTML = content;
    } else {
      const htmlContent = content.replace(/\n/g, '<br>');
      codeInput.innerHTML = htmlContent;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async saveTools() {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tools: this.tools })
      });
      
      const result = await response.json();
      if (!result.success) {
        console.error('Error saving tools:', result.error);
        addMessageToUI('system', `Error saving tools: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving tools:', error);
      addMessageToUI('system', 'Error saving tools to backend.');
    }
  }

  async loadTools() {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/tools');
      const result = await response.json();
      
      if (result.success) {
        this.tools = result.tools || [];
      } else {
        console.error('Error loading tools:', result.error);
        this.tools = [];
      }
    } catch (error) {
      console.error('Error loading tools:', error);
      this.tools = [];
    }
  }
}

// Initialize tools manager
let toolsManager;

export async function initTools() {
  toolsManager = new ToolsManager();
  await toolsManager.init();
  
  // Make toolsManager globally available
  window.toolsManager = toolsManager;
  
  console.log('✅ Tools module initialized');
}

// Export for potential external access
export { toolsManager }; 