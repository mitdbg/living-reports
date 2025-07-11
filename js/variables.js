// Variables Management Module
import { state, elements, updateState } from './state.js';
import { createDocumentDialog, createDocumentElementId, getDocumentElement, registerElement } from './element-id-manager.js';
import { variableToolGenerator } from './variable-operator-generator.js';
import { hideFloatingComment } from './comments.js';

/**
 * Variables Management System
 * Handles text selection, variable creation, and persistence with dependency tracking
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
   * Dependency Management Methods
   */
  
  /**
   * Check if adding a dependency would create a cycle
   * @param {string} variableName - The variable that will depend on dependencies
   * @param {Array<string>} dependencies - List of variables to depend on
   * @returns {boolean} - True if adding these dependencies would create a cycle
   */
  wouldCreateCycle(variableName, dependencies) {
    // Create a temporary graph with the new dependencies
    const tempGraph = new Map();
    
    // Add existing dependencies to the graph
    this.variables.forEach((variable, name) => {
      tempGraph.set(name, variable.dependencies || []);
    });
    
    // Add the new dependencies
    tempGraph.set(variableName, dependencies);
    
    // Check for cycles using DFS
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = (node) => {
      if (recursionStack.has(node)) {
        return true; // Back edge found, cycle detected
      }
      
      if (visited.has(node)) {
        return false; // Already processed
      }
      
      visited.add(node);
      recursionStack.add(node);
      
      const nodeDependencies = tempGraph.get(node) || [];
      for (const dependency of nodeDependencies) {
        if (hasCycle(dependency)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    // Check all variables for cycles
    for (const [name] of tempGraph) {
      if (!visited.has(name)) {
        if (hasCycle(name)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get variables in dependency order (topological sort)
   * @returns {Array<string>} - Variable names in execution order
   */
  getVariablesInDependencyOrder() {
    const graph = new Map();
    const inDegree = new Map();
    
    // Build the graph and calculate in-degrees
    this.variables.forEach((variable, name) => {
      const dependencies = variable.dependencies || [];
      graph.set(name, dependencies);
      inDegree.set(name, 0);
    });
    
    // Calculate in-degrees (how many variables each variable depends on)
    graph.forEach((dependencies, name) => {
      inDegree.set(name, dependencies.length);
    });
    
    // Topological sort using Kahn's algorithm with stable ordering
    const queue = [];
    const result = [];
    
    // Start with variables that have no dependencies
    inDegree.forEach((degree, name) => {
      if (degree === 0) {
        queue.push(name);
      }
    });
    
    // Sort queue to ensure stable ordering (alphabetical order for same in-degree)
    queue.sort();
    
    while (queue.length > 0) {
      const current = queue.shift();
      result.push(current);
      
      // Find all variables that depend on the current variable
      const dependents = [];
      graph.forEach((dependencies, varName) => {
        if (dependencies.includes(current)) {
          dependents.push(varName);
        }
      });
      
      // Reduce in-degree for all variables that depend on the current variable
      dependents.forEach(dependent => {
        const currentInDegree = inDegree.get(dependent);
        inDegree.set(dependent, currentInDegree - 1);
        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      });
      
      // Sort queue to maintain stable ordering for variables with same in-degree
      queue.sort();
    }
    
    // If result doesn't include all variables, there's a cycle
    if (result.length !== this.variables.size) {
      console.warn('Cycle detected in variable dependencies');
      const remaining = Array.from(this.variables.keys()).filter(name => !result.includes(name));
      
      // Sort remaining variables to maintain stable ordering
      remaining.sort();
      
      // For now, return variables in dependency order, with remaining variables at the end
      // This is a fallback that should work for most cases
      return [...result, ...remaining];
    }
    
    return result;
  }

  /**
   * Find all variables that depend on a given variable
   * @param {string} variableName - The variable to find dependents for
   * @returns {Array<string>} - Array of variable names that depend on the given variable
   */
  findDependentVariables(variableName) {
    const dependents = [];
    
    this.variables.forEach((variable, name) => {
      const dependencies = variable.dependencies || [];
      if (dependencies.includes(variableName)) {
        dependents.push(name);
      }
    });
    
    return dependents;
  }

  /**
   * Get dependent variables in execution order (topological sort)
   * @param {string} changedVariableName - The variable that changed
   * @returns {Array<string>} - Dependent variable names in execution order
   */
  getDependentVariablesInOrder(changedVariableName) {
    // Get all variables that transitively depend on the changed variable
    const allDependents = new Set();
    const queue = [changedVariableName];
    
    while (queue.length > 0) {
      const current = queue.shift();
      const directDependents = this.findDependentVariables(current);
      
      directDependents.forEach(dependent => {
        if (!allDependents.has(dependent)) {
          allDependents.add(dependent);
          queue.push(dependent);
        }
      });
    }
    
    // If no dependents, return empty array
    if (allDependents.size === 0) {
      return [];
    }
    
    // Get all variables in dependency order and filter to only include dependents
    const allVariablesInOrder = this.getVariablesInDependencyOrder();
    return allVariablesInOrder.filter(name => allDependents.has(name));
  }

  /**
   * Re-execute dependent variables when a variable value changes
   * @param {string} changedVariableName - The variable that changed
   */
  async propagateUpdatesToDependents(changedVariableName) {
    
    // Get dependent variables in execution order
    const dependentVariables = this.getDependentVariablesInOrder(changedVariableName);
    
    if (dependentVariables.length === 0) {
      return;
    }
    
    // Re-execute each dependent variable in order
    for (const dependentVariableName of dependentVariables) {
      try {
        // Get the variable data
        const variableData = this.variables.get(dependentVariableName);
        if (!variableData) {
          console.warn(`❌ Variable ${dependentVariableName} not found, skipping`);
          continue;
        }
        
        // Check if the variable has a tool/operator that can be executed
        if (window.variableToolGenerator) {
          await this.executeVariableOperator(dependentVariableName, variableData);
        } else {
          console.warn(`⚠️ Variable tool generator not available for: ${dependentVariableName}`);
        }
        
      } catch (error) {
        console.error(`❌ Error re-executing variable ${dependentVariableName}:`, error);
        // Continue with other variables even if one fails
      }
    }
  }

  /**
   * Execute a variable's operator to update its value
   * @param {string} variableName - The variable to execute
   * @param {Object} variableData - The variable data
   */
  async executeVariableOperator(variableName, variableData) {
    try {
      // Check if variable has dependencies
      if (!variableData.dependencies || variableData.dependencies.length === 0) {
        return;
      }
      
      // Get dependency values (structure must match getDependencyValues format)
      const dependencyValues = {};
      let hasAllDependencyValues = true;
      
      for (const depName of variableData.dependencies) {
        const depVariable = this.variables.get(depName);
        if (depVariable && depVariable.value !== undefined) {
          // Structure dependency values the same way as getDependencyValues method
          dependencyValues[depName] = {
            name: depVariable.name,
            type: depVariable.type || 'text',
            description: depVariable.description || '',
            value: depVariable.value,
            format: depVariable.format || ''
          };
        } else {
          console.warn(`❌ Dependency ${depName} for variable ${variableName} has no value`);
          hasAllDependencyValues = false;
        }
      }
      
      if (!hasAllDependencyValues) {
        return;
      }
      
      // Check if variable has generated code/operator
      if (window.variableToolGenerator && window.variableToolGenerator.variableExecutionResults) {
        const result = window.variableToolGenerator.variableExecutionResults.get(variableName);
        
        if (result && result.generatedCode) {
          // Re-execute the variable's generated code with new dependency values
          await this.executeVariableCode(variableName, result.generatedCode, dependencyValues);
          return;
        } else {
          
          if (window.variableToolGenerator.variableExecutionResults) {
            console.log(`📋 Available execution results:`, Array.from(window.variableToolGenerator.variableExecutionResults.keys()));
            // Show structure of each result
            window.variableToolGenerator.variableExecutionResults.forEach((value, key) => {
              console.log(`📋 ${key}:`, {
                hasGeneratedCode: !!value.generatedCode,
                hasExecutionResult: !!value.executionResult,
                dependencies: value.dependencies
              });
            });
          }
        }
      }
      
      // If no generated code found, check if there's an operator/tool defined for this variable
      if (window.operatorsModule && window.operatorsModule.getOperatorForVariable) {
        const operator = window.operatorsModule.getOperatorForVariable(variableName);
        if (operator) {
          await window.operatorsModule.executeInstanceById(operator.id);
          return;
        }
      }
    } catch (error) {
      console.error(`❌ Error executing variable operator for ${variableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute variable code with dependency values
   * @param {string} variableName - The variable name
   * @param {string} code - The generated code
   * @param {Object} dependencyValues - The dependency values
   */
  async executeVariableCode(variableName, code, dependencyValues) {
    try {
      // Get the variable data source information
      const variableData = this.variables.get(variableName);
      const dataSource = variableData?.dataSource || null;
      
      // Use the variable tool generator to execute the code
      if (window.variableToolGenerator) {
        const result = await window.variableToolGenerator.executeCodeIsolatedWithDependencies(
          code, 
          dataSource, 
          dependencyValues, 
          variableName
        );
        
        if (result !== null && result !== undefined) {
          // Update the variable's value using setVariableValue but skip propagation to avoid infinite loops
          // (since this is already part of a propagation chain)
          await this.setVariableValue(variableName, result, true); // Skip propagation
        } else {
          console.error(`❌ Failed to execute code for variable ${variableName}: null/undefined result`);
        }
      } else {
        console.error(`❌ window.variableToolGenerator not available`);
      }
      
    } catch (error) {
      console.error(`❌ Error executing variable code for ${variableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Get available variables for dependency selection (excluding the variable itself)
   * @param {string} currentVariableName - The variable being edited (to exclude from list)
   * @returns {Array<Object>} - Array of variable objects with name and description
   */
  getAvailableVariablesForDependency(currentVariableName) {
    const availableVariables = [];
    
    this.variables.forEach((variable, name) => {
      if (name !== currentVariableName) {
        availableVariables.push({
          name: name,
          description: variable.description || '',
          type: variable.type || 'text',
          placeholder: variable.placeholder || `{{${name}}}`
        });
      }
    });
    
    return availableVariables.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Initialize the variables management system
   */
  init() {
    if (this.initialized) {
      return;
    }
    
    try {
      this.createFloatingButton();
      
      this.setupVariablesEventListeners();
      
      this.setupTextSelection();
      
      // Initialize variable tool generator
      variableToolGenerator.init();
      
      this.initialized = true;
    } catch (error) {
      console.error('Error during Variables Manager initialization:', error);
    }
  }

  /**
   * Create the floating "Suggest Variables" button
   */
  createFloatingButton() {
    this.floatingButton = document.createElement('div');
    this.floatingButton.className = 'floating-variable-button';
    this.floatingButton.innerHTML = '<button class="suggest-variables-btn">🔧 Suggest Variables</button>';
    this.floatingButton.style.display = 'none';
    this.floatingButton.style.position = 'absolute';
    this.floatingButton.style.zIndex = '10000';
    
    document.body.appendChild(this.floatingButton);

    const suggestBtn = this.floatingButton.querySelector('.suggest-variables-btn');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        // Hide floating comment when SuggestVariable button is clicked
        if (typeof hideFloatingComment === 'function') {
          hideFloatingComment();
        }
        
        // Hide the SuggestVariable button itself after clicking
        this.hideFloatingButton();
        
        this.showVariableDialog();
      });
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
      
      // Early validation before setTimeout (same checks as comments.js)
      if (selection.rangeCount === 0) {
        this.hideFloatingButton();
        return;
      }
      
      const selectedText = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Check for valid text selection with visible dimensions
      if (!this.isInTemplateContent(selection) || selectedText.length === 0 || rect.width === 0 || rect.height === 0) {
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
    
    // Early return if no selection range (same as comments.js)
    if (selection.rangeCount === 0) {
      this.hideFloatingButton();
      return;
    }
    
    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Key fix: Check for visible selection dimensions (same validation as comments.js)
    if (selectedText.length > 0 && rect.width > 0 && rect.height > 0) {
      const isInTemplate = this.isInTemplateContent(selection);
      
      if (isInTemplate) {
        this.selectedText = selectedText;
        this.selectedRange = range.cloneRange();
        
        // Check if we should show the button (don't show if dialog is open)
        const shouldShow = !this.variableDialog || this.variableDialog.style.display === 'none';
        
        if (shouldShow) {
          this.showFloatingButton(e);
        }
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
            
            <div class="form-group">
              <label for="variable-dependencies">Dependencies:</label>
              <div class="dependencies-section">
                <div class="dependencies-list" id="variable-dependencies-list">
                  <div class="no-dependencies-message">No dependencies selected</div>
                </div>
                <button type="button" class="add-dependency-btn" id="add-dependency-btn">+ Add Dependency</button>
                <div class="dependency-selector" id="dependency-selector" style="display: none;">
                  <select id="dependency-select">
                    <option value="">Select a variable...</option>
                  </select>
                  <button type="button" class="confirm-dependency-btn" id="confirm-dependency-btn">Add</button>
                  <button type="button" class="cancel-dependency-btn" id="cancel-dependency-btn">Cancel</button>
                </div>
              </div>
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
        this.clearSelectionAndHideDialog();
      }
      
      const action = e.target.getAttribute('data-action');
      if (action === 'close' || action === 'cancel') {
        this.clearSelectionAndHideDialog();
      } else if (action === 'add-variable') {
        await this.createVariable();
      } else if (action === 'update-variable') {
        const variableName = e.target.getAttribute('data-variable-name');
        await this.updateVariable(variableName);
      } else if (action === 'open-tool-generator') {
        await this.openToolGenerator();
      }
      
      // Handle dependency management
      const elementId = e.target.id;
      const activeDocId = window.documentManager?.activeDocumentId;
      
      if (elementId && activeDocId) {
        if (elementId.includes('add-dependency-btn')) {
          this.showDependencySelector();
        } else if (elementId.includes('confirm-dependency-btn')) {
          this.addSelectedDependency();
        } else if (elementId.includes('cancel-dependency-btn')) {
          this.hideDependencySelector();
        } else if (e.target.classList.contains('remove-dependency-btn')) {
          const dependencyName = e.target.getAttribute('data-dependency-name');
          this.removeDependency(dependencyName);
        } else if (elementId.includes('variable-value-display')) {
          this.startValueEditingInDialog();
        } else if (elementId.includes('save-variable-value')) {
          await this.saveVariableValueInDialog();
        } else if (elementId.includes('cancel-variable-value')) {
          this.cancelValueEditingInDialog();
        }
      }
    });

     // Add change event listener for data source select
     this.variableDialog.addEventListener('change', async (e) => {
       const elementId = e.target.id;
       if (elementId && elementId.includes('data-source-select')) {
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
    
    const listElement = this.variablesPanel.querySelector('[id*="variables-list"]');
    const msgElement = this.variablesPanel.querySelector('[id*="no-variables-message"]');
    
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
      const basicSuggestions = this.generateVariableSuggestions(this.selectedText);
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
    
    // Hide floating comment when variable dialog is shown
    if (typeof hideFloatingComment === 'function') {
      hideFloatingComment();
    }
    
    // Check if the current dialog reference is valid (still in DOM)
    const dialogExists = this.variableDialog && document.body.contains(this.variableDialog);
    
    // Create dialog if it doesn't exist or if it's been removed from DOM
    if (!this.variableDialog || !dialogExists) {
      
      // Clear stale reference if it exists but not in DOM
      if (this.variableDialog && !dialogExists) {
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
    }
    
    // If we're in editing mode, populate the form with existing variable data
    if (isEditing && this._editingVariable && this._editingVariableName) {
      // Use setTimeout to ensure DOM elements are ready after dialog creation
      setTimeout(() => {
        this.populateEditForm(this._editingVariable, this._editingVariableName);
      }, 0);
    }
    
    this.variableDialog.style.display = 'flex';
    this.hideFloatingButton();

    // Populate data source select
    this.populateDataSourceSelect();

    // Only call LLM suggestions when creating a new variable, not when editing
    if (!isEditing) {
      this.populateVariableSuggestions();
    }
  }

  hideVariableDialog() {
    if (this.variableDialog) {
      this.variableDialog.style.display = 'none';
      // Reset dialog to create mode when closed
      this.resetDialogToCreateMode();
    }
  }

  /**
   * Clear text selection and hide dialog (prevents button from showing again)
   */
  clearSelectionAndHideDialog() {
    
    // Clear the text selection
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    
    // Clear our internal selection state
    this.selectedText = null;
    this.selectedRange = null;
    
    // Clear editing state
    this.clearEditingState();
    
    // Hide the dialog
    this.hideVariableDialog();
  }
  
  /**
   * Clear all editing state variables
   */
  clearEditingState() {
    this._editingVariable = null;
    this._editingVariableName = null;
    this._temporaryValue = undefined;
    this.currentSuggestion = null;
  }

  async showVariablesPanel() {
    
    // Check if the current panel reference is valid (still in DOM)
    const panelExists = this.variablesPanel && document.body.contains(this.variablesPanel);
    
    // Create panel if it doesn't exist or if it's been removed from DOM
    if (!this.variablesPanel || !panelExists) {
      
      // Clear stale reference if it exists but not in DOM
      if (this.variablesPanel && !panelExists) {
        this.variablesPanel = null;
      }
      
      // IMPORTANT: Remove any existing variables panels to prevent duplicate IDs
      const existingPanels = document.querySelectorAll('.variables-panel-dialog');
      existingPanels.forEach((panel, index) => {
        panel.remove();
      });
      
      this.createVariablesPanelDialog();
    }
    
    if (!this.variablesPanel) {
      console.error('Variables panel could not be created!');
      return;
    }
    
    // Load latest variables from backend before showing
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
  async createVariable() {
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
      dependencies: formData.dependencies || [],
      originalText: this.selectedText,
      placeholder: `{{${formData.name}}}`,
      createdAt: new Date().toISOString(),
      // Add smart replacement fields if available from LLM suggestions
      value_to_replace: formData.value_to_replace || this.selectedText,
      static_prefix: formData.static_prefix || '',
      static_suffix: formData.static_suffix || ''
    };
    
    // First add the variable to the map without a value
    this.variables.set(variable.name, variable);
    this.replaceSelectedTextWithPlaceholder(variable);
    
    // If there's an initial value, use setVariableValue to trigger propagation
    // (this handles cases where a variable is recreated and needs to update dependents)
    if (this._temporaryValue) {
      await this.setVariableValue(variable.name, this._temporaryValue);
    } else {
      // No initial value, just save normally
      await this.saveVariables();
    }
    
    // Clear temporary value
    this._temporaryValue = undefined;
    
    this.updateVariablesUI();
    this.clearSelectionAndHideDialog(); // Clear selection to prevent button re-showing
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
    
    // Get dependencies from the UI
    const dependencies = this.getCurrentDependencies();
    
    return {
      name: nameInput?.value?.trim() || '',
      description: descInput?.value?.trim() || '',
      type: typeSelect?.value || 'text',
      format: formatInput?.value?.trim() || '',
      required: requiredCheckbox?.checked || false,
      dependencies: dependencies,
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
    }
  }

  /**
   * Update variables list in panel - Updated to use document-specific IDs
   */
  updateVariablesList() {
    
    // Debug: Check what document ID we're using
    const currentDocId = window.documentManager?.activeDocumentId;
    
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
    
    this.variables.forEach((variable, name) => {
      const variableItem = document.createElement('div');
      variableItem.className = 'variable-item';
      
      const dependencies = variable.dependencies || [];
      const dependenciesHtml = dependencies.length > 0 
        ? `<div class="variable-dependencies">
             <strong>Dependencies:</strong> ${dependencies.map(dep => `<span class="dependency-tag">${dep}</span>`).join(', ')}
           </div>`
        : '';
      
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
        ${dependenciesHtml}
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
    
    // Load latest variable data from backend first
    await this.refreshVariablesFromBackend();
    
    const variable = this.variables.get(variableName);
    
    if (!variable) {
      console.error('Variable not found for editing:', variableName);
      return;
    }
    
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
     // Show confirmation dialog
     if (confirm(`Are you sure you want to remove the variable "${variableName}"?`)) {
       // Remove from variables map
       this.variables.delete(variableName);
       
       // Update the UI
       this.updateVariablesList();
       this.updateVariablesUI();
       
       // Save changes to backend
       this.saveVariables();
       
     }
   }

   /**
    * Update an existing variable
    */
   async updateVariable(variableName) {
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
     
     // Store original value for comparison
     const originalValue = originalVariable.value;
     const newValue = this._temporaryValue !== undefined ? 
       (this._temporaryValue === '' ? undefined : this._temporaryValue) : 
       originalValue;
     
     // Create updated variable object, preserving original text and other properties
     const updatedVariable = {
       ...originalVariable,
       name: formData.name,
       description: formData.description,
       type: formData.type,
       format: formData.format,
       required: formData.required,
       dependencies: formData.dependencies || [],
       placeholder: `{{${formData.name}}}`
     };
     
     // Handle variable name change
     const nameChanged = formData.name !== variableName;
     if (nameChanged) {
       // Remove old entry and add new one (without value first)
       this.variables.delete(variableName);
       this.variables.set(formData.name, updatedVariable);
     } else {
       // Just update the existing entry (without value first)
       this.variables.set(variableName, updatedVariable);
     }
     
     // Save metadata changes to backend first
     await this.saveVariables();
     
     // Now handle value update using setVariableValue for proper propagation
     const finalVariableName = formData.name; // Use the new name if it changed
     
     if (originalValue !== newValue) {
       await this.setVariableValue(finalVariableName, newValue);
     } else {
       // Update UI anyway since metadata might have changed
       this.updateVariablesUI();
     }
     
     // Clear temporary value
     this._temporaryValue = undefined;
     
     // Close dialog and reset to create mode
     this.clearSelectionAndHideDialog();
     this.resetDialogToCreateMode();
     
   }

     /**
   * Populate the edit form with variable data
   */
  populateEditForm(variable, variableName) {
    try {
      // Fill the dialog with existing variable data
      const nameInput = getDocumentElement('variable-name');
      const descInput = getDocumentElement('variable-description');
      const typeSelect = getDocumentElement('variable-type');
      const formatInput = getDocumentElement('variable-format');
      const requiredCheckbox = getDocumentElement('variable-required');
      
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
      
      // Populate dependencies
      this.populateDependenciesInEditForm(variable);
      
      // Change dialog title and button text for editing
      const dialogTitle = this.variableDialog.querySelector('h3');
      const addButton = this.variableDialog.querySelector('[data-action="add-variable"]');
      
      if (dialogTitle) dialogTitle.textContent = '✏️ Edit Variable';
      if (addButton) {
        addButton.textContent = 'Update Variable';
        addButton.setAttribute('data-action', 'update-variable');
        addButton.setAttribute('data-variable-name', variableName);
      }
      
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
      
      // Reset dependencies
      const dependenciesList = getDocumentElement('variable-dependencies-list');
      if (dependenciesList) {
        dependenciesList.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      }
      
      // Hide dependency selector if visible
      this.hideDependencySelector();
    }
    
    // Clear editing state
    this.clearEditingState();
  }

  /**
   * Generate tool for an existing variable from the variables panel
   */
  async generateToolForVariable(variableName) {
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
      dependencies: variable.dependencies || [],
      originalText: variable.originalText || ''
    };
    
    // Show the tool generator (variables panel should already be open)
    await variableToolGenerator.show(variableData, this.variablesPanel);
  }

  /**
   * Open the tool generator for the current variable
   */
  async openToolGenerator() {
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
      this.clearSelectionAndHideDialog(); // Clear selection to prevent button re-showing
      
      // Step 3: Show the floating window for tool/operator editing
      console.log('Step 3: Showing tool generator floating window...');
      
      // Create variable data object for tool generator
      const variableData = {
        name: formData.name,
        description: formData.description || '',
        type: formData.type || 'text',
        format: formData.format || '',
        required: formData.required || false,
        dependencies: formData.dependencies || [],
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
  async setVariableValue(variableName, value, skipPropagation = false) {
    if (!variableName || !variableName.trim()) {
      throw new Error('Variable name is required');
    }

    // Validate variable name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variableName)) {
      throw new Error('Variable name must be a valid identifier (letters, numbers, underscore, starting with letter or underscore)');
    }

    // If variable is not in vars manager, skip it.
    if (!this.variables.has(variableName)) {
      console.warn(`❌ Variable ${variableName} not found in variables manager, skipping`);
      return;
    }

    const existingVariable = this.variables.get(variableName);
    const oldValue = existingVariable.value;
    
    // Only trigger updates if the value actually changed
    if (oldValue !== value) {
      existingVariable.value = value;
      existingVariable.lastUpdated = new Date().toISOString();
      this.variables.set(variableName, existingVariable);
      
      // Update UI first
      this.updateVariablesUI();

      // Save to backend
      await this.saveVariables();

      // Trigger automatic update propagation to dependent variables
      if (!skipPropagation) {
        await this.propagateUpdatesToDependents(variableName);
      }
    }
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
          
        }
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
          // Update existing variables with fresh data from backend
          this.variables.clear();
          
          Object.entries(data.variables).forEach(([name, variable]) => {
            this.variables.set(name, variable);
          });
          
          // Update variables list display if panel is visible
          if (this.variablesPanel && this.variablesPanel.style.display === 'flex') {
            this.updateVariablesList();
          }
          
          this.updateVariablesUI();
        }
      }

    } catch (error) {
      console.error('Error refreshing variables from backend:', error);
    }
  }

  /**
   * Clear all variables for current document (called before loading new document)
   */
  clearDocumentVariables() {
    // Clear variables from memory
    this.variables.clear();
    
    // Hide all dialogs
    this.hideVariableDialog();
    this.hideVariablesPanel();
    this.hideFloatingButton();
    
    // Clear dialog references so they get recreated for new document
    if (this.variableDialog) {
      this.variableDialog.remove();
      this.variableDialog = null;
    }
    if (this.variablesPanel) {
      this.variablesPanel.remove();
      this.variablesPanel = null;
    }
    
    // Clear variable tool generator dialog if it exists
    if (window.variableToolGenerator && window.variableToolGenerator.generatorDialog) {
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
  }

  /**
   * Load variables for a document (when opening/creating) with registration
   */
  loadDocumentVariables() {
    const activeDocumentId = window.documentManager?.activeDocumentId;
    if (!activeDocumentId) {
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
        
        // Use setVariableValue to ensure proper propagation
        await this.setVariableValue(this._editingVariableName, newValue || undefined);
        
        // Show success notification
        this.showVariableUpdateNotification();
      }
      
    } else {
      console.error('❌ Required dialog elements not found for saving value');
    }
  }

  cancelValueEditingInDialog() {
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

  /**
   * Dependency Management UI Methods
   */
  
  showDependencySelector() {
    const selector = getDocumentElement('dependency-selector');
    const addBtn = getDocumentElement('add-dependency-btn');
    
    if (selector && addBtn) {
      // Populate the selector with available variables
      this.populateDependencySelector();
      
      // Show selector, hide add button
      selector.style.display = 'block';
      addBtn.style.display = 'none';
    }
  }
  
  hideDependencySelector() {
    const selector = getDocumentElement('dependency-selector');
    const addBtn = getDocumentElement('add-dependency-btn');
    
    if (selector && addBtn) {
      selector.style.display = 'none';
      addBtn.style.display = 'block';
      
      // Clear selection
      const select = getDocumentElement('dependency-select');
      if (select) {
        select.value = '';
      }
    }
  }
  
  populateDependencySelector() {
    const select = getDocumentElement('dependency-select');
    if (!select) return;
    
    // Clear existing options except the default one
    const existingOptions = select.querySelectorAll('option[data-variable]');
    existingOptions.forEach(option => option.remove());
    
    // Get current variable name (for editing) or empty string (for creation)
    const currentVariableName = this._editingVariableName || '';
    
    // Get current dependencies to exclude already selected ones
    const currentDependencies = this.getCurrentDependencies();
    
    // Get available variables
    const availableVariables = this.getAvailableVariablesForDependency(currentVariableName);
    
    if (availableVariables.length === 0) {
      const noVarOption = document.createElement('option');
      noVarOption.value = '';
      noVarOption.textContent = 'No other variables available';
      noVarOption.disabled = true;
      select.appendChild(noVarOption);
      return;
    }
    
    // Add each available variable as an option
    availableVariables.forEach(variable => {
      // Skip if already selected as dependency
      if (currentDependencies.includes(variable.name)) {
        return;
      }
      
      const option = document.createElement('option');
      option.value = variable.name;
      option.textContent = `${variable.name} (${variable.type}) - ${variable.description}`;
      option.setAttribute('data-variable', 'true');
      option.setAttribute('data-variable-name', variable.name);
      option.setAttribute('data-variable-type', variable.type);
      select.appendChild(option);
    });
  }
  
  addSelectedDependency() {
    const select = getDocumentElement('dependency-select');
    if (!select) return;
    
    const selectedVariableName = select.value;
    if (!selectedVariableName) {
      alert('Please select a variable to add as dependency');
      return;
    }
    
    // Get current dependencies
    const currentDependencies = this.getCurrentDependencies();
    
    // Check if already exists
    if (currentDependencies.includes(selectedVariableName)) {
      alert('This variable is already a dependency');
      return;
    }
    
    // Get current variable name for cycle detection
    const currentVariableName = this._editingVariableName || 
                               getDocumentElement('variable-name')?.value?.trim() || '';
    
    if (!currentVariableName) {
      alert('Please enter a variable name first');
      return;
    }
    
    // Check for cycles
    const newDependencies = [...currentDependencies, selectedVariableName];
    if (this.wouldCreateCycle(currentVariableName, newDependencies)) {
      alert('Adding this dependency would create a circular dependency. Please choose a different variable.');
      return;
    }
    
    // Add dependency to the list
    this.addDependencyToList(selectedVariableName);
    
    // Hide selector
    this.hideDependencySelector();
  }
  
  removeDependency(dependencyName) {
    const dependenciesList = getDocumentElement('variable-dependencies-list');
    if (!dependenciesList) return;
    
    // Remove the dependency item
    const dependencyItem = dependenciesList.querySelector(`[data-dependency-name="${dependencyName}"]`);
    if (dependencyItem) {
      dependencyItem.remove();
    }
    
    // Check if no dependencies left
    const remainingDependencies = dependenciesList.querySelectorAll('.dependency-item');
    if (remainingDependencies.length === 0) {
      dependenciesList.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
    }
  }
  
  addDependencyToList(dependencyName) {
    const dependenciesList = getDocumentElement('variable-dependencies-list');
    if (!dependenciesList) return;
    
    // Remove "no dependencies" message
    const noDepMessage = dependenciesList.querySelector('.no-dependencies-message');
    if (noDepMessage) {
      noDepMessage.remove();
    }
    
    // Get variable info
    const variable = this.variables.get(dependencyName);
    const variableInfo = variable || { name: dependencyName, description: '', type: 'text' };
    
    // Create dependency item
    const dependencyItem = document.createElement('div');
    dependencyItem.className = 'dependency-item';
    dependencyItem.setAttribute('data-dependency-name', dependencyName);
    
    dependencyItem.innerHTML = `
      <span class="dependency-name">${variableInfo.name}</span>
      <span class="dependency-type">(${variableInfo.type})</span>
      <span class="dependency-description">${variableInfo.description}</span>
      <button type="button" class="remove-dependency-btn" data-dependency-name="${dependencyName}">×</button>
    `;
    
    dependenciesList.appendChild(dependencyItem);
  }
  
  getCurrentDependencies() {
    const dependenciesList = getDocumentElement('variable-dependencies-list');
    if (!dependenciesList) return [];
    
    const dependencyItems = dependenciesList.querySelectorAll('.dependency-item');
    return Array.from(dependencyItems).map(item => 
      item.getAttribute('data-dependency-name')
    );
  }
  
  populateDependenciesInEditForm(variable) {
    const dependenciesList = getDocumentElement('variable-dependencies-list');
    if (!dependenciesList) return;
    
    // Clear existing dependencies
    dependenciesList.innerHTML = '';
    
    const dependencies = variable.dependencies || [];
    
    if (dependencies.length === 0) {
      dependenciesList.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      return;
    }
    
    // Add each dependency to the list
    dependencies.forEach(dependencyName => {
      this.addDependencyToList(dependencyName);
    });
  }

  populateDataSourceSelect() {
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
        console.log(`🔧 Editing existing variable with data source: ${this._editingVariableName}`);
        
        // Use setVariableValue to ensure proper propagation
        await this.setVariableValue(this._editingVariableName, displayValue);
        
        // Show success notification
        this.showVariableUpdateNotification();
      }
      
    }
  }


}

// Create and export singleton instance
export const variablesManager = new VariablesManager();
export default variablesManager;

// Export functions for DocumentManager integration
export function resetVariablesInitialization() {
  variablesManager.clearDocumentVariables();
  
  // Clear window reference
  if (window.variablesManager) {
    window.variablesManager = null;
  }
}

export function initVariablesForDocument() {
  variablesManager.loadDocumentVariables();
} 