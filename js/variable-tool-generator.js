// Variable Tool Generator Module
import { state, elements, updateState } from './state.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';
import { executeCodeForAuthorLocal } from './execute_tool_util.js';

/**
 * Variable Tool Generator System
 * Handles tool generation from variable dialog
 */
class VariableToolGenerator {
  constructor() {
    this.generatorDialog = null;
    this.currentVariable = null;
    this.generatedCode = '';
    this.originalGeneratedCode = '';
    this.isVisible = false;
    this.parentDialog = null;
    this.initialized = false;
  }

  /**
   * Initialize the tool generator
   */
  init() {
    if (this.initialized) {
      console.log('Variable Tool Generator already initialized');
      return;
    }
    
    console.log('Initializing Variable Tool Generator');
    this.initialized = true;
  }

  /**
   * Show the tool generator floating window
   */
  show(variableData, parentDialog) {
    console.log('Showing Variable Tool Generator for variable:', variableData?.name);
    
    this.currentVariable = variableData;
    this.parentDialog = parentDialog;
    
    // Create dialog if it doesn't exist
    if (!this.generatorDialog) {
      this.createGeneratorDialog();
    }
    
    // Position the dialog to the right of variables panel
    this.positionDialog();
    
    // Populate datasource list
    this.populateDataSources();
    
    // Show the dialog
    this.generatorDialog.style.display = 'flex';
    this.isVisible = true;
    
    // Update variable info display
    this.updateVariableInfo();
  }

  /**
   * Hide the tool generator
   */
  hide() {
    if (this.generatorDialog) {
      this.generatorDialog.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Create the generator dialog
   */
  createGeneratorDialog() {
    const dialogHtml = `
      <div class="dialog-overlay" style="background: rgba(0,0,0,0.3);">
        <div class="dialog-content variable-tool-generator-content">
          <div class="dialog-header">
            <h3>🔧 Generate Variable Tool</h3>
            <button class="close-btn" data-action="close-generator">×</button>
          </div>
          
          <div class="variable-info-section">
            <div class="variable-info-header">
              <strong>Variable:</strong> <span id="generator-variable-name"></span>
            </div>
            <div class="variable-info-details">
              <div><strong>Type:</strong> <span id="generator-variable-type"></span></div>
              <div><strong>Description:</strong> <span id="generator-variable-description"></span></div>
            </div>
          </div>
          
          <div class="datasource-section">
            <h4>📊 Select Data Source</h4>
            <select class="datasource-dropdown" id="generator-datasource-dropdown">
              <option value="">-- Select a data source --</option>
            </select>
          </div>
          
          <div class="generation-section">
            <h4>🤖 Code Generation</h4>
            <div class="generation-controls">
              <button class="btn-primary" id="gen-code-btn" data-action="generate-code" disabled>
                Generate Code
              </button>
              <div class="generation-status" id="generation-status" style="display: none;">
                <span class="spinner">🤖</span>
                <span class="status-text">AI is generating code...</span>
              </div>
            </div>
            
            <div class="code-preview" id="code-preview" style="display: none;">
              <h5>Generated Code: <span class="code-edit-hint">(editable)</span></h5>
              <textarea class="code-editor" id="generated-code-editor" rows="15" spellcheck="false"></textarea>
              <div class="code-actions">
                <button class="btn-secondary" id="run-code-btn" data-action="run-code">
                  <span class="btn-icon">▶️</span>
                  Run Code
                </button>
                <button class="btn-success" id="accept-code-btn" data-action="accept-code">
                  <span class="btn-icon">✅</span>
                  Accept & Save Tool
                </button>
              </div>
            </div>
            
            <div class="execution-result" id="execution-result" style="display: none;">
              <h5>Execution Result:</h5>
              <div class="result-content" id="result-content"></div>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="close-generator">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Create dialog with document-specific IDs
    this.generatorDialog = createDocumentDialog('variable-tool-generator-dialog', dialogHtml, 'variable-tool-generator');
    this.generatorDialog.className = 'variable-tool-generator-dialog';
    this.generatorDialog.style.display = 'none';
    
    // Add custom styling
    this.addCustomStyling();
    
    // Add to body
    document.body.appendChild(this.generatorDialog);

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Add custom styling for the generator dialog
   */
  addCustomStyling() {
    const style = document.createElement('style');
    style.textContent = `
      .variable-tool-generator-dialog,
      .variable-tool-generator-dialog .dialog-overlay {
        z-index: 20000 !important; /* Above all other dialogs including variable dialog (9999) */
      }
      
      .variable-tool-generator-content {
        width: 500px;
        max-height: 80vh;
        overflow-y: auto;
      }
      
      .variable-info-section {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
      }
      
      .variable-info-header {
        font-size: 16px;
        margin-bottom: 8px;
      }
      
      .variable-info-details {
        font-size: 14px;
        color: #666;
      }
      
      .variable-info-details > div {
        margin-bottom: 4px;
      }
      
      .datasource-section, .generation-section {
        margin-bottom: 20px;
      }
      
      .datasource-dropdown {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        background: white;
        color: #333;
        cursor: pointer;
        transition: border-color 0.2s ease;
      }
      
      .datasource-dropdown:focus {
        outline: none;
        border-color: #1976d2;
        box-shadow: 0 0 4px rgba(25, 118, 210, 0.3);
      }
      
      .datasource-dropdown:hover {
        border-color: #007bff;
      }
      
      .datasource-dropdown option {
        padding: 8px;
        font-size: 14px;
      }
      
      .generation-controls {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }
      
      .generation-status {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #666;
      }
      
      .spinner {
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .code-preview {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
      }
      
      .code-edit-hint {
        font-size: 12px;
        color: #666;
        font-weight: normal;
        font-style: italic;
      }
      
      .code-editor {
        width: 100%;
        min-height: 300px;
        padding: 12px;
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.4;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #fff;
        color: #333;
        resize: vertical;
        white-space: pre;
        overflow: auto;
        tab-size: 2;
      }
      
      .code-editor:focus {
        outline: none;
        border-color: #1976d2;
        box-shadow: 0 0 4px rgba(25, 118, 210, 0.3);
      }
      
      .code-editor::selection {
        background: #007bff;
        color: white;
        padding: 12px;
        margin-top: 12px;
      }
      
      .code-block {
        background: #2d3748;
        color: #e2e8f0;
        padding: 12px;
        border-radius: 4px;
        font-family: 'Monaco', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.4;
        overflow-x: auto;
        white-space: pre-wrap;
        max-height: 300px;
        overflow-y: auto;
      }
      
      .code-actions {
        display: flex;
        gap: 12px;
        margin-top: 12px;
      }
      
      .execution-result {
        background: #f1f8e9;
        border: 1px solid #c8e6c9;
        border-radius: 6px;
        padding: 12px;
        margin-top: 12px;
      }
      
      .result-content {
        font-family: monospace;
        font-size: 12px;
        background: white;
        padding: 8px;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .btn-icon {
        margin-right: 6px;
      }
    `;
    
    // Add to head if not already added
    if (!document.querySelector('#variable-tool-generator-styles')) {
      style.id = 'variable-tool-generator-styles';
      document.head.appendChild(style);
    }
  }

  /**
   * Setup event listeners for the dialog
   */
  setupEventListeners() {
    this.generatorDialog.addEventListener('click', (e) => {
      const action = e.target.getAttribute('data-action');
      
      if (action === 'close-generator' || e.target.classList.contains('dialog-overlay')) {
        this.hide();
      } else if (action === 'generate-code') {
        this.generateCode();
      } else if (action === 'run-code') {
        this.runCode();
      } else if (action === 'accept-code') {
        this.acceptAndSaveTool();
      }
    });
    
    // Handle dropdown selection
    const dropdown = this.generatorDialog.querySelector('[id$="generator-datasource-dropdown"]');
    console.log('Setting up dropdown listener, found dropdown:', dropdown);
    if (dropdown) {
      dropdown.addEventListener('change', (e) => {
        console.log('Dropdown changed to:', e.target.value);
        this.selectDataSource(e.target.value);
      });
    }
    
    // Setup code editor functionality
    this.setupCodeEditor();
    
    // Close when parent dialog closes
    document.addEventListener('click', (e) => {
      if (this.isVisible && this.parentDialog && !this.parentDialog.contains(e.target) && !this.generatorDialog.contains(e.target)) {
        // Only close if clicking outside both dialogs
        const isOutsideClick = !e.target.closest('.variable-dialog') && !e.target.closest('.variable-tool-generator-dialog');
        if (isOutsideClick) {
          this.hide();
        }
      }
    });
  }

  /**
   * Setup code editor functionality
   */
  setupCodeEditor() {
    // Setup tab indentation and other code editor features
    const setupTextareaHandlers = () => {
      const codeEditor = this.generatorDialog.querySelector('[id$="generated-code-editor"]');
      if (!codeEditor) return;
      
      // Handle tab key for indentation
      codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          
          const start = codeEditor.selectionStart;
          const end = codeEditor.selectionEnd;
          const value = codeEditor.value;
          
          if (e.shiftKey) {
            // Shift+Tab: Remove indentation
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = value.indexOf('\n', lineStart);
            const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
            const line = value.substring(lineStart, actualLineEnd);
            
            if (line.startsWith('  ')) {
              // Remove 2 spaces
              const newValue = value.substring(0, lineStart) + line.substring(2) + value.substring(actualLineEnd);
              codeEditor.value = newValue;
              codeEditor.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
            }
          } else {
            // Tab: Add indentation
            codeEditor.value = value.substring(0, start) + '  ' + value.substring(end);
            codeEditor.setSelectionRange(start + 2, start + 2);
          }
        }
        
        // Auto-indent on Enter
        if (e.key === 'Enter') {
          const start = codeEditor.selectionStart;
          const value = codeEditor.value;
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const currentLine = value.substring(lineStart, start);
          const indentMatch = currentLine.match(/^(\s*)/);
          const currentIndent = indentMatch ? indentMatch[1] : '';
          
          // Add extra indent for lines ending with :, {, [, (
          let extraIndent = '';
          const trimmedLine = currentLine.trim();
          if (trimmedLine.endsWith(':') || trimmedLine.endsWith('{') || 
              trimmedLine.endsWith('[') || trimmedLine.endsWith('(')) {
            extraIndent = '  ';
          }
          
          setTimeout(() => {
            const newStart = codeEditor.selectionStart;
            const newValue = codeEditor.value;
            const insertIndent = currentIndent + extraIndent;
            
            codeEditor.value = newValue.substring(0, newStart) + insertIndent + newValue.substring(newStart);
            codeEditor.setSelectionRange(newStart + insertIndent.length, newStart + insertIndent.length);
          }, 0);
        }
      });
      
      // Handle bracket/quote auto-completion
      codeEditor.addEventListener('input', (e) => {
        if (e.inputType === 'insertText') {
          const start = codeEditor.selectionStart;
          const value = codeEditor.value;
          const char = e.data;
          
          // Auto-close brackets and quotes
          const pairs = {
            '(': ')',
            '[': ']',
            '{': '}',
            '"': '"',
            "'": "'"
          };
          
          if (pairs[char] && start < value.length) {
            const nextChar = value[start];
            // Only auto-close if next character is whitespace or end of line
            if (!nextChar || /\s/.test(nextChar)) {
              codeEditor.value = value.substring(0, start) + pairs[char] + value.substring(start);
              codeEditor.setSelectionRange(start, start);
            }
          }
        }
      });
      
      // Add syntax highlighting hints (basic)
      codeEditor.addEventListener('input', () => {
        // Update stored code when user edits
        this.generatedCode = codeEditor.value;
      });
    };
    
    // Setup handlers immediately if editor exists, or wait for it to be created
    setupTextareaHandlers();
    
    // Also setup when dialog becomes visible
    const originalShow = this.show.bind(this);
    this.show = function(...args) {
      const result = originalShow(...args);
      setTimeout(setupTextareaHandlers, 100); // Give time for DOM to update
      return result;
    };
  }

  /**
   * Position dialog on top of the current dialog/panel
   */
  positionDialog() {
    if (!this.generatorDialog) return;
    
    // Find the active dialog (either variable dialog or variables panel)
    let activeDialog = null;
    const variableDialog = document.querySelector('.variable-dialog');
    const variablesPanel = document.querySelector('.variables-panel-dialog');
    
    if (variableDialog && variableDialog.style.display !== 'none') {
      activeDialog = variableDialog;
    } else if (variablesPanel && variablesPanel.style.display !== 'none') {
      activeDialog = variablesPanel;
    }
    
    if (!activeDialog) {
      console.warn('No active dialog found');
      return;
    }
    
    const dialogRect = activeDialog.getBoundingClientRect();
    const dialogContent = this.generatorDialog.querySelector('.dialog-content');
    
    if (dialogContent) {
      // Position above the active dialog with some gap
      const centerX = dialogRect.left + (dialogRect.width / 2);
      const dialogWidth = 500; // Based on CSS width
      const leftPosition = centerX - (dialogWidth / 2);
      const topPosition = dialogRect.top - 20; // Small gap above
      
      // Ensure it doesn't go off screen
      const viewportWidth = window.innerWidth;
      const finalLeftPosition = Math.max(20, Math.min(leftPosition, viewportWidth - dialogWidth - 20));
      const finalTopPosition = Math.max(20, topPosition);
      
      dialogContent.style.marginLeft = `${finalLeftPosition}px`;
      dialogContent.style.marginTop = `${finalTopPosition}px`;
      dialogContent.style.position = 'fixed';
    }
  }

  /**
   * Update variable info display
   */
  updateVariableInfo() {
    if (!this.currentVariable) return;
    
    const nameEl = getDocumentElement('generator-variable-name');
    const typeEl = getDocumentElement('generator-variable-type');
    const descEl = getDocumentElement('generator-variable-description');
    
    if (nameEl) nameEl.textContent = this.currentVariable.name || 'Unknown';
    if (typeEl) typeEl.textContent = this.currentVariable.type || 'text';
    if (descEl) descEl.textContent = this.currentVariable.description || 'No description';
  }

  /**
   * Populate data sources from data lake
   */
  async populateDataSources() {
    const dropdown = getDocumentElement('generator-datasource-dropdown');
    if (!dropdown) return;
    
    // Get data sources from data lake
    let dataSources = [];
    if (window.dataLakeModule && window.dataLakeModule.getAllDataSources) {
      dataSources = window.dataLakeModule.getAllDataSources();
    }

    // Clear existing options (keep the default option)
    dropdown.innerHTML = '<option value="">-- Select a data source --</option>';
    
    if (dataSources.length === 0) {
      const noDataOption = document.createElement('option');
      noDataOption.value = '';
      noDataOption.textContent = 'No data sources available. Use "Load Context" to add files.';
      noDataOption.disabled = true;
      dropdown.appendChild(noDataOption);
      return;
    }
    
    // Add each data source as an option
    dataSources.forEach(source => {
      const option = document.createElement('option');
      // Use filePath as the value for code execution, fallback to referenceName for backward compatibility
      option.value = source.filePath || source.referenceName;
      option.textContent = `${this.getFileIcon(source.type)} ${source.name} ($${source.referenceName})`;
      option.setAttribute('data-source-id', source.id);
      option.setAttribute('data-source-name', source.referenceName);
      option.setAttribute('data-file-path', source.filePath || '');
      option.setAttribute('data-type', source.type);
      dropdown.appendChild(option);
    });
  }

  /**
   * Get file icon based on type
   */
  getFileIcon(type) {
    const iconMap = {
      'text/csv': '📊',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📈',
      'application/vnd.ms-excel': '📈',
      'application/pdf': '📄',
      'text/plain': '📝',
      'application/json': '🔧',
      'text/javascript': '⚡',
      'text/html': '🌐'
    };
    
    return iconMap[type] || '📁';
  }

  /**
   * Select a data source
   */
  selectDataSource(selectedValue) {
    console.log('selectDataSource called with:', selectedValue);
    
    // Store the selected data source
    this.selectedDataSource = selectedValue;
    
    // Enable generate code button if a source is selected
    // Try multiple ways to find the button
    let genBtn = this.generatorDialog.querySelector('[data-action="generate-code"]');
    console.log('Method 1 - [data-action="generate-code"]:', genBtn);
    
    if (!genBtn) {
      genBtn = this.generatorDialog.querySelector('[id$="gen-code-btn"]');
      console.log('Method 2 - [id$="gen-code-btn"]:', genBtn);
    }
    
    if (!genBtn) {
      genBtn = this.generatorDialog.querySelector('button.btn-primary');
      console.log('Method 3 - button.btn-primary:', genBtn);
    }
    
    if (genBtn) {
      const wasDisabled = genBtn.disabled;
      genBtn.disabled = !selectedValue;
      console.log('Button found! Changed disabled from', wasDisabled, 'to', !selectedValue);
      console.log('Button element:', genBtn);
    } else {
      console.error('Could not find generate code button!');
      console.log('All buttons in dialog:', this.generatorDialog.querySelectorAll('button'));
    }
    
    console.log('Selected data source:', selectedValue);
  }

  /**
   * Generate code using LLM
   */
  async generateCode() {
    if (!this.selectedDataSource) {
      alert('Please select a data source first');
      return;
    }
    
    const sourceName = this.selectedDataSource;
    console.log('Generating code for variable:', this.currentVariable.name, 'with source:', sourceName);
    
    // Show loading state
    this.showGenerationLoading(true);
    
    try {
      // Call backend API to generate code
      const response = await fetch('http://127.0.0.1:5000/api/generate-variable-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variable_name: this.currentVariable.name,
          variable_type: this.currentVariable.type,
          variable_description: this.currentVariable.description,
          data_source: sourceName,
          document_id: window.documentManager?.activeDocumentId || 'default'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.code) {
        this.generatedCode = result.code;
        this.showGeneratedCode(result.code);
      } else {
        throw new Error(result.error || 'Failed to generate code');
      }
      
    } catch (error) {
      console.error('Error generating code:', error);
      alert('Error generating code: ' + error.message);
    } finally {
      this.showGenerationLoading(false);
    }
  }

  /**
   * Show/hide generation loading state
   */
  showGenerationLoading(show) {
    const status = this.generatorDialog.querySelector('[id$="generation-status"]');
    const genBtn = this.generatorDialog.querySelector('[data-action="generate-code"]');
    
    console.log('showGenerationLoading - status:', status, 'genBtn:', genBtn);
    
    if (status) {
      status.style.display = show ? 'flex' : 'none';
    }
    
    if (genBtn) {
      genBtn.disabled = show;
      genBtn.innerHTML = show ? 
        'Generating...' : 
        'Generate Code';
    }
  }

  /**
   * Show generated code
   */
  showGeneratedCode(code) {
    const codePreview = getDocumentElement('code-preview');
    const codeEditor = getDocumentElement('generated-code-editor');
    
    if (codePreview) codePreview.style.display = 'block';
    if (codeEditor) {
      codeEditor.value = code;
      // Store the original generated code
      this.originalGeneratedCode = code;
    }
    
    console.log('Code generated successfully');
  }

  /**
   * Run the generated code
   */
  async runCode() {
    const codeEditor = getDocumentElement('generated-code-editor');
    const currentCode = codeEditor ? codeEditor.value.trim() : '';
    
    if (!currentCode) {
      alert('No code to run. Generate code first.');
      return;
    }
    
    console.log('Running current code from editor...');
    
    // Update the stored generated code with current editor content
    this.generatedCode = currentCode;
    console.log("======", currentCode)
    console.log("=======", this.selectedDataSource)
    
    const output = await executeCodeForAuthorLocal(currentCode, this.selectedDataSource, window.documentManager?.activeDocumentId);
    console.log("=======", output)
  }

  /**
   * Accept code and save as tool
   */
  async acceptAndSaveTool() {
    const codeEditor = getDocumentElement('generated-code-editor');
    const currentCode = codeEditor ? codeEditor.value.trim() : '';
    
    if (!currentCode) {
      alert('No code to save. Generate code first.');
      return;
    }
    
    const toolName = `gen_${this.currentVariable.name}`;
    const toolDescription = `Auto-generated tool for variable: ${this.currentVariable.name}`;
    
    console.log('Saving tool:', toolName);
    
    try {
      // Create tool object
      const newTool = {
        id: this.generateId(),
        name: toolName,
        description: toolDescription,
        code: currentCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedFor: this.currentVariable.name,
        autoGenerated: true
      };
      
      // Get current tools first
      let currentTools = [];
      if (window.toolsManager && window.toolsManager.tools) {
        currentTools = window.toolsManager.tools;
      }
      
      // Add new tool to the list
      currentTools.push(newTool);
      
      // Save all tools
      const response = await fetch('http://127.0.0.1:5000/api/tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tools: currentTools })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success) {
        // Update local tools manager if available
        if (window.toolsManager) {
          window.toolsManager.tools = currentTools;
        }
        
        console.log('Tool saved successfully:', toolName);
        alert(`Tool "${toolName}" saved successfully!`);
        
        // Close the generator
        this.hide();
      } else {
        throw new Error(result.error || 'Failed to save tool');
      }
      
    } catch (error) {
      console.error('Error saving tool:', error);
      alert('Error saving tool: ' + error.message);
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return 'gen_tool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// Create and export singleton instance
export const variableToolGenerator = new VariableToolGenerator();
export default variableToolGenerator; 