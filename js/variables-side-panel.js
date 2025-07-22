// Variables Side Panel Manager
import { variablesManager } from './variables.js';

/**
 * Variables Side Panel Manager
 * Handles the new right-side panel UI for variables
 */
class VariablesSidePanel {
  constructor() {
    this.panel = null;
    this.isOpen = false;
    this.currentView = 'overview'; // 'overview' or 'editor'
    this.editingVariableName = null;
    this.selectedText = null;
    this.selectedRange = null;
    this.initialized = false;
  }

  /**
   * Initialize the side panel
   */
  init() {
    if (this.initialized) {
      return;
    }

    this.panel = document.getElementById('variables-side-panel');
    if (!this.panel) {
      console.error('Variables side panel element not found');
      return;
    }

    this.setupEventListeners();
    this.setupVariablesButtonListener();
    this.setupTextSelectionListener();
    this.initialized = true;
    
    console.log('Variables side panel initialized successfully');
  }

  /**
   * Handle document changes
   */
  onDocumentChange(documentId) {
    // Close panel if it's open
    if (this.isOpen) {
      this.close();
    }
    
    // Load variables for the new document if panel is opened later
    // The loadVariablesData method will be called when the panel opens
  }

  /**
   * Set up event listeners for the side panel
   */
  setupEventListeners() {
    if (!this.panel) return;

    // Panel close button
    const closeBtn = this.panel.querySelector('#close-variables-panel');
    closeBtn?.addEventListener('click', () => this.close());

    // Add new variable button
    const addBtn = this.panel.querySelector('#add-new-variable');
    addBtn?.addEventListener('click', () => this.showEditor());

    // Back to overview button
    const backBtn = this.panel.querySelector('#back-to-overview');
    backBtn?.addEventListener('click', () => this.showOverview());

    // Variable form handling
    this.setupFormEventListeners();

    // Value management
    this.setupValueEventListeners();

    // Dependencies management
    this.setupDependencyEventListeners();

    // Code generation
    this.setupCodeGenerationEventListeners();

    // Panel actions
    this.setupActionEventListeners();
  }

  /**
   * Set up form event listeners
   */
  setupFormEventListeners() {
    // Auto-generate variable name from description
    const descInput = this.panel.querySelector('#var-description');
    const nameInput = this.panel.querySelector('#var-name');
    
    descInput?.addEventListener('input', (e) => {
      if (!nameInput.value && e.target.value) {
        // Generate variable name from description
        const suggested = e.target.value
          .toLowerCase()
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 20);
        nameInput.value = suggested;
      }
    });

    // Data source selection
    const dataSourceSelect = this.panel.querySelector('#var-data-source');
    dataSourceSelect?.addEventListener('change', (e) => {
      this.handleDataSourceChange(e.target.value);
    });
  }

  /**
   * Set up value management event listeners
   */
  setupValueEventListeners() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const saveBtn = this.panel.querySelector('#save-var-value');
    const cancelBtn = this.panel.querySelector('#cancel-var-value');

    valueDisplay?.addEventListener('click', () => {
      this.startValueEditing();
    });

    saveBtn?.addEventListener('click', () => {
      this.saveValue();
    });

    cancelBtn?.addEventListener('click', () => {
      this.cancelValueEditing();
    });
  }

  /**
   * Set up dependency management event listeners
   */
  setupDependencyEventListeners() {
    const addDepBtn = this.panel.querySelector('#add-var-dependency');
    const confirmDepBtn = this.panel.querySelector('#confirm-var-dependency');
    const cancelDepBtn = this.panel.querySelector('#cancel-var-dependency');

    addDepBtn?.addEventListener('click', () => {
      this.showDependencySelector();
    });

    confirmDepBtn?.addEventListener('click', () => {
      this.addSelectedDependency();
    });

    cancelDepBtn?.addEventListener('click', () => {
      this.hideDependencySelector();
    });

    // Handle remove dependency buttons (event delegation)
    const dependenciesList = this.panel.querySelector('#var-dependencies-list');
    dependenciesList?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-dependency-btn')) {
        const dependencyName = e.target.getAttribute('data-dependency-name');
        this.removeDependency(dependencyName);
      }
    });
  }

  /**
   * Set up code generation event listeners
   */
  setupCodeGenerationEventListeners() {
    const showCodeBtn = this.panel.querySelector('#show-code-generator');
    const generateBtn = this.panel.querySelector('#generate-var-code');
    const testBtn = this.panel.querySelector('#test-var-code');

    showCodeBtn?.addEventListener('click', () => {
      this.toggleCodeGeneration();
    });

    generateBtn?.addEventListener('click', () => {
      this.generateCode();
    });

    testBtn?.addEventListener('click', () => {
      this.testCode();
    });
  }

  /**
   * Set up action button event listeners
   */
  setupActionEventListeners() {
    const saveBtn = this.panel.querySelector('#save-variable');
    const cancelBtn = this.panel.querySelector('#cancel-variable');

    saveBtn?.addEventListener('click', () => {
      this.saveVariable();
    });

    cancelBtn?.addEventListener('click', () => {
      if (this.currentView === 'editor') {
        this.showOverview();
      } else {
        this.close();
      }
    });
  }

  /**
   * Set up Variables button listener to open panel
   */
  setupVariablesButtonListener() {
    document.addEventListener('click', (e) => {
      // Check if click is on variables button
      const isVariablesBtn = e.target.matches('.variables-btn') || e.target.closest('.variables-btn');
      
      if (isVariablesBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      }
    });
  }

  /**
   * Set up text selection listener for suggest variables
   */
  setupTextSelectionListener() {
    document.addEventListener('mouseup', (e) => {
      // Skip if panel is already open
      if (this.isOpen) return;

      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const selectedText = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Check for valid text selection in template content
      if (selectedText.length > 0 && rect.width > 0 && rect.height > 0) {
        if (this.isInTemplateContent(selection)) {
          this.selectedText = selectedText;
          this.selectedRange = range.cloneRange();
          
          // Auto-open panel and show editor with selected text
          setTimeout(() => {
            this.open();
            this.showEditor(true); // true = from text selection
          }, 100);
        }
      }
    });
  }

  /**
   * Check if selection is within template content
   */
  isInTemplateContent(selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    let elementToCheck = container;
    if (container.nodeType === Node.TEXT_NODE) {
      elementToCheck = container.parentElement;
    }
    
    return elementToCheck && (
      elementToCheck.closest('.template-editor') !== null ||
      elementToCheck.closest('.preview-content') !== null
    );
  }

  /**
   * Open the side panel
   */
  open() {
    if (!this.panel) {
      console.error('Panel element not found!');
      return;
    }
    
    if (this.isOpen) {
      return;
    }

    this.panel.classList.add('open');
    this.isOpen = true;
    
    // Load current variables and show overview
    this.loadVariablesData();
    this.showOverview();
    
    // Clear any existing modal dialogs
    this.clearFloatingDialogs();
  }

  /**
   * Close the side panel
   */
  close() {
    if (!this.panel || !this.isOpen) return;

    this.panel.classList.remove('open');
    this.isOpen = false;
    this.currentView = 'overview';
    this.editingVariableName = null;
    this.selectedText = null;
    this.selectedRange = null;
    
    // Clear selection
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
  }

  /**
   * Clear any floating dialogs from the old system
   */
  clearFloatingDialogs() {
    // Hide variable dialog if it exists
    if (variablesManager.variableDialog) {
      variablesManager.variableDialog.style.display = 'none';
    }
    
    // Hide variables panel if it exists
    if (variablesManager.variablesPanel) {
      variablesManager.variablesPanel.style.display = 'none';
    }
    
    // Hide floating button if it exists
    if (variablesManager.floatingButton) {
      variablesManager.floatingButton.style.display = 'none';
    }
  }

  /**
   * Show overview section
   */
  showOverview() {
    const overview = this.panel.querySelector('.variables-overview');
    const editor = this.panel.querySelector('.variable-editor');
    
    if (overview && editor) {
      overview.style.display = 'block';
      editor.style.display = 'none';
      this.currentView = 'overview';
    }
    
    this.updateVariablesList();
  }

  /**
   * Show editor section
   */
  showEditor(fromTextSelection = false) {
    const overview = this.panel.querySelector('.variables-overview');
    const editor = this.panel.querySelector('.variable-editor');
    
    if (overview && editor) {
      overview.style.display = 'none';
      editor.style.display = 'block';
      this.currentView = 'editor';
    }

    if (fromTextSelection && this.selectedText) {
      this.populateFromTextSelection();
    } else {
      this.resetEditorForm();
    }
  }

  /**
   * Populate editor from text selection
   */
  populateFromTextSelection() {
    if (!this.selectedText) return;

    // Show selected text preview
    const preview = this.panel.querySelector('#selected-text-preview');
    const display = this.panel.querySelector('#selected-text-display');
    
    if (preview && display) {
      display.textContent = `"${this.selectedText}"`;
      preview.style.display = 'block';
    }

    // Get AI suggestions for the variable
    this.getVariableSuggestions(this.selectedText);
  }

  /**
   * Get AI suggestions for variable creation
   */
  async getVariableSuggestions(text) {
    try {
      // Show loading state
      const nameInput = this.panel.querySelector('#var-name');
      const descInput = this.panel.querySelector('#var-description');
      
      if (nameInput && descInput) {
        nameInput.value = 'Generating suggestions...';
        descInput.value = 'AI is analyzing your selection...';
        nameInput.disabled = true;
        descInput.disabled = true;
      }

      // Use the existing LLM suggestion method from variables manager
      const templateContent = this.getTemplateContent();
      
      const requestData = {
        template_content: templateContent,
        selected_text: text,
        existing_variables: variablesManager.getVariables(),
        document_id: window.documentManager?.activeDocumentId || 'default'
      };

      const response = await fetch('http://127.0.0.1:5000/api/suggest-variable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.suggestion) {
          this.fillFormWithSuggestions(result.suggestion);
        } else {
          this.fillFormWithBasicSuggestions(text);
        }
      } else {
        this.fillFormWithBasicSuggestions(text);
      }
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      this.fillFormWithBasicSuggestions(text);
    } finally {
      // Re-enable form inputs
      const nameInput = this.panel.querySelector('#var-name');
      const descInput = this.panel.querySelector('#var-description');
      
      if (nameInput && descInput) {
        nameInput.disabled = false;
        descInput.disabled = false;
      }
    }
  }

  /**
   * Get current template content
   */
  getTemplateContent() {
    const activeDocument = document.querySelector('.tab-content.active');
    let templateEditor = null;
    
    if (activeDocument) {
      templateEditor = activeDocument.querySelector('.template-editor');
    }
    
    if (!templateEditor) {
      templateEditor = document.querySelector('.template-editor');
    }
    
    return templateEditor ? (templateEditor.textContent || templateEditor.innerText || '') : '';
  }

  /**
   * Fill form with AI suggestions
   */
  fillFormWithSuggestions(suggestions) {
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');

    if (nameInput) nameInput.value = suggestions.name || '';
    if (descInput) descInput.value = suggestions.description || '';
    if (typeSelect) typeSelect.value = suggestions.type || 'text';
    if (formatInput) formatInput.value = suggestions.format || '';
  }

  /**
   * Fill form with basic suggestions
   */
  fillFormWithBasicSuggestions(text) {
    const suggestions = this.generateBasicSuggestions(text);
    this.fillFormWithSuggestions(suggestions);
  }

  /**
   * Generate basic variable suggestions
   */
  generateBasicSuggestions(text) {
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
    const existingVariables = variablesManager.getVariables();
    let counter = 1;
    let name = base;
    
    while (existingVariables[name]) {
      name = `${base}_${counter}`;
      counter++;
    }
    
    return name;
  }

  /**
   * Reset editor form
   */
  resetEditorForm() {
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');
    const preview = this.panel.querySelector('#selected-text-preview');

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (typeSelect) typeSelect.value = 'text';
    if (formatInput) formatInput.value = '';
    if (requiredCheck) requiredCheck.checked = true;
    if (preview) preview.style.display = 'none';

    // Reset other sections
    this.resetValueDisplay();
    this.resetDependencies();
    this.hideCodeGeneration();
  }

  /**
   * Load variables data from variables manager
   */
  async loadVariablesData() {
    // Ensure variables manager is loaded for current document
    if (variablesManager && variablesManager.loadVariables) {
      await variablesManager.loadVariables();
    }
    
    // Update the variables list
    this.updateVariablesList();
  }

  /**
   * Update variables list in overview
   */
  updateVariablesList() {
    const listContainer = this.panel.querySelector('#variables-quick-list');
    if (!listContainer) return;

    const variables = variablesManager.getVariables();
    listContainer.innerHTML = '';

    if (Object.keys(variables).length === 0) {
      listContainer.innerHTML = '<div class="no-variables-message">No variables defined yet.</div>';
      return;
    }

    Object.entries(variables).forEach(([name, variable]) => {
      const item = document.createElement('div');
      item.className = 'variable-quick-item';
      item.innerHTML = `
        <span class="variable-name">${variable.name}</span>
        <span class="variable-type">${variable.type || 'text'}</span>
      `;
      
      // Click to edit variable
      item.addEventListener('click', () => {
        this.editVariable(name);
      });
      
      listContainer.appendChild(item);
    });
  }

  /**
   * Edit an existing variable
   */
  editVariable(variableName) {
    this.editingVariableName = variableName;
    const variables = variablesManager.getVariables();
    const variable = variables[variableName];
    
    if (!variable) return;

    this.showEditor();
    
    // Populate form with variable data
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');
    const editorTitle = this.panel.querySelector('#editor-title');

    if (nameInput) nameInput.value = variable.name || '';
    if (descInput) descInput.value = variable.description || '';
    if (typeSelect) typeSelect.value = variable.type || 'text';
    if (formatInput) formatInput.value = variable.format || '';
    if (requiredCheck) requiredCheck.checked = variable.required !== false;
    if (editorTitle) editorTitle.textContent = 'Edit Variable';

    // Show selected text if available
    if (variable.originalText) {
      const preview = this.panel.querySelector('#selected-text-preview');
      const display = this.panel.querySelector('#selected-text-display');
      
      if (preview && display) {
        display.textContent = `"${variable.originalText}"`;
        preview.style.display = 'block';
      }
    }

    // Update value display
    this.updateValueDisplay(variable.value);
    
    // Update dependencies
    this.updateDependenciesDisplay(variable.dependencies || []);
  }

  /**
   * Save variable
   */
  async saveVariable() {
    const formData = this.getFormData();
    
    if (!this.validateForm(formData)) {
      return;
    }

    try {
      if (this.editingVariableName) {
        // Update existing variable
        await this.updateVariable(formData);
      } else {
        // Create new variable
        await this.createVariable(formData);
      }
      
      // Show success and return to overview
      this.showOverview();
      this.editingVariableName = null;
      this.selectedText = null;
      this.selectedRange = null;
      
    } catch (error) {
      console.error('Error saving variable:', error);
      alert('Error saving variable: ' + error.message);
    }
  }

  /**
   * Get form data
   */
  getFormData() {
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');

    return {
      name: nameInput?.value?.trim() || '',
      description: descInput?.value?.trim() || '',
      type: typeSelect?.value || 'text',
      format: formatInput?.value?.trim() || '',
      required: requiredCheck?.checked || false,
      dependencies: this.getCurrentDependencies()
    };
  }

  /**
   * Validate form data
   */
  validateForm(formData) {
    if (!formData.name) {
      alert('Variable name is required');
      return false;
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formData.name)) {
      alert('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return false;
    }
    
    const existingVariables = variablesManager.getVariables();
    if (!this.editingVariableName && existingVariables[formData.name]) {
      alert('Variable name already exists');
      return false;
    }
    
    if (this.editingVariableName && formData.name !== this.editingVariableName && existingVariables[formData.name]) {
      alert('Variable name already exists');
      return false;
    }
    
    return true;
  }

  /**
   * Create new variable
   */
  async createVariable(formData) {
    const variable = {
      id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      required: formData.required,
      dependencies: formData.dependencies,
      originalText: this.selectedText,
      placeholder: `{{${formData.name}}}`,
      createdAt: new Date().toISOString()
    };

    // Use variables manager to create the variable
    variablesManager.variables.set(variable.name, variable);
    
    // Replace selected text with placeholder if available
    if (this.selectedRange && this.selectedText) {
      this.replaceSelectedTextWithPlaceholder(variable);
    }
    
    await variablesManager.saveVariables();
    variablesManager.updateVariablesUI();
  }

  /**
   * Update existing variable
   */
  async updateVariable(formData) {
    const originalVariable = variablesManager.variables.get(this.editingVariableName);
    if (!originalVariable) {
      throw new Error('Original variable not found');
    }

    const updatedVariable = {
      ...originalVariable,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      required: formData.required,
      dependencies: formData.dependencies,
      placeholder: `{{${formData.name}}}`
    };

    // Handle variable name change
    if (formData.name !== this.editingVariableName) {
      variablesManager.variables.delete(this.editingVariableName);
      variablesManager.variables.set(formData.name, updatedVariable);
    } else {
      variablesManager.variables.set(this.editingVariableName, updatedVariable);
    }

    await variablesManager.saveVariables();
    variablesManager.updateVariablesUI();
  }

  /**
   * Replace selected text with variable placeholder
   */
  replaceSelectedTextWithPlaceholder(variable) {
    if (!this.selectedRange) return;
    
    try {
      const placeholder = document.createTextNode(variable.placeholder);
      this.selectedRange.deleteContents();
      this.selectedRange.insertNode(placeholder);
      window.getSelection().removeAllRanges();
      
      // Trigger change detection for document auto-save
      if (window.documentManager) {
        window.documentManager.onContentChange();
      }
    } catch (error) {
      console.error('Error replacing text with placeholder:', error);
    }
  }

  // Additional methods for value management, dependencies, and code generation will be implemented
  // in the next phase of development...

  /**
   * Value Management Methods
   */
  startValueEditing() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const inputContainer = this.panel.querySelector('#value-input-container');
    const valueInput = this.panel.querySelector('#var-value-input');
    
    if (valueDisplay && inputContainer && valueInput) {
      valueDisplay.style.display = 'none';
      inputContainer.style.display = 'block';
      valueInput.focus();
    }
  }

  saveValue() {
    const valueInput = this.panel.querySelector('#var-value-input');
    const value = valueInput?.value?.trim() || '';
    
    this.updateValueDisplay(value);
    this.cancelValueEditing();
    
    // If editing existing variable, save immediately
    if (this.editingVariableName) {
      variablesManager.setVariableValue(this.editingVariableName, value);
    }
  }

  cancelValueEditing() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const inputContainer = this.panel.querySelector('#value-input-container');
    
    if (valueDisplay && inputContainer) {
      valueDisplay.style.display = 'block';
      inputContainer.style.display = 'none';
    }
  }

  updateValueDisplay(value) {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    if (valueDisplay) {
      valueDisplay.textContent = value || 'Click to set value';
      valueDisplay.className = value ? 'value-display has-value' : 'value-display no-value';
    }
  }

  resetValueDisplay() {
    this.updateValueDisplay('');
  }

  handleDataSourceChange(selectedValue) {
    if (selectedValue === 'manual') {
      this.startValueEditing();
      // Reset select
      const select = this.panel.querySelector('#var-data-source');
      if (select) select.value = '';
    } else if (selectedValue) {
      // Handle data source selection
      this.updateValueDisplay(`[${selectedValue}]`);
    }
  }

  /**
   * Dependencies Management Methods
   */
  showDependencySelector() {
    const selector = this.panel.querySelector('#var-dependency-selector');
    const addBtn = this.panel.querySelector('#add-var-dependency');
    
    if (selector && addBtn) {
      this.populateDependencySelector();
      selector.style.display = 'block';
      addBtn.style.display = 'none';
    }
  }

  hideDependencySelector() {
    const selector = this.panel.querySelector('#var-dependency-selector');
    const addBtn = this.panel.querySelector('#add-var-dependency');
    const select = this.panel.querySelector('#var-dependency-select');
    
    if (selector && addBtn) {
      selector.style.display = 'none';
      addBtn.style.display = 'block';
      if (select) select.value = '';
    }
  }

  populateDependencySelector() {
    const select = this.panel.querySelector('#var-dependency-select');
    if (!select) return;

    // Clear options except default
    const options = select.querySelectorAll('option[data-variable]');
    options.forEach(option => option.remove());

    const variables = variablesManager.getVariables();
    const currentDeps = this.getCurrentDependencies();
    const currentName = this.editingVariableName || this.panel.querySelector('#var-name')?.value?.trim();

    Object.entries(variables).forEach(([name, variable]) => {
      if (name !== currentName && !currentDeps.includes(name)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${variable.type}) - ${variable.description}`;
        option.setAttribute('data-variable', 'true');
        select.appendChild(option);
      }
    });
  }

  addSelectedDependency() {
    const select = this.panel.querySelector('#var-dependency-select');
    const selectedName = select?.value;
    
    if (!selectedName) {
      alert('Please select a variable to add as dependency');
      return;
    }

    const currentDeps = this.getCurrentDependencies();
    if (currentDeps.includes(selectedName)) {
      alert('This variable is already a dependency');
      return;
    }

    this.addDependencyToList(selectedName);
    this.hideDependencySelector();
  }

  addDependencyToList(dependencyName) {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (!list) return;

    // Remove no dependencies message
    const noDepMsg = list.querySelector('.no-dependencies-message');
    if (noDepMsg) noDepMsg.remove();

    const variables = variablesManager.getVariables();
    const variable = variables[dependencyName] || { name: dependencyName, type: 'text', description: '' };

    const item = document.createElement('div');
    item.className = 'dependency-item';
    item.setAttribute('data-dependency-name', dependencyName);
    item.innerHTML = `
      <span class="dependency-name">${variable.name}</span>
      <span class="dependency-type">(${variable.type})</span>
      <span class="dependency-description">${variable.description}</span>
      <button type="button" class="remove-dependency-btn" data-dependency-name="${dependencyName}">×</button>
    `;

    list.appendChild(item);
  }

  removeDependency(dependencyName) {
    const list = this.panel.querySelector('#var-dependencies-list');
    const item = list?.querySelector(`[data-dependency-name="${dependencyName}"]`);
    
    if (item) {
      item.remove();
      
      // Check if no dependencies left
      const remaining = list.querySelectorAll('.dependency-item');
      if (remaining.length === 0) {
        list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      }
    }
  }

  getCurrentDependencies() {
    const list = this.panel.querySelector('#var-dependencies-list');
    const items = list?.querySelectorAll('.dependency-item') || [];
    return Array.from(items).map(item => item.getAttribute('data-dependency-name'));
  }

  updateDependenciesDisplay(dependencies) {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (!list) return;

    list.innerHTML = '';
    
    if (dependencies.length === 0) {
      list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      return;
    }

    dependencies.forEach(depName => {
      this.addDependencyToList(depName);
    });
  }

  resetDependencies() {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (list) {
      list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
    }
  }

  /**
   * Code Generation Methods
   */
  toggleCodeGeneration() {
    const section = this.panel.querySelector('#code-generation-section');
    if (!section) return;

    if (section.style.display === 'none') {
      section.style.display = 'block';
      // Populate data source options when showing code generation
      this.populateCodeGenDataSources();
    } else {
      section.style.display = 'none';
    }
  }

  hideCodeGeneration() {
    const section = this.panel.querySelector('#code-generation-section');
    if (section) section.style.display = 'none';
  }

  /**
   * Populate data source options for code generation
   */
  populateCodeGenDataSources() {
    // For now, use the same data source as the main form
    const mainDataSourceSelect = this.panel.querySelector('#var-data-source');
    const selectedValue = mainDataSourceSelect?.value || '';
    
    if (selectedValue && selectedValue !== 'manual') {
      // Auto-populate from main data source selection
      const instructions = this.panel.querySelector('#code-instructions');
      if (instructions && !instructions.value) {
        const formData = this.getFormData();
        instructions.value = `Calculate ${formData.description || formData.name} using the selected data source.`;
      }
    }
  }

  async generateCode() {
    const formData = this.getFormData();
    const instructions = this.panel.querySelector('#code-instructions')?.value?.trim();
    
    if (!formData.name) {
      alert('Please enter a variable name first');
      return;
    }

    const dependencies = this.getCurrentDependencies();
    const dataSourceSelect = this.panel.querySelector('#var-data-source');
    const selectedDataSource = dataSourceSelect?.value || '';
    const hasDataSource = selectedDataSource && selectedDataSource !== '' && selectedDataSource !== 'manual';
    const hasDependencies = dependencies.length > 0;

    if (!hasDataSource && !hasDependencies && !instructions) {
      alert('Please select a data source, add dependencies, or enter code generation instructions');
      return;
    }

    console.log('Generating code for variable:', formData.name);
    
    // Show loading state
    this.showCodeGenerationLoading(true);

    try {
      // Get current dependency values
      const dependencyValues = await this.getDependencyValues(dependencies);
      
      // Prepare request payload
      const payload = {
        variable_name: formData.name,
        variable_type: formData.type,
        variable_description: formData.description,
        dependencies: dependencies,
        dependency_values: dependencyValues,
        data_source: hasDataSource ? selectedDataSource : null,
        instructions: instructions || '',
        document_id: window.documentManager?.activeDocumentId || 'default'
      };

      let response = null;
      let result = null;

      // Try primary endpoint first
      try {
        response = await fetch('http://127.0.0.1:5000/api/generate-variable-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          result = await response.json();
          this.showGeneratedCode(result.code);
        } else {
          throw new Error('Primary endpoint failed');
        }
      } catch (primaryError) {
        console.warn('Primary code generation endpoint failed, trying fallback...');
        
        // Try fallback endpoint
        try {
          response = await fetch('http://127.0.0.1:5000/api/generate-code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt: `Generate Python code for variable "${formData.name}" (${formData.type}): ${formData.description}. Instructions: ${instructions || 'Calculate the value from available data.'}`,
              context: dependencies.length > 0 ? `Dependencies: ${dependencies.join(', ')}` : ''
            })
          });

          if (response.ok) {
            result = await response.json();
            this.showGeneratedCode(result.code || result.generated_code);
          } else {
            throw new Error('Both endpoints failed');
          }
        } catch (fallbackError) {
          console.error('Both code generation endpoints failed:', fallbackError);
          throw new Error('Code generation service unavailable');
        }
      }

    } catch (error) {
      console.error('Error generating code:', error);
      alert('Error generating code: ' + error.message);
    } finally {
      this.showCodeGenerationLoading(false);
    }
  }

  /**
   * Show generated code in the editor
   */
  showGeneratedCode(code) {
    const container = this.panel.querySelector('#generated-code-container');
    const editor = this.panel.querySelector('#generated-code-editor');
    const testBtn = this.panel.querySelector('#test-var-code');

    if (container && editor) {
      container.style.display = 'block';
      editor.textContent = code;
      
      if (testBtn) {
        testBtn.style.display = 'inline-block';
      }
    }
  }

  /**
   * Show/hide code generation loading state
   */
  showCodeGenerationLoading(show) {
    const generateBtn = this.panel.querySelector('#generate-var-code');
    if (generateBtn) {
      generateBtn.disabled = show;
      generateBtn.textContent = show ? '🤖 Generating...' : 'Generate Code';
    }
  }

  /**
   * Get dependency values for code generation
   */
  async getDependencyValues(dependencies) {
    const dependencyValues = {};
    
    if (!dependencies || dependencies.length === 0) {
      return dependencyValues;
    }

    // Get variables from variables manager
    const variables = variablesManager.getVariables();
    
    for (const depName of dependencies) {
      const variable = variables[depName];
      if (variable && variable.value !== undefined) {
        dependencyValues[depName] = {
          name: variable.name,
          type: variable.type || 'text',
          description: variable.description || '',
          value: variable.value,
          format: variable.format || ''
        };
      } else {
        console.warn(`Dependency ${depName} has no value`);
      }
    }
    
    return dependencyValues;
  }

  async testCode() {
    const editor = this.panel.querySelector('#generated-code-editor');
    const code = editor?.textContent?.trim();
    
    if (!code) {
      alert('No code to test. Please generate code first.');
      return;
    }

    const formData = this.getFormData();
    console.log('Testing code for variable:', formData.name);

    // Show loading state
    const testBtn = this.panel.querySelector('#test-var-code');
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = '🧪 Testing...';
    }

    try {
      // Get dependencies and data source
      const dependencies = this.getCurrentDependencies();
      const dependencyValues = await this.getDependencyValues(dependencies);
      const dataSourceSelect = this.panel.querySelector('#var-data-source');
      const selectedDataSource = dataSourceSelect?.value || '';

      // Execute the code using the existing tool execution utility
      const result = await this.executeGeneratedCode(code, selectedDataSource, dependencyValues);
      
      if (result !== null && result !== undefined) {
        // Update the variable value with the test result
        this.updateValueDisplay(String(result));
        
        // If editing existing variable, save the value immediately
        if (this.editingVariableName) {
          await variablesManager.setVariableValue(this.editingVariableName, String(result));
        }
        
        alert(`Code test successful!\nResult: ${result}`);
      } else {
        alert('Code test completed but returned no result');
      }

    } catch (error) {
      console.error('Error testing code:', error);
      alert('Error testing code: ' + error.message);
    } finally {
      // Reset button state
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Code';
      }
    }
  }

  /**
   * Execute generated code with dependencies and data source
   */
  async executeGeneratedCode(code, dataSource, dependencyValues) {
    // Import the execution utility if available
    if (window.executeCodeForAuthorLocal) {
      return await window.executeCodeForAuthorLocal(code, dataSource, dependencyValues);
    }
    
    // Fallback: try to execute via API
    try {
      const response = await fetch('http://127.0.0.1:5000/api/execute-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          data_source: dataSource,
          dependencies: dependencyValues,
          document_id: window.documentManager?.activeDocumentId || 'default'
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.result;
      } else {
        throw new Error('Code execution API failed');
      }
    } catch (error) {
      console.error('Error executing code:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const variablesSidePanel = new VariablesSidePanel();
export default variablesSidePanel;