// Variables Management Module
import { state, elements, updateState } from './state.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';
import { variableToolGenerator } from './variable-operator-generator.js';

/**
 * Variables Management System
 * Handles text selection, variable creation, and persistence
 */
class VariablesManager {
  constructor() {
    this.variables = new Map();
    this.isSelectionMode = false;
    this.floatingButton = null;
    this.variableDialog = null;
    this.variablesPanel = null;
    this.selectedText = null;
    this.selectedRange = null;
    this.variableCounter = 0;
    this.currentSuggestion = null;
    this.initialized = false;
  }

  /**
   * Initialize the variables management system
   */
  init() {
    if (this.initialized) {
      console.log('Variables Manager already initialized');
      return;
    }
    
    console.log('Initializing Variables Manager');
    
    try {
      this.createFloatingButton();
      console.log('✓ Floating button created');
      
      this.setupVariablesEventListeners();
      console.log('✓ Variables event listeners setup');
      
      this.setupTextSelection();
      console.log('✓ Text selection setup complete');
      
      // Initialize variable tool generator
      variableToolGenerator.init();
      console.log('✓ Variable tool generator initialized');
      
      // Note: Dialogs are created lazily when needed to ensure document context
      console.log('✓ Dialogs will be created when needed (lazy loading)');
      
      this.initialized = true;
      console.log('Variables Manager initialization complete');
    } catch (error) {
      console.error('Error during Variables Manager initialization:', error);
    }
  }

  /**
   * Create the floating "Suggest Variables" button
   */
  createFloatingButton() {
    console.log('Creating floating button...');
    
    this.floatingButton = document.createElement('div');
    this.floatingButton.className = 'floating-variable-button';
    this.floatingButton.innerHTML = '<button class="suggest-variables-btn">🔧 Suggest Variables</button>';
    this.floatingButton.style.display = 'none';
    this.floatingButton.style.position = 'absolute';
    this.floatingButton.style.zIndex = '10000';
    
    document.body.appendChild(this.floatingButton);
    console.log('Floating button added to DOM');

    const suggestBtn = this.floatingButton.querySelector('.suggest-variables-btn');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        console.log('Suggest Variables button clicked');
        this.showVariableDialog();
      });
      console.log('Event listener added to suggest button');
    } else {
      console.error('Could not find suggest variables button inside floating button');
    }
  }

  /**
   * Setup text selection detection
   */
  setupTextSelection() {
    document.addEventListener('mouseup', (e) => {

      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      // if the is not in the template editor, return
      if (!this.isInTemplateContent(selection) || selectedText.length === 0) {
        this.hideFloatingButton();
        return;
      }
      
      setTimeout(() => {
        this.handleTextSelection(e);
      }, 10);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.floating-variable-button') && 
          !e.target.closest('.variable-dialog')) {
        this.hideFloatingButton();
      }
    });
  }

  /**
   * Handle text selection events
   */
  handleTextSelection(e) {
    // Skip processing if no active document
    if (!window.documentManager?.activeDocumentId) {
      return;
    }
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText.length > 0 && selection.rangeCount > 0) {
      const isInTemplate = this.isInTemplateContent(selection);
      console.log('Is in template content:', isInTemplate);
      
      if (isInTemplate) {
        this.selectedText = selectedText;
        this.selectedRange = selection.getRangeAt(0).cloneRange();
        
        this.showFloatingButton(e);
      } else {
        this.hideFloatingButton();
      }
    } else {
      this.hideFloatingButton();
    }
  }

  /**
   * Check if selection is within template content
   */
  isInTemplateContent(selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Try multiple ways to find the template editor
    const templateEditor1 = document.getElementById('template-editor');
    const templateEditor2 = document.querySelector('.template-editor');
    const templateEditor3 = elements.templateEditor;
    
    const templateEditor = templateEditor1 || templateEditor2 || templateEditor3;
    
    const previewContent = document.getElementById('preview-content') ||
                          document.querySelector('.preview-content') ||
                          elements.previewContent;
    
    // For text nodes, check the parent element
    let elementToCheck = container;
    if (container.nodeType === Node.TEXT_NODE) {
      elementToCheck = container.parentElement;
    }
    
    // Let's also check the element hierarchy
    let currentElement = elementToCheck;
    let foundInTemplate = false;
    let foundInPreview = false;
    let hierarchy = [];
    
    while (currentElement && currentElement !== document.body) {
      hierarchy.push({
        nodeName: currentElement.nodeName,
        className: currentElement.className,
        id: currentElement.id
      });
      
      if (templateEditor && currentElement === templateEditor) {
        foundInTemplate = true;
      }
      if (previewContent && currentElement === previewContent) {
        foundInPreview = true;
      }
      
      currentElement = currentElement.parentElement;
    }
    
    const templateEditorContains = templateEditor ? templateEditor.contains(elementToCheck) : false;
    const previewContentContains = previewContent ? previewContent.contains(elementToCheck) : false;
    
    // Try using closest() method as a more reliable check
    const isInTemplateByClosest = elementToCheck ? elementToCheck.closest('.template-editor') !== null : false;
    const isInPreviewByClosest = elementToCheck ? elementToCheck.closest('.preview-content') !== null : false;
    
    return templateEditorContains || previewContentContains || foundInTemplate || foundInPreview || isInTemplateByClosest || isInPreviewByClosest;
  }

  /**
   * Show floating button positioned near selection
   */
  showFloatingButton(mouseEvent) {
    if (!this.floatingButton) {
      console.error('Floating button not found!');
      return;
    }
    
    const x = mouseEvent.clientX;
    const y = mouseEvent.clientY;
    
    this.floatingButton.style.left = `${x + 10}px`;
    this.floatingButton.style.top = `${y - 40}px`;
    this.floatingButton.style.display = 'block';
  }

  /**
   * Hide floating button
   */
  hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.style.display = 'none';
    }
  }

  /**
   * Create variable creation dialog with document-specific IDs
   */
  createVariableDialog() {
    const dialogHtml = `
      <div class="dialog-overlay">
        <div class="dialog-content">
          <div class="dialog-header">
            <h3>✨ Create Variable</h3>
            <div class="ai-indicator" id="variable-ai-indicator" style="display: none;">
              <span class="ai-spinner">🤖</span>
              <span class="ai-text">AI is analyzing...</span>
            </div>
            <div class="header-actions">
              <button class="tool-generator-btn" data-action="open-tool-generator" title="Generate Tool for Variable">🔧</button>
              <button class="close-btn" data-action="close">×</button>
            </div>
          </div>
          
          <div class="selected-text-preview">
            <label>Selected Text:</label>
            <div class="selected-text-display"></div>
          </div>
          
          <div class="variable-form">
            <div class="form-group">
              <label for="variable-name">Variable Name:</label>
              <input type="text" id="variable-name" placeholder="e.g., q1_revenue">
            </div>
            
            <div class="form-group">
              <label for="variable-description">Description:</label>
              <input type="text" id="variable-description" placeholder="e.g., Q1 Revenue Amount">
            </div>
            
            <div class="form-group">
              <label for="variable-type">Data Type:</label>
              <select id="variable-type">
                <option value="currency">Currency</option>
                <option value="number">Number</option>
                <option value="percentage">Percentage</option>
                <option value="date">Date</option>
                <option value="text">Text</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="variable-format">Format:</label>
              <input type="text" id="variable-format" placeholder="e.g., $#,##0">
            </div>
            
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="variable-required" checked>
                Required Variable
              </label>
            </div>
          </div>
          
          <div class="variable-value-section">
            <h4>Variable Value</h4>
            <div class="value-display-container">
              <div class="value-display no-value" id="variable-value-display">
                Click to set value
              </div>
              <div class="value-input-container" style="display: none;">
                <input type="text" class="value-input" id="variable-value-input" placeholder="Enter value...">
                <div class="value-input-actions">
                  <button class="save-value-btn" id="save-variable-value">Save</button>
                  <button class="cancel-value-btn" id="cancel-variable-value">Cancel</button>
                </div>
              </div>
            </div>
            <div class="value-actions">
              <div class="data-source-selector">
                <label for="data-source-select">📊 Select Data Source:</label>
                <select id="data-source-select" class="data-source-select">
                  <option value="">-- Select a data source --</option>
                  <option value="manual">📝 Manual Input</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="cancel">Cancel</button>
            <button class="btn-primary" data-action="add-variable">Add Variable</button>
          </div>
        </div>
      </div>
    `;

    // Create dialog with document-specific IDs (all IDs in HTML will be auto-prefixed)
    this.variableDialog = createDocumentDialog('variable-dialog', dialogHtml, 'variables');
    this.variableDialog.className = 'variable-dialog';
    this.variableDialog.style.display = 'none';
    
    // Add to body for global access
    document.body.appendChild(this.variableDialog);

    this.variableDialog.addEventListener('click', async (e) => {
      if (e.target.classList.contains('dialog-overlay')) {
        this.hideVariableDialog();
      }
      
      const action = e.target.getAttribute('data-action');
      if (action === 'close' || action === 'cancel') {
        this.hideVariableDialog();
      } else if (action === 'add-variable') {
        this.createVariable();
      } else if (action === 'update-variable') {
        const variableName = e.target.getAttribute('data-variable-name');
        this.updateVariable(variableName);
      } else if (action === 'open-tool-generator') {
        await this.openToolGenerator();
      }
      
             // Handle value setting in dialog (using document-specific element IDs)
       const elementId = e.target.id;
       const activeDocId = window.documentManager?.activeDocumentId;
       
       if (elementId && activeDocId) {
         if (elementId.includes('variable-value-display')) {
           console.log('Variable value display clicked');
           this.startValueEditingInDialog();
         } else if (elementId.includes('save-variable-value')) {
           console.log('Save variable value clicked');
           await this.saveVariableValueInDialog();
         } else if (elementId.includes('cancel-variable-value')) {
           console.log('Cancel variable value clicked');
           this.cancelValueEditingInDialog();

                  }
       }
     });

     // Add change event listener for data source select
     this.variableDialog.addEventListener('change', async (e) => {
       const elementId = e.target.id;
       if (elementId && elementId.includes('data-source-select')) {
         console.log('Data source select changed:', e.target.value);
         await this.handleDataSourceChange(e.target.value);
       }
     });
   }

  /**
   * Set up Variables event listeners using event delegation
   */
  setupVariablesEventListeners() {
    // Listen for Variables buttons (using event delegation like Data Sources)
    document.addEventListener('click', async (event) => {
      if (event.target.matches('.variables-btn') || event.target.closest('.variables-btn')) {
        console.log('Variables button clicked');
        event.preventDefault();
        event.stopPropagation();
        await this.showVariablesPanel();
      }
    });
  }

  /**
   * Create Variables panel dialog with document-specific IDs
   */
  createVariablesPanelDialog() {
    const panelHtml = `
      <div class="dialog-overlay">
        <div class="dialog-content variables-panel-content">
          <div class="dialog-header">
            <h3>📊 Template Variables</h3>
            <button class="close-btn" data-action="close-panel">×</button>
          </div>
          
          <div class="variables-list" id="variables-list">
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="close-panel">Close</button>
          </div>
        </div>
      </div>
    `;
    
    // Debug: Log what document ID we're using
    const currentDocId = window.documentManager?.activeDocumentId;
    console.log('Creating variables panel for document:', currentDocId);
    
    // Create panel with document-specific IDs
    this.variablesPanel = createDocumentDialog('variables-panel-dialog', panelHtml, 'variables');
    this.variablesPanel.className = 'variables-panel-dialog';
    this.variablesPanel.style.display = 'none';
    
    // Debug: Check what IDs were actually created
    console.log('Variables panel dialog ID:', this.variablesPanel.id);
    const listElement = this.variablesPanel.querySelector('[id*="variables-list"]');
    const msgElement = this.variablesPanel.querySelector('[id*="no-variables-message"]');
    console.log('Found list element:', listElement?.id);
    console.log('Found message element:', msgElement?.id);
    
    // Add to body for global access
    document.body.appendChild(this.variablesPanel);

    this.variablesPanel.addEventListener('click', async (e) => {
      if (e.target.classList.contains('dialog-overlay') || 
          e.target.getAttribute('data-action') === 'close-panel') {
        this.hideVariablesPanel();
      }
      
      // Handle edit variable button
      if (e.target.classList.contains('edit-variable-btn')) {
        const variableName = e.target.getAttribute('data-variable-name');
        await this.editVariable(variableName);
      }
      
      // Handle generate tool button
      if (e.target.classList.contains('generate-tool-btn')) {
        const variableName = e.target.getAttribute('data-variable-name');
        await this.generateToolForVariable(variableName);
      }
      
      // Handle remove variable button
      if (e.target.classList.contains('remove-variable-btn')) {
        const variableName = e.target.getAttribute('data-variable-name');
        this.removeVariable(variableName);
      }
      

    });
  }

  /**
   * Populate variable suggestions based on selected text
   */
  async populateVariableSuggestions() {
    if (!this.selectedText) return;

    // Show loading state
    this.showLoadingInDialog();

    try {
      // Get LLM recommendations
      const llmSuggestions = await this.getLLMVariableSuggestions();
      
      if (llmSuggestions) {
        this.fillDialogWithSuggestions(llmSuggestions);
      } else {
        // Fallback to basic suggestions if LLM fails
        const basicSuggestions = this.generateVariableSuggestions(this.selectedText);
        this.fillDialogWithSuggestions(basicSuggestions);
      }
    } catch (error) {
      console.error('Error getting LLM suggestions:', error);
      // Fallback to basic suggestions
      console.log('Using fallback suggestions for:', this.selectedText);
      const basicSuggestions = this.generateVariableSuggestions(this.selectedText);
      console.log('Generated basic suggestions:', basicSuggestions);
      this.fillDialogWithSuggestions(basicSuggestions);
    } finally {
      this.hideLoadingInDialog();
    }
  }

  /**
   * Get LLM-powered variable suggestions
   */
  async getLLMVariableSuggestions() {
    try {
      // Get template content from current document
      const templateContent = this.getTemplateContent();
      
      const requestData = {
        template_content: templateContent,
        selected_text: this.selectedText,
        existing_variables: this.getVariables(),
        document_id: window.documentManager?.activeDocumentId || 'default'
      };

      const response = await fetch('http://127.0.0.1:5000/api/suggest-variable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.suggestion) {
        return result.suggestion;
      } else {
        console.warn('LLM suggestion failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error calling LLM suggestion API:', error);
      return null;
    }
  }

  /**
   * Get current template content from active document
   */
  getTemplateContent() {
    // Get template editor from active document
    const activeDocument = document.querySelector('.tab-content.active');
    let templateEditor = null;
    
    if (activeDocument) {
      templateEditor = activeDocument.querySelector('.template-editor');
    }
    
    // Fallback to global search
    if (!templateEditor) {
      templateEditor = document.querySelector('.template-editor') || 
                      document.getElementById('template-editor') ||
                      elements.templateEditor;
    }
    
    if (templateEditor) {
      return templateEditor.textContent || templateEditor.innerText || '';
    }
    
    return '';
  }

  /**
   * Fill dialog with suggestions (from LLM or basic)
   */
  fillDialogWithSuggestions(suggestions) {
    if (!this.variableDialog || !suggestions) return;
    
    // Store the current suggestion for later use in form data
    this.currentSuggestion = suggestions;
    
    const nameInput = getDocumentElement('variable-name');
    const descInput = getDocumentElement('variable-description');
    const typeSelect = getDocumentElement('variable-type');
    const formatInput = getDocumentElement('variable-format');
    
    if (nameInput) nameInput.value = suggestions.name || '';
    if (descInput) descInput.value = suggestions.description || '';
    if (typeSelect) typeSelect.value = suggestions.type || 'text';
    if (formatInput) formatInput.value = suggestions.format || '';
    
    // Log smart replacement info if available
    if (suggestions.value_to_replace) {
      console.log('Smart replacement suggestion:', {
        fullSelection: this.selectedText,
        valueToReplace: suggestions.value_to_replace,
        staticPrefix: suggestions.static_prefix || '(none)',
        staticSuffix: suggestions.static_suffix || '(none)'
      });
    }
  }

  /**
   * Show loading state in dialog - Updated to use document-specific IDs
   */
  showLoadingInDialog() {
    if (!this.variableDialog) return;
    
    // Show AI indicator using document-specific getter
    const aiIndicator = getDocumentElement('variable-ai-indicator');
    if (aiIndicator) {
      aiIndicator.style.display = 'flex';
    }
    
    const nameInput = getDocumentElement('variable-name');
    const descInput = getDocumentElement('variable-description');
    const typeSelect = getDocumentElement('variable-type');
    const formatInput = getDocumentElement('variable-format');
    
    if (nameInput) {
      nameInput.value = 'Generating suggestions...';
      nameInput.disabled = true;
    }
    if (descInput) {
      descInput.value = 'AI is analyzing your selection...';
      descInput.disabled = true;
    }
    if (typeSelect) typeSelect.disabled = true;
    if (formatInput) formatInput.disabled = true;
  }

  /**
   * Hide loading state in dialog - Updated to use document-specific IDs
   */
  hideLoadingInDialog() {
    if (!this.variableDialog) return;
    
    // Hide AI indicator using document-specific getter
    const aiIndicator = getDocumentElement('variable-ai-indicator');
    if (aiIndicator) {
      aiIndicator.style.display = 'none';
    }
    
    const nameInput = getDocumentElement('variable-name');
    const descInput = getDocumentElement('variable-description');
    const typeSelect = getDocumentElement('variable-type');
    const formatInput = getDocumentElement('variable-format');
    
    if (nameInput) nameInput.disabled = false;
    if (descInput) descInput.disabled = false;
    if (typeSelect) typeSelect.disabled = false;
    if (formatInput) formatInput.disabled = false;
  }

  /**
   * Generate intelligent variable suggestions
   */
  generateVariableSuggestions(text) {
    const suggestions = {
      name: '',
      description: '',
      type: 'text',
      format: ''
    };

    if (text.match(/\$[\d,]+\.?\d*/)) {
      suggestions.type = 'currency';
      suggestions.format = '$#,##0';
      suggestions.name = this.generateVariableName('revenue');
      suggestions.description = 'Revenue Amount';
    } else if (text.match(/\d+\.?\d*%/)) {
      suggestions.type = 'percentage';
      suggestions.format = '0.0%';
      suggestions.name = this.generateVariableName('rate');
      suggestions.description = 'Percentage Rate';
    } else if (text.match(/^\d{1,3}(,\d{3})*\.?\d*$/)) {
      suggestions.type = 'number';
      suggestions.format = '#,##0';
      suggestions.name = this.generateVariableName('count');
      suggestions.description = 'Numeric Value';
    } else {
      suggestions.type = 'text';
      suggestions.name = this.generateVariableName('text');
      suggestions.description = 'Text Content';
    }

    return suggestions;
  }

  /**
   * Generate unique variable name
   */
  generateVariableName(base) {
    let counter = 1;
    let name = base;
    
    while (this.variables.has(name)) {
      name = `${base}_${counter}`;
      counter++;
    }
    
    return name;
  }

  /**
   * Show/hide dialogs
   */
  showVariableDialog(isEditing = false) {
    console.log('showVariableDialog called for text:', this.selectedText, 'isEditing:', isEditing);
    
    // Check if the current dialog reference is valid (still in DOM)
    const dialogExists = this.variableDialog && document.body.contains(this.variableDialog);
    
    // Create dialog if it doesn't exist or if it's been removed from DOM
    if (!this.variableDialog || !dialogExists) {
      console.log('Creating variable dialog lazily...');
      
      // Clear stale reference if it exists but not in DOM
      if (this.variableDialog && !dialogExists) {
        console.log('Clearing stale variable dialog reference');
        this.variableDialog = null;
      }
      
      this.createVariableDialog();
    }
    
    if (!this.variableDialog) {
      console.error('Variable dialog could not be created!');
      return;
    }
    
    const textDisplay = this.variableDialog.querySelector('.selected-text-display');
    if (textDisplay && this.selectedText) {
      textDisplay.textContent = `"${this.selectedText}"`;
      console.log('Set selected text display to:', this.selectedText);
    }
    
    // If we're in editing mode, populate the form with existing variable data
    if (isEditing && this._editingVariable && this._editingVariableName) {
      console.log('Populating dialog for editing variable:', this._editingVariableName);
      // Use setTimeout to ensure DOM elements are ready after dialog creation
      setTimeout(() => {
        this.populateEditForm(this._editingVariable, this._editingVariableName);
      }, 0);
    }
    
    this.variableDialog.style.display = 'flex';
    this.hideFloatingButton();
    console.log('Variable dialog should now be visible');

    // Populate data source select
    this.populateDataSourceSelect();

    // Only call LLM suggestions when creating a new variable, not when editing
    if (!isEditing) {
      console.log('Calling AI suggestions for new variable');
      this.populateVariableSuggestions();
    } else {
      console.log('Skipping AI suggestions - editing existing variable');
    }
  }

  hideVariableDialog() {
    if (this.variableDialog) {
      this.variableDialog.style.display = 'none';
      // Reset dialog to create mode when closed
      this.resetDialogToCreateMode();
    }
  }

  async showVariablesPanel() {
    console.log('showVariablesPanel called');
    
    // Check if the current panel reference is valid (still in DOM)
    const panelExists = this.variablesPanel && document.body.contains(this.variablesPanel);
    
    // Create panel if it doesn't exist or if it's been removed from DOM
    if (!this.variablesPanel || !panelExists) {
      console.log('Creating variables panel lazily...');
      
      // Clear stale reference if it exists but not in DOM
      if (this.variablesPanel && !panelExists) {
        console.log('Clearing stale variables panel reference');
        this.variablesPanel = null;
      }
      
      // IMPORTANT: Remove any existing variables panels to prevent duplicate IDs
      const existingPanels = document.querySelectorAll('.variables-panel-dialog');
      existingPanels.forEach((panel, index) => {
        console.log(`Removing existing variables panel ${index}: ${panel.id}`);
        panel.remove();
      });
      
      this.createVariablesPanelDialog();
    }
    
    if (!this.variablesPanel) {
      console.error('Variables panel could not be created!');
      return;
    }
    
    // Load latest variables from backend before showing
    console.log('Loading latest variables from backend before showing panel...');
    await this.refreshVariablesFromBackend();
    
    this.updateVariablesList();
    this.variablesPanel.style.display = 'flex';
  }

  hideVariablesPanel() {
    if (this.variablesPanel) {
      this.variablesPanel.style.display = 'none';
    }
  }

  /**
   * Create variable from dialog form
   */
  createVariable() {
    if (!this.variableDialog) return;
    
    const formData = this.getVariableFormData();
    if (!this.validateVariableForm(formData)) {
      return;
    }
    
    const variable = {
      id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      required: formData.required,
      originalText: this.selectedText,
      placeholder: `{{${formData.name}}}`,
      createdAt: new Date().toISOString(),
      // Add smart replacement fields if available from LLM suggestions
      value_to_replace: formData.value_to_replace || this.selectedText,
      static_prefix: formData.static_prefix || '',
      static_suffix: formData.static_suffix || ''
    };
    
    // Add value if set in dialog
    if (this._temporaryValue) {
      variable.value = this._temporaryValue;
    }
    
    this.variables.set(variable.name, variable);
    this.replaceSelectedTextWithPlaceholder(variable);
    this.saveVariables();
    this.updateVariablesUI();
    this.hideVariableDialog();
    
    console.log('Variable created:', variable);
  }

  /**
   * Form handling methods - Updated to use document-specific element IDs
   */
  getVariableFormData() {
    if (!this.variableDialog) return {};
    
    // Use document-specific element getters
    const nameInput = getDocumentElement('variable-name');
    const descInput = getDocumentElement('variable-description');
    const typeSelect = getDocumentElement('variable-type');
    const formatInput = getDocumentElement('variable-format');
    const requiredCheckbox = getDocumentElement('variable-required');
    
    return {
      name: nameInput?.value?.trim() || '',
      description: descInput?.value?.trim() || '',
      type: typeSelect?.value || 'text',
      format: formatInput?.value?.trim() || '',
      required: requiredCheckbox?.checked || false,
      // Include smart replacement fields from current LLM suggestion
      value_to_replace: this.currentSuggestion?.value_to_replace || this.selectedText,
      static_prefix: this.currentSuggestion?.static_prefix || '',
      static_suffix: this.currentSuggestion?.static_suffix || ''
    };
  }

  validateVariableForm(formData, isUpdate = false, originalVariableName = null) {
    if (!formData.name) {
      alert('Variable name is required');
      return false;
    }
    
    // For updates, only check for duplicate names if the name has changed
    if (isUpdate) {
      if (formData.name !== originalVariableName && this.variables.has(formData.name)) {
        alert('Variable name already exists');
        return false;
      }
    } else {
      // For new variables, always check for duplicates
      if (this.variables.has(formData.name)) {
        alert('Variable name already exists');
        return false;
      }
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formData.name)) {
      alert('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return false;
    }
    
    return true;
  }

  /**
   * Replace selected text with variable placeholder
   */
  replaceSelectedTextWithPlaceholder(variable) {
    if (!this.selectedRange) return;
    
    console.log('replaceSelectedTextWithPlaceholder called with:', {
      originalText: variable.originalText,
      value_to_replace: variable.value_to_replace,
      static_prefix: variable.static_prefix,
      static_suffix: variable.static_suffix,
      placeholder: variable.placeholder
    });
    
    try {
      // Check if we have smart replacement info from LLM
      if (variable.value_to_replace && variable.value_to_replace !== variable.originalText) {
        // Smart replacement: only replace the value part, keep static text
        const originalText = this.selectedRange.toString();
        
        // Verify the parts match the original selection
        const expectedText = (variable.static_prefix || '') + variable.value_to_replace + (variable.static_suffix || '');
        
        // Normalize whitespace for comparison (handle non-breaking spaces, etc.)
        const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').replace(/\xa0/g, ' ').replace(/\u00a0/g, ' ');
        const originalNormalized = normalizeWhitespace(originalText);
        const expectedNormalized = normalizeWhitespace(expectedText);
        
        if (expectedNormalized === originalNormalized) {
          // Create the replacement text with static parts + variable placeholder
          const replacementText = (variable.static_prefix || '') + variable.placeholder + (variable.static_suffix || '');
          const replacementNode = document.createTextNode(replacementText);
          
          this.selectedRange.deleteContents();
          this.selectedRange.insertNode(replacementNode);
          window.getSelection().removeAllRanges();
          
          console.log(`Smart replacement: "${originalText}" -> "${replacementText}"`);
          console.log(`  Static prefix: "${variable.static_prefix || '(none)'}"`);
          console.log(`  Variable part: "${variable.value_to_replace}" -> "${variable.placeholder}"`);
          console.log(`  Static suffix: "${variable.static_suffix || '(none)'}"`);
          
          // Trigger change detection for document auto-save
          this.triggerTemplateChangeDetection();
          return;
        } else {
          console.warn(`Smart replacement failed - text mismatch after normalization.`);
          console.warn(`  Original: "${originalText}" (normalized: "${originalNormalized}")`);
          console.warn(`  Expected: "${expectedText}" (normalized: "${expectedNormalized}")`);
          // Fall back to simple replacement
        }
      }
      
      // Simple replacement: replace entire selection with placeholder
      const placeholder = document.createTextNode(variable.placeholder);
      this.selectedRange.deleteContents();
      this.selectedRange.insertNode(placeholder);
      window.getSelection().removeAllRanges();
      
      console.log(`Simple replacement: "${variable.originalText}" with "${variable.placeholder}"`);
      
      // Trigger change detection for document auto-save
      this.triggerTemplateChangeDetection();
    } catch (error) {
      console.error('Error replacing text with placeholder:', error);
    }
  }

  /**
   * Trigger template change detection for auto-save
   */
  triggerTemplateChangeDetection() {
    // Notify document manager that template content has changed
    if (window.documentManager) {
      window.documentManager.onContentChange();
      console.log('Template change detected - auto-save triggered');
    }
  }

  /**
   * Update variables list in panel - Updated to use document-specific IDs
   */
  updateVariablesList() {
    console.log('updateVariablesList called, variables count:', this.variables.size);
    
    // Debug: Check what document ID we're using
    const currentDocId = window.documentManager?.activeDocumentId;
    console.log('Current document ID:', currentDocId);
    
    // Get the variables list element
    const variablesList = this.variablesPanel.querySelector('.variables-list');
    
    if (!variablesList) {
      console.error('Variables list element not found in panel');
      return;
    }    
    // Clear existing content
    variablesList.innerHTML = '';
    
    if (this.variables.size === 0) {
      variablesList.innerHTML = '<div class="no-variables-message">No variables defined yet. Select text in your template and click "Suggest Variables" to get started.</div>';
      return;
    }
    
    console.log('Displaying', this.variables.size, 'variables');
    this.variables.forEach((variable, name) => {
      const variableItem = document.createElement('div');
      variableItem.className = 'variable-item';
      
      variableItem.innerHTML = `
        <div class="variable-header">
          <span class="variable-name">${variable.name}</span>
          <span class="variable-type">${variable.type}</span>
          <div class="variable-actions">
            <button class="edit-variable-btn" data-variable-name="${name}" title="Edit Variable">✏️</button>
            <button class="generate-tool-btn" data-variable-name="${name}" title="Generate Tool for Variable">🔧</button>
            <button class="remove-variable-btn" data-variable-name="${name}" title="Remove Variable">🗑️</button>
          </div>
        </div>
        <div class="variable-description">${variable.description}</div>

        <div class="variable-details">
          <span class="variable-placeholder">${variable.placeholder}</span>
          <span class="variable-original">Original: "${variable.originalText}"</span>
        </div>
      `;
            
      variablesList.appendChild(variableItem);
    });

    this.variablesPanel.style.display = 'flex';
  }

  /**
   * Save variables to backend
   */
  async saveVariables() {
    try {
      const documentId = window.documentManager?.activeDocumentId;
      if (!documentId) {
        console.warn('No active document to save variables to');
        return;
      }
      
      const variablesObj = Object.fromEntries(this.variables);
      
      // Save to backend via API
      const response = await fetch('http://127.0.0.1:5000/api/variables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: documentId,
          variables: variablesObj
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success) {
        console.log(`Variables saved to backend: ${result.count} variables for document ${documentId}`);
        
        // Also update local state for compatibility
        if (typeof updateState === 'function') {
          updateState({ variables: variablesObj });
        }
      } else {
        throw new Error(result.error || 'Failed to save variables');
      }
      
    } catch (error) {
      console.error('Error saving variables:', error);
      // Fallback to local state only
      try {
        const variablesObj = Object.fromEntries(this.variables);
        if (typeof updateState === 'function') {
          updateState({ variables: variablesObj });
        }
        console.log('Variables saved to local state as fallback');
      } catch (fallbackError) {
        console.error('Error saving variables to local state:', fallbackError);
      }
    }
  }

  /**
   * Load variables from backend
   */
  async loadVariables() {
    try {
      const documentId = window.documentManager?.activeDocumentId;
      if (!documentId) {
        console.warn('No active document to load variables from');
        return;
      }
      
      // Load from backend via API
      const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success) {
        const variablesData = result.variables || {};
        
        this.variables.clear();
        Object.entries(variablesData).forEach(([name, variable]) => {
          this.variables.set(name, variable);
        });
        
        this.updateVariablesUI();
        console.log(`Loaded ${this.variables.size} variables from backend for document ${documentId}`);
        
        // Also update local state for compatibility
        if (typeof updateState === 'function') {
          updateState({ variables: Object.fromEntries(this.variables) });
        }
      } else {
        throw new Error(result.error || 'Failed to load variables');
      }
      
    } catch (error) {
      console.error('Error loading variables from backend:', error);
    }
  }

  /**
   * Update variables UI elements
   */
  updateVariablesUI() {
    const variablesBtn = document.querySelector('[data-action="show-variables"]');
    if (variablesBtn) {
      const count = this.variables.size;
      if (count > 0) {
        variablesBtn.innerHTML = `📊 Vars (${count})`;
      } else {
        variablesBtn.innerHTML = '📊 Vars';
      }
    }
  }

  /**
   * Edit an existing variable
   */
  async editVariable(variableName) {
    console.log('Editing variable:', variableName);
    
    // Load latest variable data from backend first
    await this.refreshVariablesFromBackend();
    
    const variable = this.variables.get(variableName);
    
    if (!variable) {
      console.error('Variable not found for editing:', variableName);
      return;
    }
    
    console.log('Loading latest variable data from backend for editing:', variable);
    
    // Set up the dialog for editing
    this.selectedText = variable.originalText;
    this.currentSuggestion = variable;
    
    // Store the variable data for editing mode
    this._editingVariable = variable;
    this._editingVariableName = variableName;
    
    // Hide variables panel and show edit dialog
    this.hideVariablesPanel();
    this.showVariableDialog(true); // Pass true to indicate this is editing mode
  }

     /**
    * Remove a variable
    */
   removeVariable(variableName) {
     console.log('Removing variable:', variableName);
     
     // Show confirmation dialog
     if (confirm(`Are you sure you want to remove the variable "${variableName}"?`)) {
       // Remove from variables map
       this.variables.delete(variableName);
       
       // Update the UI
       this.updateVariablesList();
       this.updateVariablesUI();
       
       // Save changes to backend
       this.saveVariables();
       
       console.log(`Variable "${variableName}" removed successfully`);
     }
   }

   /**
    * Update an existing variable
    */
   updateVariable(variableName) {
     console.log('Updating variable:', variableName);
     
     // Validate form data with update context
     const formData = this.getVariableFormData();
     const isValid = this.validateVariableForm(formData, true, variableName);
     
     if (!isValid) {
       return;
     }
     
     // Get the original variable
     const originalVariable = this.variables.get(variableName);
     if (!originalVariable) {
       console.error('Original variable not found for update:', variableName);
       return;
     }
     
     // Create updated variable object, preserving original text and other properties
     const updatedVariable = {
       ...originalVariable,
       name: formData.name,
       description: formData.description,
       type: formData.type,
       format: formData.format,
       required: formData.required,
       placeholder: `{{${formData.name}}}`
     };
     
     // Update value if set in dialog
     if (this._temporaryValue !== undefined) {
       if (this._temporaryValue === '') {
         delete updatedVariable.value;
       } else {
         updatedVariable.value = this._temporaryValue;
       }
     }
     
     // If name changed, remove old entry and add new one
     if (formData.name !== variableName) {
       this.variables.delete(variableName);
       this.variables.set(formData.name, updatedVariable);
     } else {
       // Just update the existing entry
       this.variables.set(variableName, updatedVariable);
     }
     
     // Update UI
     this.updateVariablesList();
     this.updateVariablesUI();
     
     // Save to backend
     this.saveVariables();
     
     // Close dialog and reset to create mode
     this.hideVariableDialog();
     this.resetDialogToCreateMode();
     
     console.log(`Variable "${variableName}" updated successfully`);
   }

     /**
   * Populate the edit form with variable data
   */
  populateEditForm(variable, variableName) {
    console.log('populateEditForm called with variable:', variable);
    
    try {
      // Fill the dialog with existing variable data
      const nameInput = getDocumentElement('variable-name');
      const descInput = getDocumentElement('variable-description');
      const typeSelect = getDocumentElement('variable-type');
      const formatInput = getDocumentElement('variable-format');
      const requiredCheckbox = getDocumentElement('variable-required');
      
      console.log('Form elements found:', {
        nameInput: !!nameInput,
        descInput: !!descInput,
        typeSelect: !!typeSelect,
        formatInput: !!formatInput,
        requiredCheckbox: !!requiredCheckbox
      });
      
      if (nameInput) nameInput.value = variable.name || '';
      if (descInput) descInput.value = variable.description || '';
      if (typeSelect) typeSelect.value = variable.type || 'text';
      if (formatInput) formatInput.value = variable.format || '';
      if (requiredCheckbox) requiredCheckbox.checked = variable.required !== false;
      
      // Update the selected text display
      const textDisplay = this.variableDialog.querySelector('.selected-text-display');
      if (textDisplay) {
        textDisplay.textContent = `"${variable.originalText}"`;
      }
      
      // Update the value display
      const valueDisplay = getDocumentElement('variable-value-display');
      const valueInput = getDocumentElement('variable-value-input');
      
      const currentValue = variable.value || '';
      this._temporaryValue = currentValue;
      
      if (valueDisplay) {
        valueDisplay.textContent = currentValue || 'Click to set value';
        valueDisplay.className = currentValue ? 'value-display has-value' : 'value-display no-value';
      }
      if (valueInput) {
        valueInput.value = currentValue;
      }
      
      // Change dialog title and button text for editing
      const dialogTitle = this.variableDialog.querySelector('h3');
      const addButton = this.variableDialog.querySelector('[data-action="add-variable"]');
      
      if (dialogTitle) dialogTitle.textContent = '✏️ Edit Variable';
      if (addButton) {
        addButton.textContent = 'Update Variable';
        addButton.setAttribute('data-action', 'update-variable');
        addButton.setAttribute('data-variable-name', variableName);
      }
      
      console.log('✓ Edit form populated successfully for variable:', variableName);
      
    } catch (error) {
      console.error('Error populating edit form:', error);
    }
  }

  /**
   * Reset dialog back to create mode
   */
  resetDialogToCreateMode() {
    if (this.variableDialog) {
      const dialogTitle = this.variableDialog.querySelector('h3');
      const addButton = this.variableDialog.querySelector('[data-action="update-variable"]');
      
      if (dialogTitle) dialogTitle.textContent = '✨ Create Variable';
      if (addButton) {
        addButton.textContent = 'Add Variable';
        addButton.setAttribute('data-action', 'add-variable');
        addButton.removeAttribute('data-variable-name');
      }
      
      // Clear form fields
      const nameInput = getDocumentElement('variable-name');
      const descInput = getDocumentElement('variable-description');
      const typeSelect = getDocumentElement('variable-type');
      const formatInput = getDocumentElement('variable-format');
      const requiredCheckbox = getDocumentElement('variable-required');
      
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (typeSelect) typeSelect.value = 'text';
      if (formatInput) formatInput.value = '';
      if (requiredCheckbox) requiredCheckbox.checked = true;
      
      // Reset value display
      const valueDisplay = getDocumentElement('variable-value-display');
      const valueInput = getDocumentElement('variable-value-input');
      const valueInputContainer = this.variableDialog.querySelector('.value-input-container');
      const dataSourceSelect = getDocumentElement('data-source-select');
      
      if (valueDisplay) {
        valueDisplay.textContent = 'Click to set value';
        valueDisplay.className = 'value-display no-value';
        valueDisplay.style.display = 'block';
      }
      if (valueInput) valueInput.value = '';
      if (valueInputContainer) valueInputContainer.style.display = 'none';
      if (dataSourceSelect) dataSourceSelect.value = '';
    }
    
    // Clear editing state
    this._editingVariable = null;
    this._editingVariableName = null;
    this._temporaryValue = undefined;
  }

  /**
   * Generate tool for an existing variable from the variables panel
   */
  async generateToolForVariable(variableName) {
    console.log('Generating tool for existing variable:', variableName);
    
    const variable = this.variables.get(variableName);
    if (!variable) {
      console.error('Variable not found:', variableName);
      alert('Variable not found');
      return;
    }
    
    // Create variable data object for tool generator
    const variableData = {
      name: variable.name,
      description: variable.description || '',
      type: variable.type || 'text',
      format: variable.format || '',
      required: variable.required || false,
      originalText: variable.originalText || ''
    };
    
    console.log('Variable data for tool generator:', variableData);
    
    // Show the tool generator (variables panel should already be open)
    await variableToolGenerator.show(variableData, this.variablesPanel);
  }

  /**
   * Open the tool generator for the current variable
   */
  async openToolGenerator() {
    console.log('Opening tool generator for variable...');
    
    // Get current variable data from form
    const formData = this.getVariableFormData();
    
    // Validate that we have at least a variable name
    if (!formData.name || !formData.name.trim()) {
      alert('Please enter a variable name first');
      return;
    }
    
    // Validate the form
    if (!this.validateVariableForm(formData)) {
      return;
    }

    try {
      // Step 1: Save the variable to backend
      console.log('Step 1: Saving variable to backend...');
      
      const variable = {
        id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: formData.name,
        description: formData.description,
        type: formData.type,
        format: formData.format,
        required: formData.required,
        originalText: this.selectedText,
        placeholder: `{{${formData.name}}}`,
        createdAt: new Date().toISOString(),
        // Add smart replacement fields if available from LLM suggestions
        value_to_replace: formData.value_to_replace || this.selectedText,
        static_prefix: formData.static_prefix || '',
        static_suffix: formData.static_suffix || ''
      };
      
      // Save to variables manager
      this.variables.set(variable.name, variable);
      
      // Replace text with placeholder
      this.replaceSelectedTextWithPlaceholder(variable);
      
      // Save to backend
      await this.saveVariables();
      
      // Update UI
      this.updateVariablesUI();
      
      console.log('✓ Variable saved successfully:', variable.name);
      
      // Step 2: Hide the variable dialog
      console.log('Step 2: Hiding variable dialog...');
      this.hideVariableDialog();
      
      // Step 3: Show the floating window for tool/operator editing
      console.log('Step 3: Showing tool generator floating window...');
      
      // Create variable data object for tool generator
      const variableData = {
        name: formData.name,
        description: formData.description || '',
        type: formData.type || 'text',
        format: formData.format || '',
        required: formData.required || false,
        originalText: this.selectedText || ''
      };
      
      console.log('Variable data for tool generator:', variableData);
      
      // Show the tool generator (no parent dialog since we closed the variable dialog)
      await variableToolGenerator.show(variableData, null);
      
    } catch (error) {
      console.error('Error in openToolGenerator workflow:', error);
      alert('Error saving variable: ' + error.message);
    }
  }

  /**
   * Get all variables as object
   */
  getVariables() {
    return Object.fromEntries(this.variables);
  }

  /**
   * Set a variable value programmatically (for operator outputs)
   */
  async setVariableValue(variableName, value) {
    if (!variableName || !variableName.trim()) {
      throw new Error('Variable name is required');
    }

    // Validate variable name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variableName)) {
      throw new Error('Variable name must be a valid identifier (letters, numbers, underscore, starting with letter or underscore)');
    }

    // If variable is not in vars manager, skip it.
    if (!this.variables.has(variableName)) {
      console.warn(`Variable ${variableName} not found in variables manager, skipping`);
      return;
    }

    const existingVariable = this.variables.get(variableName);
    existingVariable.value = value;
    this.variables.set(variableName, existingVariable);
    this.updateVariablesUI();

    // Save to vars.json for persistence (operator outputs are also saved via document auto-save)
    await this.saveVariables();

    console.log(`Variable ${variableName} set to:`, value);
  }

  /**
   * Show a brief notification when variables are updated
   */
  showVariableUpdateNotification() {
    // Create or update notification element
    let notification = document.getElementById('variable-update-notification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'variable-update-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 14px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(notification);
    }

    notification.textContent = '✅ Variable updated - Template refreshed';
    notification.style.opacity = '1';

    // Hide after 2 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 2000);
  }

  /**
   * Load variables for active document when switching documents (clears UI state first)
   */
  async loadVariablesFromBackend() {
    try {
      // CRITICAL: Clear all UI state first when loading variables for a new document
      this.clearDocumentVariables();
      
      // Load variables from backend API for the current document
      const documentId = window.documentManager?.activeDocumentId;
      if (!documentId) {
        console.log('No active document to load variables for');
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.variables) {
          // Clear existing variables and load from backend
          this.variables.clear();
          
          Object.entries(data.variables).forEach(([name, variable]) => {
            this.variables.set(name, variable);
          });
          
          console.log(`📊 Loaded ${this.variables.size} variables from backend for document ${documentId}`);
        }
      } else {
        console.log('No variables found in backend for document:', documentId);
      }
      
      this.updateVariablesUI();

    } catch (error) {
      console.error('Error loading variables for document:', error);
    }
  }

  /**
   * Refresh variables from backend without clearing UI state (for updates)
   */
  async refreshVariablesFromBackend() {
    try {
      const documentId = window.documentManager?.activeDocumentId;
      if (!documentId) {
        console.log('No active document to refresh variables for');
        return;
      }
      
      console.log('Refreshing variables from backend for document:', documentId);
      
      const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.variables) {
          // Update existing variables with fresh data from backend
          this.variables.clear();
          
          Object.entries(data.variables).forEach(([name, variable]) => {
            this.variables.set(name, variable);
          });
          
          console.log(`🔄 Refreshed ${this.variables.size} variables from backend for document ${documentId}`);
          
          // Update variables list display if panel is visible
          if (this.variablesPanel && this.variablesPanel.style.display === 'flex') {
            this.updateVariablesList();
          }
          
          this.updateVariablesUI();
        }
      } else {
        console.log('No variables found in backend for document:', documentId);
      }

    } catch (error) {
      console.error('Error refreshing variables from backend:', error);
    }
  }

  /**
   * Clear all variables for current document (called before loading new document)
   */
  clearDocumentVariables() {
    console.log('🧹 Clearing variables UI for document switch');
    
    // Clear variables from memory
    this.variables.clear();
    
    // Hide all dialogs
    this.hideVariableDialog();
    this.hideVariablesPanel();
    this.hideFloatingButton();
    
    // Clear dialog references so they get recreated for new document
    if (this.variableDialog) {
      console.log('Removing variable dialog from DOM');
      this.variableDialog.remove();
      this.variableDialog = null;
    }
    if (this.variablesPanel) {
      console.log('Removing variables panel from DOM');
      this.variablesPanel.remove();
      this.variablesPanel = null;
    }
    
    // Clear variable tool generator dialog if it exists
    if (window.variableToolGenerator && window.variableToolGenerator.generatorDialog) {
      console.log('Removing variable tool generator dialog from DOM');
      window.variableToolGenerator.hide();
      window.variableToolGenerator.generatorDialog.remove();
      window.variableToolGenerator.generatorDialog = null;
      window.variableToolGenerator.isVisible = false;
      window.variableToolGenerator.currentVariable = null;
      window.variableToolGenerator.parentDialog = null;
    }
    
    // Clear any active text selection
    this.selectedText = null;
    this.selectedRange = null;
    this.currentSuggestion = null;
    
    console.log('✅ Variables UI cleared for document switch');
  }

  /**
   * Load variables for a document (when opening/creating) with registration
   */
  loadDocumentVariables() {
    console.log('🏗️ Loading variables for document');
    
    const activeDocumentId = window.documentManager?.activeDocumentId;
    if (!activeDocumentId) {
      console.log('No active document - skipping variables UI creation');
      return;
    }
    
    // Ensure initialization is complete
    if (!this.initialized) {
      this.init();
    }
    
    // Clear any existing dialogs first to prevent conflicts
    if (this.variableDialog) {
      this.variableDialog.remove();
      this.variableDialog = null;
    }
    if (this.variablesPanel) {
      this.variablesPanel.remove();
      this.variablesPanel = null;
    }
    // Load variables for this document
    this.loadVariablesFromBackend();
  }

  /**
   * Infer data type from value
   */
  inferTypeFromValue(value) {
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'text';
    }
    if (value instanceof Date) {
      return 'date';
    }
    if (typeof value === 'string') {
      // Check for currency patterns
      if (value.match(/^\$[\d,]+\.?\d*$/)) {
        return 'currency';
      }
      // Check for percentage patterns
      if (value.match(/^\d+\.?\d*%$/)) {
        return 'percentage';
      }
      // Check for number patterns
      if (value.match(/^\d+\.?\d*$/)) {
        return 'number';
      }
      // Check for date patterns
      if (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
        return 'date';
      }
    }
    return 'text';
  }

  /**
   * Get default format for data type
   */
  getDefaultFormatForType(type) {
    switch (type) {
      case 'currency':
        return '$#,##0';
      case 'percentage':
        return '0.0%';
      case 'number':
        return '#,##0';
      case 'date':
        return 'MM/DD/YYYY';
      default:
        return '';
    }
  }

 

  /**
   * Value setting methods for the dialog
   */
  startValueEditingInDialog() {
    console.log('Starting value editing in dialog');
    
    const valueDisplay = getDocumentElement('variable-value-display');
    const valueInputContainer = this.variableDialog.querySelector('.value-input-container');
    const valueInput = getDocumentElement('variable-value-input');
    
    if (valueDisplay && valueInputContainer && valueInput) {
      valueDisplay.style.display = 'none';
      valueInputContainer.style.display = 'block';
      valueInput.focus();
      valueInput.select();
    }
  }

  async saveVariableValueInDialog() {
    console.log('Saving value in dialog');
    
    const valueInput = getDocumentElement('variable-value-input');
    const valueDisplay = getDocumentElement('variable-value-display');
    const valueInputContainer = this.variableDialog.querySelector('.value-input-container');
    
    if (valueInput && valueDisplay && valueInputContainer) {
      const newValue = valueInput.value.trim();
      
      // Update display
      valueDisplay.textContent = newValue || 'Click to set value';
      valueDisplay.className = newValue ? 'value-display has-value' : 'value-display no-value';
      
      // Hide input, show display
      valueDisplay.style.display = 'block';
      valueInputContainer.style.display = 'none';
      
      // Store the value temporarily (for UI consistency)
      this._temporaryValue = newValue;
      
      // If we're editing an existing variable, save the value to backend immediately
      if (this._editingVariableName) {
        const variable = this.variables.get(this._editingVariableName);
        if (variable) {
          // Update the variable value
          if (newValue) {
            variable.value = newValue;
          } else {
            delete variable.value;
          }
          this.variables.set(this._editingVariableName, variable);
          
          // Save to backend immediately
          await this.saveVariables();
          console.log(`Variable "${this._editingVariableName}" value saved to backend:`, newValue);
          
          // Show success notification
          this.showVariableUpdateNotification();
        }
      }
      
      console.log('Value set in dialog:', newValue);
    }
  }

  cancelValueEditingInDialog() {
    console.log('Canceling value editing in dialog');
    
    const valueDisplay = getDocumentElement('variable-value-display');
    const valueInputContainer = this.variableDialog.querySelector('.value-input-container');
    const valueInput = getDocumentElement('variable-value-input');
    
    if (valueDisplay && valueInputContainer && valueInput) {
      // Reset input to current value
      valueInput.value = this._temporaryValue || '';
      
      // Show display, hide input
      valueDisplay.style.display = 'block';
      valueInputContainer.style.display = 'none';
    }
  }

  populateDataSourceSelect() {
    console.log('Populating data source select');
    
    const select = getDocumentElement('data-source-select');
    if (!select) return;
    
    // Clear existing options except the default ones
    const existingOptions = select.querySelectorAll('option[data-source]');
    existingOptions.forEach(option => option.remove());
    
    // Get data sources from data sources module (same as variable-operator-generator.js)
    let dataSources = [];
    if (window.dataSourcesModule && window.dataSourcesModule.getAllDataSources) {
      dataSources = window.dataSourcesModule.getAllDataSources();
    }
    
    if (dataSources.length === 0) {
      const noDataOption = document.createElement('option');
      noDataOption.value = '';
      noDataOption.textContent = 'No data sources available. Use "Load Context" to add files.';
      noDataOption.disabled = true;
      select.appendChild(noDataOption);
      return;
    }
    
    // Add each data source as an option (same format as variable-operator-generator.js)
    dataSources.forEach(source => {
      const option = document.createElement('option');
      // Use filePath as the value for code execution, fallback to referenceName for backward compatibility
      option.value = source.filePath || source.referenceName;
      option.textContent = `${this.getFileIcon(source.type)} ${source.name} ($${source.referenceName})`;
      option.setAttribute('data-source', 'true');
      option.setAttribute('data-source-id', source.id);
      option.setAttribute('data-source-name', source.referenceName);
      option.setAttribute('data-file-path', source.filePath || '');
      option.setAttribute('data-type', source.type);
      select.appendChild(option);
    });
  }

  /**
   * Get file icon based on type (same as variable-operator-generator.js)
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

  async handleDataSourceChange(selectedValue) {
    console.log('Handling data source change:', selectedValue);
    
    if (selectedValue === 'manual') {
      // Switch to manual input mode
      this.startValueEditingInDialog();
      // Reset the select back to default
      const select = getDocumentElement('data-source-select');
      if (select) {
        select.value = '';
      }
    } else if (selectedValue && selectedValue !== '') {
      // Set value from data source
      const valueDisplay = getDocumentElement('variable-value-display');
      const valueInput = getDocumentElement('variable-value-input');
      const select = getDocumentElement('data-source-select');
      
      // Get the selected option to extract additional data
      let selectedOption = null;
      if (select) {
        selectedOption = select.querySelector(`option[value="${selectedValue}"]`);
      }
      
      // Format the value to show the data source reference name
      let displayValue;
      if (selectedOption) {
        const referenceName = selectedOption.getAttribute('data-source-name');
        displayValue = `$${referenceName}`;
      } else {
        displayValue = `[${selectedValue}]`;
      }
      
      if (valueDisplay) {
        valueDisplay.textContent = displayValue;
        valueDisplay.className = 'value-display has-value';
      }
      if (valueInput) {
        valueInput.value = displayValue;
      }
      
      // Store the value temporarily
      this._temporaryValue = displayValue;
      
      // If we're editing an existing variable, save the value to backend immediately
      if (this._editingVariableName) {
        const variable = this.variables.get(this._editingVariableName);
        if (variable) {
          variable.value = displayValue;
          this.variables.set(this._editingVariableName, variable);
          
          // Save to backend immediately
          this.saveVariables().then(() => {
            console.log(`Variable "${this._editingVariableName}" value saved to backend from data source:`, displayValue);
            this.showVariableUpdateNotification();
          }).catch(error => {
            console.error('Error saving variable value to backend:', error);
          });
        }
      }
      
      console.log('Value set from data source:', displayValue);
    }
  }


}

// Create and export singleton instance
export const variablesManager = new VariablesManager();
export default variablesManager;

// Export functions for DocumentManager integration
export function resetVariablesInitialization() {
  console.log('resetVariablesInitialization called by DocumentManager');
  variablesManager.clearDocumentVariables();
  
  // Clear window reference
  if (window.variablesManager) {
    window.variablesManager = null;
  }
}

export function initVariablesForDocument() {
  console.log('initVariablesForDocument called by DocumentManager');
  variablesManager.loadDocumentVariables();
} 