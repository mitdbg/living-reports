// Variable Operator Generator Module
import { state, elements, updateState } from './state.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';
import { executeCodeForAuthorLocal } from './execute_tool_util.js';

/**
 * Variable Operator Generator System
 * Handles tool generation, operator creation, and variable value extraction from variable dialog
 */
class VariableOperatorGenerator {
  constructor() {
    this.generatorDialog = null;
    this.currentVariable = null;
    this.generatedCode = '';
    this.originalGeneratedCode = '';
    this.isVisible = false;
    this.parentDialog = null;
    this.initialized = false;
    this.variableExecutionResults = new Map(); // Store results per variable
    this.instanceId = 'var_gen_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Initialize the operator generator
   */
  init() {
    if (this.initialized) {
      console.log('Variable Operator Generator already initialized');
      return;
    }
    
    console.log('Initializing Variable Operator Generator');
    this.initialized = true;
  }

  /**
   * Show the tool generator floating window
   */
  async show(variableData, parentDialog) {
    console.log(`[${this.instanceId}] Showing Variable Tool Generator for variable:`, variableData?.name);
    
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
    
    // Check for existing tools for this variable
    await this.checkAndLoadExistingTools();
    
    // Show the dialog
    this.generatorDialog.style.display = 'flex';
    this.isVisible = true;
    
    // Update variable info display
    this.updateVariableInfo();
    
    // Restore previous execution result if available
    this.restorePreviousExecutionResult();
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
        <div class="dialog-content variable-operator-generator-content">
          <div class="dialog-header">
            <h3>🔧 Generate Variable Tool & Operator</h3>
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
              <div class="code-editor" id="generated-code-editor" contenteditable="true" spellcheck="false" data-placeholder="Generated code will appear here..."></div>
              <div class="code-actions">
                <button class="btn-secondary" id="run-code-btn" data-action="run-code">
                  <span class="btn-icon">▶️</span>
                  Run Code
                </button>
              </div>
            </div>
            
            <div class="execution-result" id="execution-result-placeholder" style="display: none;">
              <h5>Execution Result:</h5>
              <div class="result-content" id="result-content-placeholder"></div>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="close-generator">Cancel</button>
            <button class="btn-success" id="save-tool-operator-btn" data-action="save-tool-operator">
              Save
            </button>
          </div>
        </div>
      </div>
    `;

    // Create dialog with document-specific IDs
    this.generatorDialog = createDocumentDialog('variable-operator-generator-dialog', dialogHtml, 'variable-operator-generator');
    this.generatorDialog.className = 'variable-operator-generator-dialog';
    this.generatorDialog.style.display = 'none';
    
    // Store references to execution result elements for this dialog
    this.executionResultElement = this.generatorDialog.querySelector('[id$="execution-result-placeholder"]');
    this.resultContentElement = this.generatorDialog.querySelector('[id$="result-content-placeholder"]');
    
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
      .variable-operator-generator-dialog,
      .variable-operator-generator-dialog .dialog-overlay {
        z-index: 20000 !important; /* Above all other dialogs including variable dialog (9999) */
      }
      
      .variable-operator-generator-content {
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
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
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
        min-height: 200px;
        max-height: 400px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        border: 1px solid #555;
        border-radius: 6px;
        padding: 10px 15px;
        outline: none;
        font-size: 14px;
        background: #1e1e1e;
        color: #e6e6e6;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        box-sizing: border-box;
      }
      
      .code-editor:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
      }
      
      .code-editor:empty:before {
        content: attr(data-placeholder);
        color: #888;
        font-style: italic;
        pointer-events: none;
      }
      
      .code-editor::selection {
        background: #007bff;
        color: white;
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
    if (!document.querySelector('#variable-operator-generator-styles')) {
      style.id = 'variable-operator-generator-styles';
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
      } else if (action === 'save-tool-operator') {
        this.saveToolAndOperator();
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
        const isOutsideClick = !e.target.closest('.variable-dialog') && !e.target.closest('.variable-operator-generator-dialog');
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
    // Setup contenteditable div handlers (similar to operators.js approach)
    const setupContentEditableHandlers = () => {
      const codeEditor = this.generatorDialog.querySelector('[id$="generated-code-editor"]');
      if (!codeEditor) return;
      
      // Update stored code when user edits (using innerHTML like operators.js)
      codeEditor.addEventListener('input', () => {
        this.generatedCode = codeEditor.innerHTML;
      });
      
      // Handle paste to preserve formatting
      codeEditor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const htmlText = text.replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, htmlText);
      });
    };
    
    // Setup handlers immediately if editor exists, or wait for it to be created
    setupContentEditableHandlers();
    
    // Also setup when dialog becomes visible
    const originalShow = this.show.bind(this);
    this.show = function(...args) {
      const result = originalShow(...args);
      setTimeout(setupContentEditableHandlers, 100); // Give time for DOM to update
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
    
    const nameEl = this.generatorDialog?.querySelector('[id$="generator-variable-name"]');
    const typeEl = this.generatorDialog?.querySelector('[id$="generator-variable-type"]');
    const descEl = this.generatorDialog?.querySelector('[id$="generator-variable-description"]');
    
    if (nameEl) nameEl.textContent = this.currentVariable.name || 'Unknown';
    if (typeEl) typeEl.textContent = this.currentVariable.type || 'text';
    if (descEl) descEl.textContent = this.currentVariable.description || 'No description';
  }

  /**
   * Populate data sources from data lake
   */
  async populateDataSources() {
    const dropdown = this.generatorDialog?.querySelector('[id$="generator-datasource-dropdown"]');
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
    // Store the selected data source
    this.selectedDataSource = selectedValue;
    
    // Enable generate code button if a source is selected
    const genBtn = this.generatorDialog.querySelector('[data-action="generate-code"]') ||
                   this.generatorDialog.querySelector('[id$="gen-code-btn"]') ||
                   this.generatorDialog.querySelector('button.btn-primary');
    
    if (genBtn) {
      genBtn.disabled = !selectedValue;
    }
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
        this.showGeneratedCode(result.code, true); // Clear previous results for newly generated code
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
    
    if (status) {
      status.style.display = show ? 'flex' : 'none';
    }
    
    if (genBtn) {
      genBtn.disabled = show;
      genBtn.innerHTML = show ? 'Generating...' : 'Generate Code';
    }
  }

  /**
   * Show generated code
   */
  showGeneratedCode(code, clearPreviousResults = false) {
    const codePreview = this.generatorDialog?.querySelector('[id$="code-preview"]');
    const codeEditor = this.generatorDialog?.querySelector('[id$="generated-code-editor"]');
    
    if (codePreview) codePreview.style.display = 'block';
    if (codeEditor) {
      // Convert newlines to <br> tags for contenteditable div (like operators.js)
      if (code && (code.includes('<br>') || code.includes('<div>') || code.includes('<p>'))) {
        codeEditor.innerHTML = code;
      } else {
        codeEditor.innerHTML = code ? code.replace(/\n/g, '<br>') : '';
      }
      // Store the original generated code
      this.originalGeneratedCode = code;
    }
    
    // Only clear execution results if explicitly requested (when new code is generated)
    if (clearPreviousResults) {
      if (this.executionResultElement) {
        this.executionResultElement.style.display = 'none';
      }
      // Clear stored execution result for this variable
      if (this.currentVariable?.name) {
        this.variableExecutionResults.delete(this.currentVariable.name);
      }
    }
  }

  /**
   * Run the generated code
   */
  async runCode() {
    const codeEditor = getDocumentElement('generated-code-editor');
    
    if (!codeEditor) {
      alert('Code editor not found.');
      return;
    }
    
    // Convert HTML back to plain text for execution (like operators.js convertHtmlCodeToPlainText)
    const htmlCode = codeEditor.innerHTML;
    const currentCode = this.convertHtmlCodeToPlainText(htmlCode).trim();
    
    if (!currentCode) {
      alert('No code to run. Generate code first.');
      return;
    }
    
    if (!this.selectedDataSource) {
      alert('Please select a data source first.');
      return;
    }
    
    // Update the stored generated code with current editor content
    this.generatedCode = htmlCode;
    
    // Show execution status
    this.showExecutionStatus('Running code...');
    
    try {
      // Execute code with isolated result handling
      const output = await this.executeCodeIsolated(currentCode, this.selectedDataSource, this.currentVariable.name);
      
      // Store the execution result for this specific variable
      this.variableExecutionResults.set(this.currentVariable.name, output);
      
      // Display the result in this specific dialog instance
      this.showExecutionResult(output);
      
    } catch (error) {
      console.error(`[${this.instanceId}] Error executing code:`, error);
      this.showExecutionResult(`Error: ${error.message}`, true);
    }
  }

  /**
   * Save tool, create/update operator, and save variable value
   */
  async saveToolAndOperator() {
    const codeEditor = getDocumentElement('generated-code-editor');
    
    if (!codeEditor) {
      alert('Code editor not found.');
      return;
    }
    
    // Get HTML code for storage and convert to plain text for execution
    const htmlCode = codeEditor.innerHTML;
    const currentCode = this.convertHtmlCodeToPlainText(htmlCode).trim();
    
    if (!currentCode) {
      alert('No code to save. Generate code first.');
      return;
    }
    
    if (!this.selectedDataSource) {
      alert('Please select a data source first.');
      return;
    }
    
    // Check if we're updating existing operator/tool or creating new ones
    const isUpdate = this.existingOperator && this.existingTool;
    
    const toolName = isUpdate ? this.existingTool.name : `gen_${this.currentVariable.name}`;
    const toolDescription = isUpdate ? this.existingTool.description : `Auto-generated tool for variable: ${this.currentVariable.name}`;
    const operatorName = isUpdate ? this.existingOperator.name : `op_${this.currentVariable.name}`;
    
    console.log(`${isUpdate ? 'Updating' : 'Creating'} tool and operator for variable:`, this.currentVariable.name);
    console.log('Data source:', this.selectedDataSource);
    console.log('Code length:', currentCode.length);
    
    try {
      // Get current document ID
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        throw new Error('No active document available');
      }
      
      console.log('Current document ID:', currentDocumentId);
      
      // Step 1: Save/update the tool
      console.log(`Step 1: ${isUpdate ? 'Updating' : 'Saving'} tool...`);
      if (isUpdate) {
        await this.updateExistingTool(this.existingTool.id, htmlCode, toolName, toolDescription, currentDocumentId);
      } else {
        await this.saveTool(htmlCode, toolName, toolDescription, currentDocumentId);
      }
      console.log('✓ Tool saved/updated successfully');
      
      // Step 2: Get the tool ID for the operator
      console.log('Step 2: Retrieving tool...');
      const savedTool = await this.getToolByName(toolName, currentDocumentId);
      if (!savedTool) {
        throw new Error('Failed to retrieve tool');
      }
      console.log('✓ Tool retrieved:', savedTool.id);
      
      // Step 3: Create/update the operator
      console.log(`Step 3: ${isUpdate ? 'Updating' : 'Creating'} operator...`);
      if (isUpdate) {
        await this.updateExistingOperator(this.existingOperator.id, savedTool, operatorName, currentDocumentId);
      } else {
        await this.createAndSaveOperator(savedTool, operatorName, currentDocumentId);
      }
      console.log('✓ Operator created/updated successfully');
      
      // Step 4: Execute the code directly and save the variable value
      console.log('Step 4: Executing code directly...');
      const executionResult = await this.executeOperatorAndSaveResult(operatorName, currentDocumentId);
      console.log('✓ Code executed, result:', executionResult);
      
      console.log(`Successfully completed all steps (${isUpdate ? 'update' : 'create'})`);      
      
      // Clear existing references
      this.existingOperator = null;
      this.existingTool = null;
      
      // Close the generator
      this.hide();
      
    } catch (error) {
      console.error('Error in saveToolAndOperator:', error);
      console.error('Error stack:', error.stack);
      alert('Error saving tool and operator: ' + error.message);
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return 'gen_tool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Convert HTML code back to plain text (similar to operators.js convertHtmlCodeToPlainText)
   */
  convertHtmlCodeToPlainText(htmlCode) {
    if (!htmlCode) return '';
    
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlCode;
    
    // Convert <br> tags to newlines and get text content
    const htmlWithNewlines = htmlCode.replace(/<br\s*\/?>/gi, '\n');
    tempDiv.innerHTML = htmlWithNewlines;
    
    return tempDiv.textContent || tempDiv.innerText || '';
  }

  /**
   * Execute code in isolation without affecting global UI elements
   */
  async executeCodeIsolated(code, dataSource, variableName) {
    console.log(`[${this.instanceId}] Executing code in isolation for variable: ${variableName}`);
    
    // Use the same execution method but ensure no global UI updates
    const result = await executeCodeForAuthorLocal(
      code, 
      dataSource, 
      variableName, 
      window.documentManager?.activeDocumentId || 'default'
    );
    
    console.log(`[${this.instanceId}] Isolated execution completed for ${variableName}: ${result}`);
    return result;
  }

  /**
   * Save the tool to tools.json
   */
  async saveTool(code, toolName, toolDescription, documentId) {
    console.log('Saving tool:', toolName);
    
    // Get current tools first
    let currentTools = [];
    if (window.toolsManager && window.toolsManager.tools) {
      currentTools = window.toolsManager.tools;
    }
    
    // Check if there's an existing tool for this variable
    const existingToolIndex = currentTools.findIndex(tool => 
      tool.generatedFor === this.currentVariable.name && 
      tool.autoGenerated && 
      tool.name === toolName
    );
    
    if (existingToolIndex !== -1) {
      // Update existing tool
      const existingTool = currentTools[existingToolIndex];
      console.log('Updating existing tool:', existingTool.id);
      
      currentTools[existingToolIndex] = {
        ...existingTool,
        code: code,
        updatedAt: new Date().toISOString(),
      };
      
      console.log('Tool updated successfully:', toolName);
    } else {
      // Create new tool
      const newTool = {
        id: this.generateId(),
        name: toolName,
        description: toolDescription,
        code: code,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedFor: this.currentVariable.name,
        autoGenerated: true
      };
      
      currentTools.push(newTool);
      console.log('Created new tool:', toolName);
    }
    
    // Save all tools
    const response = await fetch('http://127.0.0.1:5000/api/tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        documentId: documentId,
        tools: currentTools 
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to save tool');
    }
    
    // Update local tools manager if available
    if (window.toolsManager) {
      window.toolsManager.tools = currentTools;
    }
    
    console.log('Tool saved successfully');
  }

  /**
   * Update an existing tool
   */
  async updateExistingTool(toolId, code, toolName, toolDescription, documentId) {
    console.log('Updating existing tool:', toolId);
    
    // Get current tools first
    let currentTools = [];
    if (window.toolsManager && window.toolsManager.tools) {
      currentTools = window.toolsManager.tools;
    } else {
      // Fallback to API
      const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${documentId}`);
      const result = await response.json();
      if (result.success) {
        currentTools = result.tools || [];
      }
    }
    
    // Find and update the tool
    const toolIndex = currentTools.findIndex(tool => tool.id === toolId);
    if (toolIndex !== -1) {
      currentTools[toolIndex] = {
        ...currentTools[toolIndex],
        name: toolName,
        description: toolDescription,
        code: code,
        updatedAt: new Date().toISOString()
      };
      
      console.log('Tool updated in memory');
    } else {
      throw new Error(`Tool with ID ${toolId} not found`);
    }
    
    // Save all tools
    const response = await fetch('http://127.0.0.1:5000/api/tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        documentId: documentId,
        tools: currentTools 
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to update tool');
    }
    
    // Update local tools manager if available
    if (window.toolsManager) {
      window.toolsManager.tools = currentTools;
    }
    
    console.log('Tool updated successfully');
  }

  /**
   * Get tool by name from the saved tools
   */
  async getToolByName(toolName, documentId) {
    console.log('Getting tool by name:', toolName);
    
    // Try local tools manager first
    if (window.toolsManager && window.toolsManager.tools) {
      const tool = window.toolsManager.tools.find(t => t.name === toolName);
      if (tool) {
        return tool;
      }
    }
    
    // Fallback to API
    const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${documentId}`);
    const result = await response.json();
    
    if (result.success && result.tools) {
      const tool = result.tools.find(t => t.name === toolName);
      return tool || null;
    }
    
    return null;
  }

  /**
   * Create and save the operator instance
   */
  async createAndSaveOperator(tool, operatorName, documentId) {
    console.log('Creating operator:', operatorName, 'with tool:', tool.name);
    
    // Ensure operators are initialized
    if (!window.operatorManager) {
      console.log('Operator manager not found, initializing operators...');
      
      // Import and initialize operators module
      try {
        const operatorsModule = await import('./operators.js');
        if (operatorsModule.initOperators) {
          operatorsModule.initOperators();
          
          // Give it a moment to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error('Failed to import operators module:', error);
        throw new Error('Failed to initialize operators module');
      }
    }
    
    // Check if operator manager is now available
    if (!window.operatorManager) {
      throw new Error('Operator manager not available after initialization. Please ensure operators module is loaded.');
    }
    
    // Check if operator already exists for this variable
    const existingInstances = window.operatorManager.getCurrentDocumentInstances();
    let existingOperator = existingInstances.find(op => 
      op.name === operatorName || 
      (op.outputs && op.outputs.some(output => output.variable === this.currentVariable.name))
    );
    
    const operatorData = {
      name: operatorName,
      toolId: tool.id,
      toolName: tool.name,
      parameters: {
        data_source: {
          type: 'dataset',
          value: this.selectedDataSource
        }
      },
      outputs: [{
        config: 'output',
        variable: this.currentVariable.name
      }],
      documentId: documentId
    };
    
    if (existingOperator) {
      // Update existing operator
      console.log('Updating existing operator:', existingOperator.id);
      window.operatorManager.updateInstance(existingOperator.id, operatorData);
    } else {
      // Create new operator
      console.log('Creating new operator:', operatorName);
      window.operatorManager.createInstance(operatorData);
    }
    
    console.log('Operator saved successfully');
  }

  /**
   * Update an existing operator instance
   */
  async updateExistingOperator(operatorId, tool, operatorName, documentId) {
    console.log('Updating existing operator:', operatorId, 'with tool:', tool.name);
    
    // Ensure operators are initialized
    if (!window.operatorManager) {
      console.log('Operator manager not found, initializing operators...');
      
      // Import and initialize operators module
      try {
        const operatorsModule = await import('./operators.js');
        if (operatorsModule.initOperators) {
          operatorsModule.initOperators();
          
          // Give it a moment to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error('Failed to import operators module:', error);
        throw new Error('Failed to initialize operators module');
      }
    }
    
    // Check if operator manager is now available
    if (!window.operatorManager) {
      throw new Error('Operator manager not available after initialization. Please ensure operators module is loaded.');
    }
    
    const operatorData = {
      name: operatorName,
      toolId: tool.id,
      toolName: tool.name,
      parameters: {
        data_source: {
          type: 'dataset',
          value: this.selectedDataSource
        }
      },
      outputs: [{
        config: 'output',
        variable: this.currentVariable.name
      }],
      documentId: documentId
    };
    
    // Update the existing operator
    console.log('Updating operator with data:', operatorData);
    window.operatorManager.updateInstance(operatorId, operatorData);
    
    console.log('Operator updated successfully');
  }

  /**
   * Execute the code directly and save the result as variable value
   */
  async executeOperatorAndSaveResult(operatorName, documentId) {
    console.log('Executing code directly and saving result for:', this.currentVariable.name);
    
    const codeEditor = getDocumentElement('generated-code-editor');
    
    if (!codeEditor) {
      throw new Error('Code editor not found');
    }
    
    // Convert HTML to plain text for execution
    const htmlCode = codeEditor.innerHTML;
    const currentCode = this.convertHtmlCodeToPlainText(htmlCode).trim();
    
    if (!currentCode) {
      throw new Error('No code available for execution');
    }
    
    if (!this.selectedDataSource) {
      throw new Error('No data source selected');
    }
    
    // Execute the code directly using isolated execution
    console.log(`[${this.instanceId}] Executing code with data source:`, this.selectedDataSource);
    const executionResult = await this.executeCodeIsolated(currentCode, this.selectedDataSource, this.currentVariable.name);
    console.log('Direct execution result:', executionResult);
    
    // Store the execution result for this specific variable
    if (executionResult !== null && executionResult !== undefined) {
      this.variableExecutionResults.set(this.currentVariable.name, executionResult);
    }
    
    if (executionResult !== null && executionResult !== undefined && window.variablesManager) {
      console.log('✓ Conditions met, proceeding to save variables...');
      
      // Get the current variables
      await window.variablesManager.loadVariables();
      
      const variable = window.variablesManager.variables.get(this.currentVariable.name);
      if (variable) {
        variable.value = executionResult;
        variable.lastUpdated = new Date().toISOString();
        variable.extractedBy = operatorName;
        variable.dataSource = this.selectedDataSource;
        
        console.log('Saving updated variables...');
        // Save the updated variables
        await window.variablesManager.saveVariables();
        console.log('✓ Variable value saved:', this.currentVariable.name, '=', executionResult);
      } else {
        console.warn('❌ Variable not found in variables manager:', this.currentVariable.name);
        console.log('Available variables:', Array.from(window.variablesManager.variables.keys()));
      }
    }

    return executionResult;
  }

  /**
   * Check for existing tools and operators for this variable
   */
  async checkAndLoadExistingTools() {
    if (!this.currentVariable?.name) {
      console.log('No variable name provided, skipping tool check');
      return;
    }

    console.log('Checking for existing tools and operators for variable:', this.currentVariable.name);

    // Show loading indicator
    this.showLoadingIndicator('Checking for existing tools and operators...');

    try {
      // Get current document ID
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn('No active document available for tool check');
        this.hideLoadingIndicator();
        return;
      }

      // First check for existing operators that output to this variable
      let existingOperator = null;
      if (window.operatorManager) {
        const currentOperators = window.operatorManager.getCurrentDocumentInstances();
        existingOperator = currentOperators.find(op => 
          op.outputs && op.outputs.some(output => output.variable === this.currentVariable.name)
        );
      }

      if (existingOperator) {
        console.log('Found existing operator for variable:', existingOperator.name);
        this.showLoadingIndicator('Loading existing operator configuration...');
        await this.loadExistingOperator(existingOperator);
        return;
      }

      // If no operator found, check for auto-generated tools
      let existingTools = [];
      if (window.toolsManager && window.toolsManager.tools) {
        existingTools = window.toolsManager.tools;
      } else {
        // Fallback to API
        const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}`);
        const result = await response.json();
        if (result.success) {
          existingTools = result.tools || [];
        }
      }

      // Find tools generated for this variable
      const variableTools = existingTools.filter(tool => 
        tool.generatedFor === this.currentVariable.name && tool.autoGenerated
      );

      console.log(`Found ${variableTools.length} existing auto-generated tools for variable ${this.currentVariable.name}`);

      if (variableTools.length > 0) {
        // Load the most recent tool (latest updatedAt)
        const latestTool = variableTools.sort((a, b) => 
          new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
        )[0];
        
        console.log('Loading existing tool:', latestTool.name);
        this.showLoadingIndicator('Loading existing tool...');
        await this.loadExistingTool(latestTool);
      } else {
        console.log('No existing tools or operators found, showing empty form');
        this.resetToEmptyForm();
      }

    } catch (error) {
      console.error('Error checking for existing tools and operators:', error);
      // Continue with empty form if there's an error
      this.resetToEmptyForm();
    } finally {
      this.hideLoadingIndicator();
    }
  }

  /**
   * Show loading indicator
   */
  showLoadingIndicator(message) {
    // Add loading indicator to the variable info section
    const variableInfoSection = this.generatorDialog.querySelector('.variable-info-section');
    if (variableInfoSection) {
      let loadingDiv = variableInfoSection.querySelector('.loading-indicator');
      if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: #f0f7ff;
          border-radius: 4px;
          margin-top: 8px;
          font-size: 14px;
          color: #1976d2;
        `;
        variableInfoSection.appendChild(loadingDiv);
      }
      loadingDiv.innerHTML = `
        <span class="loading-spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid #e3f2fd; border-top: 2px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite;">
        </span>
        <span>${message}</span>
      `;
      loadingDiv.style.display = 'flex';
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoadingIndicator() {
    const loadingDiv = this.generatorDialog?.querySelector('.loading-indicator');
    if (loadingDiv) {
      loadingDiv.style.display = 'none';
    }
  }

  /**
   * Show execution status in this dialog instance
   */
  showExecutionStatus(message) {
    if (this.executionResultElement && this.resultContentElement) {
      this.executionResultElement.style.display = 'block';
      this.resultContentElement.innerHTML = `🔄 ${message}`;
      this.resultContentElement.style.color = '#1976d2';
    }
  }

  /**
   * Restore previous execution result when reopening dialog
   */
  restorePreviousExecutionResult() {
    if (!this.currentVariable?.name) {
      return;
    }
    
    // Get the execution result for this specific variable
    const variableResult = this.variableExecutionResults.get(this.currentVariable.name);
    
    if (variableResult !== null && variableResult !== undefined) {
      this.showExecutionResult(variableResult, false);
    }
  }

  /**
   * Show execution result in this dialog instance
   */
  showExecutionResult(result, isError = false) {
    if (this.executionResultElement && this.resultContentElement) {
      this.executionResultElement.style.display = 'block';
      
      // Simple, clean display
      if (isError) {
        this.resultContentElement.innerHTML = `❌ ${result}`;
        this.resultContentElement.style.color = '#d32f2f';
      } else {
        this.resultContentElement.innerHTML = `✅ ${String(result)}`;
        this.resultContentElement.style.color = '#2e7d32';
      }
    }
  }

  /**
   * Load an existing operator into the generator
   */
  async loadExistingOperator(operator) {
    console.log('Loading existing operator data:', operator);

    try {
      // Get the tool associated with this operator
      let tool = null;
      if (window.toolsManager && window.toolsManager.tools) {
        tool = window.toolsManager.tools.find(t => t.id === operator.toolId);
      }
      
      if (!tool) {
        // Fallback to API
        const currentDocumentId = window.documentManager?.activeDocumentId;
        const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}`);
        const result = await response.json();
        if (result.success) {
          const tools = result.tools || [];
          tool = tools.find(t => t.id === operator.toolId);
        }
      }

      if (tool) {
        // Show the code preview section with existing code
        this.showGeneratedCode(tool.code, false); // Don't clear previous results for existing code

        // Extract data source from operator parameters
        let dataSource = null;
        if (operator.parameters && operator.parameters.data_source) {
          if (typeof operator.parameters.data_source === 'object') {
            dataSource = operator.parameters.data_source.value;
          } else {
            dataSource = operator.parameters.data_source;
          }
        }

        if (dataSource) {
          // Set the data source dropdown
          const dropdown = this.generatorDialog?.querySelector('[id$="generator-datasource-dropdown"]');
          if (dropdown) {
            // Find matching option and select it
            for (let option of dropdown.options) {
              if (option.value === dataSource) {
                dropdown.value = dataSource;
                this.selectDataSource(dataSource);
                break;
              }
            }
          }
        }

        // Update the dialog title to indicate editing
        const header = this.generatorDialog.querySelector('.dialog-header h3');
        if (header) {
          header.innerHTML = `🔧 Edit Existing Operator: ${operator.name}`;
        }

        // Change button text to indicate regeneration
        const generateBtn = this.generatorDialog.querySelector('[data-action="generate-code"]');
        if (generateBtn && dataSource) {
          generateBtn.textContent = 'Regenerate Code';
          generateBtn.disabled = false;
        }

        // Change save button text to indicate update mode
        const saveBtn = this.generatorDialog.querySelector('[data-action="save-tool-operator"]');
        if (saveBtn) {
          saveBtn.innerHTML = 'Update Tool & Operator';
        }

        // Store reference to existing operator for update
        this.existingOperator = operator;
        this.existingTool = tool;

        // Try to load the current variable value as the execution result
        await this.loadCurrentVariableValue();

      } else {
        console.error('Could not find tool for operator:', operator.toolId);
        this.resetToEmptyForm();
      }

    } catch (error) {
      console.error('Error loading existing operator:', error);
      this.resetToEmptyForm();
    }
  }

  /**
   * Load an existing tool into the generator
   */
  async loadExistingTool(tool) {
    console.log('Loading existing tool data:', tool);

    // Show the code preview section with existing code
    this.showGeneratedCode(tool.code, false); // Don't clear previous results for existing code

    // Try to extract data source information from the code
    const extractedDataSource = this.extractDataSourceFromCode(tool.code);
    if (extractedDataSource) {
      // Set the data source dropdown
      const dropdown = this.generatorDialog?.querySelector('[id$="generator-datasource-dropdown"]');
      if (dropdown) {
        // Find matching option and select it
        for (let option of dropdown.options) {
          if (option.value === extractedDataSource) {
            dropdown.value = extractedDataSource;
            this.selectDataSource(extractedDataSource);
            break;
          }
        }
      }
    }

    // Update the dialog title to indicate editing
    const header = this.generatorDialog.querySelector('.dialog-header h3');
    if (header) {
      header.innerHTML = `🔧 Edit Tool & Operator for Variable: ${this.currentVariable.name}`;
    }

    // Change button text to indicate regeneration
    const generateBtn = this.generatorDialog.querySelector('[data-action="generate-code"]');
    if (generateBtn && extractedDataSource) {
      generateBtn.textContent = 'Regenerate Code';
      generateBtn.disabled = false;
    }

    // Change save button text to indicate update mode
    const saveBtn = this.generatorDialog.querySelector('[data-action="save-tool-operator"]');
    if (saveBtn) {
      saveBtn.innerHTML = 'Save';
    }

    // Store reference to existing tool for update
    this.existingTool = tool;
  }

  /**
   * Extract data source from existing code
   */
  extractDataSourceFromCode(code) {
    try {
      // Convert HTML code to plain text first (in case it's stored in HTML format)
      const plainTextCode = this.convertHtmlCodeToPlainText(code);
      
      // Look for common patterns in the generated code
      // Pattern 1: pd.read_csv('filename')
      const csvMatch = plainTextCode.match(/pd\.read_csv\(['"]([^'"]+)['"]\)/);
      if (csvMatch) {
        return csvMatch[1];
      }

      // Pattern 2: pd.read_csv(data_source) where data_source is parameters['data_source']
      const paramMatch = plainTextCode.match(/parameters\['data_source'\]/);
      if (paramMatch) {
        // We know it uses parameters, but we need to check which data source was used
        // This is harder to extract automatically, so we'll just return null for now
        return null;
      }

      // Add more patterns as needed
      return null;
    } catch (error) {
      console.error('Error extracting data source from code:', error);
      return null;
    }
  }

  /**
   * Load the current variable value as execution result
   */
  async loadCurrentVariableValue() {
    if (!this.currentVariable?.name) {
      return;
    }

    try {
      // Get the current variable value from variables manager
      if (window.variablesManager) {
        await window.variablesManager.loadVariables();
        const variable = window.variablesManager.variables.get(this.currentVariable.name);
        
        if (variable && variable.value !== null && variable.value !== undefined) {
          // Store as execution result for this variable
          this.variableExecutionResults.set(this.currentVariable.name, variable.value);
        }
      }
    } catch (error) {
      console.error(`Error loading current variable value:`, error);
    }
  }

  /**
   * Reset the form to empty state for new tool generation
   */
  resetToEmptyForm() {
    console.log('Resetting to empty form for new tool generation');

    // Hide code preview
    const codePreview = this.generatorDialog?.querySelector('[id$="code-preview"]');
    if (codePreview) {
      codePreview.style.display = 'none';
    }

    // Hide execution result in this specific dialog instance
    const executionResult = document.getElementById(this.executionResultId);
    if (executionResult) {
      executionResult.style.display = 'none';
    }

    // Reset dropdown to default
    const dropdown = this.generatorDialog?.querySelector('[id$="generator-datasource-dropdown"]');
    if (dropdown) {
      dropdown.value = '';
    }

    // Reset generate button
    const generateBtn = this.generatorDialog?.querySelector('[data-action="generate-code"]');
    if (generateBtn) {
      generateBtn.textContent = 'Generate Code';
      generateBtn.disabled = true;
    }

    // Reset save button
    const saveBtn = this.generatorDialog?.querySelector('[data-action="save-tool-operator"]');
    if (saveBtn) {
      saveBtn.innerHTML = 'Save';
    }

    // Reset dialog title
    const header = this.generatorDialog?.querySelector('.dialog-header h3');
    if (header) {
      header.innerHTML = '🔧 Generate Variable Tool & Operator';
    }

    // Clear stored code and references
    this.generatedCode = '';
    this.originalGeneratedCode = '';
    this.selectedDataSource = null;
    this.existingOperator = null;
    this.existingTool = null;
    // Clear all variable execution results on complete reset
    this.variableExecutionResults.clear();
  }
}

// Create and export singleton instance
export const variableToolGenerator = new VariableOperatorGenerator();

// Expose to window for global access across document switches
window.variableToolGenerator = variableToolGenerator;

export default variableToolGenerator; 