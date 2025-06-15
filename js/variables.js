// Variables Management Module
import { state, elements, updateState } from './state.js';

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
      
      this.createVariableDialog();
      console.log('✓ Variable dialog created');
      
      this.setupVariablesEventListeners();
      console.log('✓ Variables event listeners setup');
      
      this.createVariablesPanelDialog();
      console.log('✓ Variables panel dialog created');
      
      this.setupTextSelection();
      console.log('✓ Text selection setup complete');
      
      this.loadVariables();
      console.log('✓ Variables loaded');
      
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
      // Ignore clicks on UI elements that shouldn't trigger variable suggestions
      if (e.target.closest('.variables-btn') || 
          e.target.closest('.floating-variable-button') ||
          e.target.closest('.variable-dialog') ||
          e.target.closest('.variables-panel-dialog') ||
          e.target.closest('button') ||
          e.target.closest('.btn-primary') ||
          e.target.closest('.btn-secondary')) {
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
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    console.log('Text selection detected:', {
      selectedText,
      selectionLength: selectedText.length,
      rangeCount: selection.rangeCount
    });
    
    if (selectedText.length > 0 && selection.rangeCount > 0) {
      const isInTemplate = this.isInTemplateContent(selection);
      console.log('Is in template content:', isInTemplate);
      
      if (isInTemplate) {
        this.selectedText = selectedText;
        this.selectedRange = selection.getRangeAt(0).cloneRange();
        
        console.log('Showing floating button for selection:', selectedText);
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
    
    console.log('Positioning floating button at:', { x: x + 10, y: y - 40 });
    
    this.floatingButton.style.left = `${x + 10}px`;
    this.floatingButton.style.top = `${y - 40}px`;
    this.floatingButton.style.display = 'block';
    
    console.log('Floating button should now be visible');
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
   * Create variable creation dialog
   */
  createVariableDialog() {
    this.variableDialog = document.createElement('div');
    this.variableDialog.className = 'variable-dialog';
    this.variableDialog.style.display = 'none';
    // Add to body for global access
    document.body.appendChild(this.variableDialog);

    this.variableDialog.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-content">
          <div class="dialog-header">
            <h3>✨ Create Variable</h3>
            <div class="ai-indicator" id="ai-indicator" style="display: none;">
              <span class="ai-spinner">🤖</span>
              <span class="ai-text">AI is analyzing...</span>
            </div>
            <button class="close-btn" data-action="close">×</button>
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
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="cancel">Cancel</button>
            <button class="btn-primary" data-action="add-variable">Add Variable</button>
          </div>
        </div>
      </div>
    `;

    this.variableDialog.addEventListener('click', (e) => {
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
      }
    });
  }

  /**
   * Set up Variables event listeners using event delegation
   */
  setupVariablesEventListeners() {
    // Listen for Variables buttons (using event delegation like Data Lake)
    document.addEventListener('click', (event) => {
      if (event.target.matches('.variables-btn') || event.target.closest('.variables-btn')) {
        console.log('Variables button clicked');
        event.preventDefault();
        event.stopPropagation();
        this.showVariablesPanel();
      }
    });
  }

  /**
   * Create Variables panel dialog
   */
  createVariablesPanelDialog() {
    // Add to body for global access across all documents
    // This way the panel can show variables from any active document
    
    const panelDialog = document.createElement('div');
    panelDialog.className = 'variables-panel-dialog';
    panelDialog.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-content variables-panel-content">
          <div class="dialog-header">
            <h3>📊 Template Variables</h3>
            <button class="close-btn" data-action="close-panel">×</button>
          </div>
          
          <div class="variables-list" id="variables-list">
            <div class="no-variables-message" id="no-variables-message">
              <p>No variables created yet.</p>
              <p>Select text in your template and click "Suggest Variables".</p>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button class="btn-secondary" data-action="close-panel">Close</button>
          </div>
        </div>
      </div>
    `;
    
    panelDialog.style.display = 'none';
    // Add to body for global access
    document.body.appendChild(panelDialog);

    panelDialog.addEventListener('click', (e) => {
      if (e.target.classList.contains('dialog-overlay') || 
          e.target.getAttribute('data-action') === 'close-panel') {
        this.hideVariablesPanel();
      }
      
      // Handle edit variable button
      if (e.target.classList.contains('edit-variable-btn')) {
        const variableName = e.target.getAttribute('data-variable-name');
        this.editVariable(variableName);
      }
      
      // Handle remove variable button
      if (e.target.classList.contains('remove-variable-btn')) {
        const variableName = e.target.getAttribute('data-variable-name');
        this.removeVariable(variableName);
      }
    });

    this.variablesPanel = panelDialog;
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
    
    const nameInput = this.variableDialog.querySelector('#variable-name');
    const descInput = this.variableDialog.querySelector('#variable-description');
    const typeSelect = this.variableDialog.querySelector('#variable-type');
    const formatInput = this.variableDialog.querySelector('#variable-format');
    
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
   * Show loading state in dialog
   */
  showLoadingInDialog() {
    if (!this.variableDialog) return;
    
    // Show AI indicator
    const aiIndicator = this.variableDialog.querySelector('#ai-indicator');
    if (aiIndicator) {
      aiIndicator.style.display = 'flex';
    }
    
    const nameInput = this.variableDialog.querySelector('#variable-name');
    const descInput = this.variableDialog.querySelector('#variable-description');
    const typeSelect = this.variableDialog.querySelector('#variable-type');
    const formatInput = this.variableDialog.querySelector('#variable-format');
    
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
   * Hide loading state in dialog
   */
  hideLoadingInDialog() {
    if (!this.variableDialog) return;
    
    // Hide AI indicator
    const aiIndicator = this.variableDialog.querySelector('#ai-indicator');
    if (aiIndicator) {
      aiIndicator.style.display = 'none';
    }
    
    const nameInput = this.variableDialog.querySelector('#variable-name');
    const descInput = this.variableDialog.querySelector('#variable-description');
    const typeSelect = this.variableDialog.querySelector('#variable-type');
    const formatInput = this.variableDialog.querySelector('#variable-format');
    
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
    if (!this.variableDialog) {
      console.error('Variable dialog not found!');
      return;
    }
    
    const textDisplay = this.variableDialog.querySelector('.selected-text-display');
    if (textDisplay && this.selectedText) {
      textDisplay.textContent = `"${this.selectedText}"`;
      console.log('Set selected text display to:', this.selectedText);
    }
    
    this.variableDialog.style.display = 'flex';
    this.hideFloatingButton();
    console.log('Variable dialog should now be visible');
    
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

  showVariablesPanel() {
    console.log('showVariablesPanel called');
    if (!this.variablesPanel) {
      console.error('Variables panel not found!');
      return;
    }
    console.log('Updating variables list and showing panel');
    this.updateVariablesList();
    this.variablesPanel.style.display = 'flex';
    console.log('Variables panel should now be visible');
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
    
    this.variables.set(variable.name, variable);
    this.replaceSelectedTextWithPlaceholder(variable);
    this.saveVariables();
    this.updateVariablesUI();
    this.hideVariableDialog();
    
    console.log('Variable created:', variable);
  }

  /**
   * Form handling methods
   */
  getVariableFormData() {
    if (!this.variableDialog) return {};
    
    return {
      name: this.variableDialog.querySelector('#variable-name')?.value?.trim() || '',
      description: this.variableDialog.querySelector('#variable-description')?.value?.trim() || '',
      type: this.variableDialog.querySelector('#variable-type')?.value || 'text',
      format: this.variableDialog.querySelector('#variable-format')?.value?.trim() || '',
      required: this.variableDialog.querySelector('#variable-required')?.checked || false,
      // Include smart replacement fields from current LLM suggestion
      value_to_replace: this.currentSuggestion?.value_to_replace || this.selectedText,
      static_prefix: this.currentSuggestion?.static_prefix || '',
      static_suffix: this.currentSuggestion?.static_suffix || ''
    };
  }

  validateVariableForm(formData) {
    if (!formData.name) {
      alert('Variable name is required');
      return false;
    }
    
    if (this.variables.has(formData.name)) {
      alert('Variable name already exists');
      return false;
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
    } catch (error) {
      console.error('Error replacing text with placeholder:', error);
    }
  }

  /**
   * Update variables list in panel
   */
  updateVariablesList() {
    console.log('updateVariablesList called, variables count:', this.variables.size);
    
    const variablesList = this.variablesPanel?.querySelector('#variables-list');
    const noVariablesMsg = this.variablesPanel?.querySelector('#no-variables-message');
    
    if (!variablesList) {
      console.error('Variables list element not found in panel');
      return;
    }
    
    if (this.variables.size === 0) {
      console.log('No variables to display, showing empty message');
      if (noVariablesMsg) noVariablesMsg.style.display = 'block';
      return;
    }
    
    console.log('Displaying', this.variables.size, 'variables');
    if (noVariablesMsg) noVariablesMsg.style.display = 'none';
    
    variablesList.innerHTML = '';
    
    this.variables.forEach((variable, name) => {
      console.log('Adding variable to list:', name, variable);
      const variableItem = document.createElement('div');
      variableItem.className = 'variable-item';
      variableItem.innerHTML = `
        <div class="variable-header">
          <span class="variable-name">${variable.name}</span>
          <span class="variable-type">${variable.type}</span>
          <div class="variable-actions">
            <button class="edit-variable-btn" data-variable-name="${name}" title="Edit Variable">✏️</button>
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
      const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`);
      
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
          updateState({ variables: variablesData });
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
  editVariable(variableName) {
    console.log('Editing variable:', variableName);
    const variable = this.variables.get(variableName);
    
    if (!variable) {
      console.error('Variable not found for editing:', variableName);
      return;
    }
    
    // Set up the dialog for editing
    this.selectedText = variable.originalText;
    this.currentSuggestion = variable;
    
    // Fill the dialog with existing variable data
    if (this.variableDialog) {
      const nameInput = this.variableDialog.querySelector('#variable-name');
      const descInput = this.variableDialog.querySelector('#variable-description');
      const typeSelect = this.variableDialog.querySelector('#variable-type');
      const formatInput = this.variableDialog.querySelector('#variable-format');
      const requiredCheckbox = this.variableDialog.querySelector('#variable-required');
      
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
      
      // Change dialog title and button text for editing
      const dialogTitle = this.variableDialog.querySelector('h3');
      const addButton = this.variableDialog.querySelector('[data-action="add-variable"]');
      
      if (dialogTitle) dialogTitle.textContent = '✏️ Edit Variable';
      if (addButton) {
        addButton.textContent = 'Update Variable';
        addButton.setAttribute('data-action', 'update-variable');
        addButton.setAttribute('data-variable-name', variableName);
      }
    }
    
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
     
     // Validate form data
     const formData = this.getVariableFormData();
     const validation = this.validateVariableForm(formData);
     
     if (!validation.isValid) {
       alert(validation.errors.join('\n'));
       return;
     }
     
     // Check if name changed and if new name already exists
     if (formData.name !== variableName && this.variables.has(formData.name)) {
       alert(`A variable named "${formData.name}" already exists. Please choose a different name.`);
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
       const nameInput = this.variableDialog.querySelector('#variable-name');
       const descInput = this.variableDialog.querySelector('#variable-description');
       const typeSelect = this.variableDialog.querySelector('#variable-type');
       const formatInput = this.variableDialog.querySelector('#variable-format');
       const requiredCheckbox = this.variableDialog.querySelector('#variable-required');
       
       if (nameInput) nameInput.value = '';
       if (descInput) descInput.value = '';
       if (typeSelect) typeSelect.value = 'text';
       if (formatInput) formatInput.value = '';
       if (requiredCheckbox) requiredCheckbox.checked = true;
     }
   }

  /**
   * Get all variables as object
   */
  getVariables() {
    return Object.fromEntries(this.variables);
  }

  /**
   * Set variables from object
   */
  setVariables(variablesObj) {
    this.variables.clear();
    Object.entries(variablesObj || {}).forEach(([name, variable]) => {
      this.variables.set(name, variable);
    });
    this.updateVariablesUI();
  }
}

// Create and export singleton instance
export const variablesManager = new VariablesManager();
export default variablesManager; 