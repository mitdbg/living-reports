// operators Module
import { elements, state, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';

// Create window-specific storage
const CODE_INSTANCES_KEY = `operators_${windowId}`;
if (!window[CODE_INSTANCES_KEY]) {
  window[CODE_INSTANCES_KEY] = {
    instances: new Map(),
    currentEditingInstance: null,
    executionQueue: []
  };
}

const operatorsData = window[CODE_INSTANCES_KEY];

// operator Class
class Operator {
  constructor(options) {
    this.id = options.id || this.generateId();
    this.name = options.name || 'Untitled Instance';
    this.toolId = options.toolId;
    this.toolName = options.toolName || '';
    this.inputDatasets = options.inputDatasets || []; // Array of dataset references
    this.parameters = options.parameters || {};
    this.outputFormat = options.outputFormat || ['result'];
    this.lastExecuted = options.lastExecuted || null;
    this.output = options.output || null;
    this.status = options.status || 'idle'; // idle, running, completed, error
    this.error = options.error || null;
    this.createdAt = options.createdAt || new Date().toISOString();
    this.updatedAt = options.updatedAt || new Date().toISOString();
    this.documentId = options.documentId || (window.documentManager?.activeDocumentId || 'default');
    this.createdBy = options.createdBy || getCurrentUser()?.id || 'unknown';
  }

  generateId() {
    return 'instance_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      toolId: this.toolId,
      toolName: this.toolName,
      inputDatasets: this.inputDatasets,
      parameters: this.parameters,
      outputFormat: this.outputFormat,
      lastExecuted: this.lastExecuted,
      output: this.output,
      status: this.status,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      documentId: this.documentId,
      createdBy: this.createdBy
    };
  }

  static fromJSON(data) {
    return new Operator(data);
  }
}

// operator Manager
class OperatorManager {
  constructor() {
    this.instances = operatorsData.instances;
    this.loadInstances();
  }

  createInstance(options) {
    const instance = new Operator(options);
    this.instances.set(instance.id, instance);
    this.saveInstances();
    
    console.log(`[${windowId}] Created operator: ${instance.name}`);
    addMessageToUI('system', `Created operator: ${instance.name}`);
    
    return instance;
  }

  updateInstance(instanceId, updates) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    // Update properties
    Object.assign(instance, updates);
    instance.updatedAt = new Date().toISOString();
    
    this.saveInstances();
    return instance;
  }

  deleteInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    this.instances.delete(instanceId);
    this.saveInstances();
    
    console.log(`[${windowId}] Deleted operator: ${instance.name}`);
    addMessageToUI('system', `Deleted operator: ${instance.name}`);
  }

  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  getInstanceByName(name) {
    for (const instance of this.instances.values()) {
      if (instance.name === name) {
        return instance;
      }
    }
    return null;
  }

  getAllInstances() {
    return Array.from(this.instances.values());
  }

  getInstancesForDocument(documentId) {
    return this.getAllInstances().filter(instance => instance.documentId === documentId);
  }

  async executeInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    console.log(`[${windowId}] Executing operator: ${instance.name}`);
    
    try {
      // Update status
      instance.status = 'running';
      instance.error = null;
      this.saveInstances();
      this.notifyInstanceUpdate(instance);

      // Get the tool
      const tool = this.getTool(instance.toolId);
      if (!tool) {
        throw new Error(`Tool not found: ${instance.toolId}`);
      }

      // Get input datasets
      const datasets = await this.getInputDatasets(instance.inputDatasets);

      // Execute the tool with datasets and parameters
      const result = await this.executeToolWithData(tool, datasets, instance.parameters);

      // Update instance with results
      instance.output = result;
      instance.status = 'completed';
      instance.lastExecuted = new Date().toISOString();
      instance.error = null;

      this.saveInstances();
      this.notifyInstanceUpdate(instance);

      console.log(`[${windowId}] operator executed successfully: ${instance.name}`);
      addMessageToUI('system', `✅ operator executed: ${instance.name}`);

      return result;

    } catch (error) {
      console.error(`[${windowId}] Error executing operator:`, error);
      
      instance.status = 'error';
      instance.error = error.message;
      instance.lastExecuted = new Date().toISOString();
      
      this.saveInstances();
      this.notifyInstanceUpdate(instance);

      addMessageToUI('system', `❌ Error executing ${instance.name}: ${error.message}`);
      throw error;
    }
  }

  getTool(toolId) {
    // Get tool from the existing tools system
    if (window.toolsManager) {
      return window.toolsManager.tools.find(tool => tool.id === toolId);
    }
    
    // Fallback to localStorage
    try {
      const toolsData = localStorage.getItem('tools_data');
      if (toolsData) {
        const tools = JSON.parse(toolsData);
        return tools.find(tool => tool.id === toolId);
      }
    } catch (error) {
      console.error('Error loading tools:', error);
    }
    
    return null;
  }

  async getInputDatasets(datasetReferences) {
    const datasets = [];
    
    for (const ref of datasetReferences) {
      if (typeof ref === 'string') {
        // Simple string reference to dataset name
        const dataset = window.dataLakeModule?.getDataSource(ref);
        if (dataset) {
          datasets.push({
            name: ref,
            data: dataset
          });
        }
      } else if (typeof ref === 'object' && ref.name) {
        // Object with name and optional alias
        const dataset = window.dataLakeModule?.getDataSource(ref.name);
        if (dataset) {
          datasets.push({
            name: ref.alias || ref.name,
            data: dataset
          });
        }
      }
    }
    
    return datasets;
  }

  async executeToolWithData(tool, datasets, parameters) {
    // Create a safe execution context
    const context = {
      datasets: {},
      parameters: parameters || {},
      console: {
        log: (...args) => console.log(`[Instance ${tool.name}]:`, ...args)
      },
      Math: Math,
      Date: Date,
      JSON: JSON
    };

    // Add datasets to context
    datasets.forEach(dataset => {
      context.datasets[dataset.name] = dataset.data;
      context[dataset.name] = dataset.data; // Also make available directly
    });

    try {
      // Create function from tool code
      const toolFunction = new Function(
        'context', 
        'datasets', 
        'parameters', 
        'console',
        'Math',
        'Date',
        'JSON',
        `
        with(context) {
          ${tool.code}
          
          // If there's a main function, call it
          if (typeof main === 'function') {
            return main(datasets, parameters);
          }
          
          // If there's an execute function, call it
          if (typeof execute === 'function') {
            return execute(datasets, parameters);
          }
          
          // Otherwise return the last expression or undefined
          return undefined;
        }
        `
      );

      // Execute the tool
      const result = toolFunction(
        context,
        context.datasets,
        context.parameters,
        context.console,
        context.Math,
        context.Date,
        context.JSON
      );

      // Handle async results
      if (result && typeof result.then === 'function') {
        return await result;
      }

      return result;

    } catch (error) {
      console.error('Tool execution error:', error);
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  notifyInstanceUpdate(instance) {
    // Trigger UI updates
    const event = new CustomEvent('operatorUpdated', {
      detail: { instance: instance }
    });
    document.dispatchEvent(event);
  }

  saveInstances() {
    try {
      const instancesData = {};
      for (const [id, instance] of this.instances) {
        instancesData[id] = instance.toJSON();
      }
      localStorage.setItem(`code_instances_${windowId}`, JSON.stringify(instancesData));
    } catch (error) {
      console.error('Error saving operators:', error);
    }
  }

  loadInstances() {
    try {
      const saved = localStorage.getItem(`code_instances_${windowId}`);
      if (saved) {
        const instancesData = JSON.parse(saved);
        for (const [id, data] of Object.entries(instancesData)) {
          const instance = Operator.fromJSON(data);
          this.instances.set(id, instance);
        }
        console.log(`[${windowId}] Loaded ${this.instances.size} operators`);
      }
    } catch (error) {
      console.error('Error loading operators:', error);
    }
  }
}

// Global instance manager
let operatorManager = null;

// Initialize operators
export function initOperators() {
  console.log(`[${windowId}] Initializing operators`);
  
  if (!operatorManager) {
    operatorManager = new OperatorManager();
  }
  
  setupOperatorEventListeners();
  
  // Set up auto-styling for template editors
  setupAutoStyling();
  
  console.log(`[${windowId}] operators initialized`);
}

// Setup automatic styling for instance references
function setupAutoStyling() {
  // Style references when template content changes
  document.addEventListener('input', (event) => {
    if (event.target.classList.contains('template-editor')) {
      // Debounce styling updates
      clearTimeout(window.instanceStylingTimeout);
      window.instanceStylingTimeout = setTimeout(() => {
        styleInstanceReferences(event.target);
      }, 500);
    }
  });
  
  // Style references when switching to template mode
  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('template-mode-btn')) {
      setTimeout(() => {
        const activeEditor = document.querySelector('.template-panel.active .template-editor');
        if (activeEditor) {
          styleInstanceReferences(activeEditor);
        }
      }, 100);
    }
  });
}

// Setup event listeners
function setupOperatorEventListeners() {
  // Listen for operator buttons
  document.addEventListener('click', (event) => {
    if (event.target.matches('.code-instances-btn') || event.target.closest('.code-instances-btn')) {
      console.log(`[${windowId}] operators button clicked`);
      showOperatorsDialog();
    }
    
    // Listen for clicks on instance references
    if (event.target.matches('.instance-reference')) {
      const instanceName = event.target.textContent.replace('$$', '').replace(/_/g, ' ');
      openInstanceFromReference(instanceName);
    }
    
    if (event.target.matches('.add-instance-btn') || event.target.closest('.add-instance-btn')) {
      showAddInstanceDialog();
    }
    
    if (event.target.id === 'close-instances-btn' || event.target.id === 'close-instances-bottom-btn') {
      hideOperatorsDialog();
    }
    
    if (event.target.id === 'close-add-instance-btn' || event.target.id === 'cancel-add-instance-btn') {
      hideAddInstanceDialog();
    }
    
    if (event.target.id === 'save-instance-btn') {
      saveInstance();
    }
    
    if (event.target.matches('.instance-execute-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      executeInstanceById(instanceId);
    }
    
    if (event.target.matches('.instance-edit-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      editInstance(instanceId);
    }
    
    if (event.target.matches('.instance-delete-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      deleteInstance(instanceId);
    }

    if (event.target.matches('.add-parameter-btn')) {
      addParameterField();
    }
    
    if (event.target.matches('.instance-insert-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      insertInstanceReference(instanceId);
    }
  });
}

// UI Functions
function showOperatorsDialog() {
  const dialog = document.getElementById('code-instances-dialog');
  if (dialog) {
    dialog.style.display = 'block';
    refreshInstancesList();
  }
}

function hideOperatorsDialog() {
  const dialog = document.getElementById('code-instances-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

function showAddInstanceDialog(instanceId = null) {
  const dialog = document.getElementById('add-instance-dialog');
  if (!dialog) return;

  // Populate tools dropdown and datasets FIRST
  populateToolsDropdown();
  populateAvailableDatasets();

  // Reset form
  document.getElementById('instance-name').value = '';
  document.getElementById('instance-tool').value = '';
  clearDatasetSelection();
  clearParametersForm();

  if (instanceId) {
    // Edit mode
    const instance = operatorManager.getInstance(instanceId);
    if (instance) {
      console.log(`[${windowId}] Editing instance:`, instance);
      document.getElementById('instance-name').value = instance.name;
      document.getElementById('instance-tool').value = instance.toolId;
      
      // Need to wait a moment for the DOM to update with new options/checkboxes
      setTimeout(() => {
        populateDatasetSelection(instance.inputDatasets);
        populateParametersForm(instance.parameters);
      }, 10);
      
      operatorsData.currentEditingInstance = instance;
    }
  } else {
    // Create mode
    operatorsData.currentEditingInstance = null;
  }

  dialog.style.display = 'block';
}

function hideAddInstanceDialog() {
  const dialog = document.getElementById('add-instance-dialog');
  if (dialog) {
    dialog.style.display = 'none';
    operatorsData.currentEditingInstance = null;
  }
}

function populateToolsDropdown() {
  const select = document.getElementById('instance-tool');
  if (!select) return;

  // Clear existing options
  select.innerHTML = '<option value="">Select a tool...</option>';

  // Get available tools
  let tools = [];
  if (window.toolsManager) {
    tools = window.toolsManager.tools;
  } else {
    // Fallback to localStorage
    try {
      const toolsData = localStorage.getItem('tools_data');
      if (toolsData) {
        tools = JSON.parse(toolsData);
      }
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  }

  // Add tool options
  tools.forEach(tool => {
    const option = document.createElement('option');
    option.value = tool.id;
    option.textContent = tool.name;
    select.appendChild(option);
  });
}

function populateAvailableDatasets() {
  const container = document.getElementById('available-datasets');
  if (!container) return;

  container.innerHTML = '';

  // Get available datasets from data lake
  const datasets = window.dataLakeModule?.getAllDataSources() || [];

  if (datasets.length === 0) {
    container.innerHTML = '<p class="no-datasets">No datasets available. Add data to your Data Lake first.</p>';
    return;
  }

  datasets.forEach(dataset => {
    const checkbox = document.createElement('div');
    checkbox.className = 'dataset-checkbox';
    checkbox.innerHTML = `
      <label>
        <input type="checkbox" name="dataset" value="${dataset.name}" data-name="${dataset.name}">
        <span class="dataset-info">
          <span class="dataset-name">${dataset.name}</span>
          <span class="dataset-type">${dataset.type || 'unknown'}</span>
        </span>
      </label>
    `;
    container.appendChild(checkbox);
  });
}

function populateDatasetSelection(selectedDatasets) {
  const checkboxes = document.querySelectorAll('input[name="dataset"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectedDatasets.includes(checkbox.value);
  });
}

function clearDatasetSelection() {
  const checkboxes = document.querySelectorAll('input[name="dataset"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
}

function populateParametersForm(parameters) {
  const container = document.getElementById('instance-parameters');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(parameters).forEach(([key, value]) => {
    addParameterField(key, value);
  });
}

function clearParametersForm() {
  const container = document.getElementById('instance-parameters');
  if (container) {
    container.innerHTML = '';
  }
}

function addParameterField(key = '', value = '') {
  const container = document.getElementById('instance-parameters');
  if (!container) return;

  const field = document.createElement('div');
  field.className = 'parameter-field';
  field.innerHTML = `
    <input type="text" class="param-key" placeholder="Parameter name" value="${key}">
    <input type="text" class="param-value" placeholder="Parameter value" value="${value}">
    <button type="button" class="remove-param-btn">✕</button>
  `;

  // Add remove functionality
  field.querySelector('.remove-param-btn').addEventListener('click', () => {
    field.remove();
  });

  container.appendChild(field);
}

function saveInstance() {
  const nameInput = document.getElementById('instance-name');
  const toolSelect = document.getElementById('instance-tool');

  const name = nameInput.value.trim();
  const toolId = toolSelect.value;

  // Validation
  if (!name) {
    addMessageToUI('system', 'Please enter an instance name.');
    nameInput.focus();
    return;
  }

  if (!toolId) {
    addMessageToUI('system', 'Please select a tool.');
    toolSelect.focus();
    return;
  }

  // Get selected datasets
  const selectedDatasets = [];
  const checkboxes = document.querySelectorAll('input[name="dataset"]:checked');
  checkboxes.forEach(checkbox => {
    selectedDatasets.push(checkbox.value);
  });

  // Get parameters
  const parameters = {};
  const paramFields = document.querySelectorAll('.parameter-field');
  paramFields.forEach(field => {
    const key = field.querySelector('.param-key').value.trim();
    const value = field.querySelector('.param-value').value.trim();
    if (key) {
      parameters[key] = value;
    }
  });

  // Get tool name for display
  const toolOption = toolSelect.options[toolSelect.selectedIndex];
  const toolName = toolOption ? toolOption.textContent : '';

  const instanceData = {
    name: name,
    toolId: toolId,
    toolName: toolName,
    inputDatasets: selectedDatasets,
    parameters: parameters
  };

  try {
    if (operatorsData.currentEditingInstance) {
      // Update existing instance
      operatorManager.updateInstance(operatorsData.currentEditingInstance.id, instanceData);
      addMessageToUI('system', `operator "${name}" updated successfully.`);
    } else {
      // Create new instance
      operatorManager.createInstance(instanceData);
      addMessageToUI('system', `operator "${name}" created successfully.`);
    }

    hideAddInstanceDialog();
    refreshInstancesList();
  } catch (error) {
    console.error('Error saving instance:', error);
    addMessageToUI('system', `Error saving instance: ${error.message}`);
  }
}

function refreshInstancesList() {
  const container = document.getElementById('instances-items');
  if (!container) return;

  const instances = operatorManager.getAllInstances();

  if (instances.length === 0) {
    container.innerHTML = `
      <div class="no-instances-message">
        <p>No Operators yet.</p>
        <p>Click "Add Operator" to create your first operator.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = instances.map(instance => createInstanceElement(instance)).join('');
}

function createInstanceElement(instance) {
  const statusClass = `status-${instance.status}`;
  const statusText = instance.status.charAt(0).toUpperCase() + instance.status.slice(1);
  
  const lastExecuted = instance.lastExecuted 
    ? new Date(instance.lastExecuted).toLocaleString()
    : 'Never';

  const datasetsText = instance.inputDatasets.length > 0 
    ? instance.inputDatasets.join(', ')
    : 'No datasets';

  return `
    <div class="instance-item ${statusClass}" data-instance-id="${instance.id}">
      <div class="instance-item-info">
        <div class="instance-item-icon">🔧</div>
        <div class="instance-item-details">
          <div class="instance-item-name">${escapeHtml(instance.name)}</div>
          <div class="instance-item-tool">Tool: ${escapeHtml(instance.toolName || instance.toolId)}</div>
          <div class="instance-item-datasets">Datasets: ${escapeHtml(datasetsText)}</div>
          <div class="instance-item-meta">
            <span>Status: ${statusText}</span>
            <span>Last run: ${lastExecuted}</span>
          </div>
          ${instance.error ? `<div class="instance-error">Error: ${escapeHtml(instance.error)}</div>` : ''}
        </div>
      </div>
      <div class="instance-item-actions">
        <button class="instance-item-btn instance-insert-btn" data-instance-id="${instance.id}">Insert</button>
        <button class="instance-item-btn instance-execute-btn" data-instance-id="${instance.id}" ${instance.status === 'running' ? 'disabled' : ''}>
          ${instance.status === 'running' ? 'Running...' : 'Execute'}
        </button>
        <button class="instance-item-btn instance-edit-btn" data-instance-id="${instance.id}">Edit</button>
        <button class="instance-item-btn instance-delete-btn" data-instance-id="${instance.id}">Delete</button>
      </div>
    </div>
  `;
}

// Insert instance reference into template
function insertInstanceReference(instanceId) {
  const instance = operatorManager.getInstance(instanceId);
  if (!instance) {
    addMessageToUI('system', 'Instance not found');
    return;
  }

  // Find the currently active template editor
  let templateEditor = null;
  
  // Try to get the template editor from the active document
  if (window.documentManager?.activeDocumentId) {
    const container = document.getElementById(`document-${window.documentManager.activeDocumentId}`);
    templateEditor = container?.querySelector('.template-editor');
  }
  
  // Fallback to global template editor
  if (!templateEditor) {
    templateEditor = elements.templateEditor;
  }
  
  if (!templateEditor) {
    addMessageToUI('system', 'No template editor found');
    return;
  }

  // Use $$ prefix to distinguish from data sources (which use $)
  const instanceReference = `$$${instance.name.replace(/\s+/g, '_')}`;
  
  // Focus the template editor
  templateEditor.focus();
  
  // Get current cursor position or insert at end
  const selection = window.getSelection();
  let range;
  
  if (selection.rangeCount > 0 && templateEditor.contains(selection.anchorNode)) {
    // Insert at cursor position
    range = selection.getRangeAt(0);
  } else {
    // Insert at end of template
    range = document.createRange();
    range.selectNodeContents(templateEditor);
    range.collapse(false);
  }
  
  // Insert the instance reference
  const text = templateEditor.textContent;
  const needsNewline = text.length > 0 && !text.endsWith('\n') && range.startOffset === text.length;
  const textToInsert = needsNewline ? `\n${instanceReference}` : instanceReference;
  
  range.deleteContents();
  range.insertNode(document.createTextNode(textToInsert));
  
  // Move cursor after the inserted text
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  
  // Apply styling to make instance references clickable
  setTimeout(() => {
    styleInstanceReferences(templateEditor);
  }, 100);
  
  addMessageToUI('system', `Inserted instance reference: ${instanceReference}`);
  
  // Close instances dialog
  hideOperatorsDialog();
}

// Open instance details from a clicked reference
function openInstanceFromReference(instanceName) {
  console.log(`[${windowId}] Opening instance from reference: ${instanceName}`);
  
  // Find the instance by name
  const instance = operatorManager.getInstanceByName(instanceName);
  
  if (!instance) {
    addMessageToUI('system', `Instance "${instanceName}" not found. It may have been deleted.`);
    return;
  }
  
  // Open the edit dialog for this instance
  showAddInstanceDialog(instance.id);
  addMessageToUI('system', `Opened instance details for: ${instanceName}`);
}

// Style instance references in template
function styleInstanceReferences(templateEditor) {
  if (!templateEditor) return;
  
  // Store cursor position before making changes
  const selection = window.getSelection();
  let savedRange = null;
  
  if (selection.rangeCount > 0 && templateEditor.contains(selection.anchorNode)) {
    savedRange = selection.getRangeAt(0).cloneRange();
  }
  
  // Process all text nodes to find and wrap instance references
  const walker = document.createTreeWalker(
    templateEditor,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  let node;
  
  // Collect all text nodes first to avoid modifying while iterating
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  
  // Process each text node
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    
    // Skip if this text node is already inside an instance-reference span
    if (textNode.parentNode && textNode.parentNode.classList && textNode.parentNode.classList.contains('instance-reference')) {
      return;
    }
    
    // Check if this text node contains instance references
    if (/\$\$([a-zA-Z0-9_]+)/.test(text)) {
      // Create a temporary container to parse the styled HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text.replace(/\$\$([a-zA-Z0-9_]+)/g, (match, instanceName) => {
        return `<span class="instance-reference" data-instance-name="${instanceName}">${match}</span>`;
      });
      
      // Replace the text node with the styled content
      const parent = textNode.parentNode;
      const fragment = document.createDocumentFragment();
      
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      
      parent.replaceChild(fragment, textNode);
    }
  });
  
  // Restore cursor position
  if (savedRange) {
    try {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    } catch (e) {
      // If exact restoration fails, try to place cursor at the end
      try {
        const range = document.createRange();
        range.selectNodeContents(templateEditor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (e2) {
        console.debug('Could not restore cursor position');
      }
    }
  }
}

// Action Functions
async function executeInstanceById(instanceId) {
  try {
    await operatorManager.executeInstance(instanceId);
    refreshInstancesList();
  } catch (error) {
    console.error('Error executing instance:', error);
  }
}

function editInstance(instanceId) {
  showAddInstanceDialog(instanceId);
}

function deleteInstance(instanceId) {
  const instance = operatorManager.getInstance(instanceId);
  if (!instance) return;

  if (confirm(`Are you sure you want to delete the operator "${instance.name}"? This action cannot be undone.`)) {
    try {
      operatorManager.deleteInstance(instanceId);
      refreshInstancesList();
    } catch (error) {
      console.error('Error deleting instance:', error);
      addMessageToUI('system', `Error deleting instance: ${error.message}`);
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export functions
export { 
  Operator, 
  OperatorManager, 
  showOperatorsDialog,
  showAddInstanceDialog,
  addParameterField
};

// Make functions globally available
window.operatorsModule = {
  showOperatorsDialog,
  showAddInstanceDialog,
  executeInstanceById,
  editInstance,
  deleteInstance,
  addParameterField,
  insertInstanceReference,
  openInstanceFromReference,
  styleInstanceReferences
}; 