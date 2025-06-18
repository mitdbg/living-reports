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
    executionQueue: [],
    isExecutingForTemplate: false // Flag to prevent auto-refresh loops
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
    this.outputConfig = options.outputConfig || ''; // Output configuration (e.g., output.name)
    this.outputVariable = options.outputVariable || ''; // Variable name to store output
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
      outputs: this.outputs || [],
      outputConfig: this.outputConfig,
      outputVariable: this.outputVariable,
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

      console.log(`[${windowId}] Result:`, result);
      
      // Update instance with results
      instance.output = result;
      instance.status = 'completed';
      instance.lastExecuted = new Date().toISOString();
      instance.error = null;

      // Store outputs in variables if specified
      const outputsToProcess = instance.outputs && instance.outputs.length > 0 
        ? instance.outputs 
        : (instance.outputVariable ? [{ config: instance.outputConfig || '', variable: instance.outputVariable }] : []);
      
      // Only process outputs if execution was successful (result has data, not error)
      if (result && typeof result === 'object' && !result.error && result.status !== 'error') {
        for (const output of outputsToProcess) {
          if (output.variable && output.variable.trim()) {
            try {
              // Extract the value using the output configuration
              let valueToStore = result;
              
              if (output.config && output.config.trim()) {
                valueToStore = this.extractValueFromOutput(result, output.config);
                console.log(`[${windowId}] Extracted value using config "${output.config}":`, valueToStore);
              }
              
              // Import variables manager and store the result
              const { variablesManager } = await import('./variables.js');
              if (variablesManager) {
                await variablesManager.setVariableValue(output.variable, valueToStore);
                console.log(`[${windowId}] Stored output in variable: ${output.variable}`);
                addMessageToUI('system', `📊 Output stored in variable: \${${output.variable}} = ${JSON.stringify(valueToStore)}`);
              }
            } catch (error) {
              console.warn(`[${windowId}] Failed to store output in variable ${output.variable}:`, error);
              addMessageToUI('system', `⚠️ Warning: Could not store output in variable ${output.variable}: ${error.message}`);
            }
          }
        }

        this.saveInstances();
        this.notifyInstanceUpdate(instance);
  
        console.log(`[${windowId}] operator executed successfully: ${instance.name}`);
        addMessageToUI('system', `✅ operator executed: ${instance.name}`);
  
        return result;


      } 

      if (result.status === 'error') {
        instance.status = 'error';
        instance.error = result.error.substring(0, 200);
        instance.lastExecuted = new Date().toISOString();
        this.saveInstances();
        this.notifyInstanceUpdate(instance);
        addMessageToUI('system', `❌ Error executing ${instance.name}: ${result.error}`);
        return result;
      }

    } catch (error) {
      console.error(`[${windowId}] Error executing operator:`, error);
      
      // Simplify error message for display (max 200 chars)
      let errorMessage = error.message || 'Unknown error occurred';
      if (errorMessage.length > 200) {
        // Try to extract meaningful error info
        if (errorMessage.includes('External execution failed')) {
          const statusMatch = errorMessage.match(/failed \((\d+)\)/);
          const status = statusMatch ? statusMatch[1] : 'unknown';
          errorMessage = `External execution failed (${status}). Check endpoint connectivity.`;
        } else if (errorMessage.includes('<!DOCTYPE html>')) {
          errorMessage = 'External endpoint returned HTML error page. Check endpoint URL and status.';
        } else {
          errorMessage = errorMessage.substring(0, 200) + '...';
        }
      }
      
      instance.status = 'error';
      instance.error = errorMessage;
      instance.lastExecuted = new Date().toISOString();
      
      this.saveInstances();
      this.notifyInstanceUpdate(instance);

      addMessageToUI('system', `❌ Error executing ${instance.name}: ${errorMessage}`);
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
    try {
      // Process parameters to separate datasets from literal values
      const processedParameters = {};
      const datasetsFromParams = {};

      for (const [key, paramData] of Object.entries(parameters || {})) {
        if (typeof paramData === 'object' && paramData.type && paramData.value !== undefined) {
          // New format: { type: 'dataset|literal', value: '...' }
          if (paramData.type === 'dataset') {
            // Load dataset from data lake
            const dataset = window.dataLakeModule?.getDataSource(paramData.value);
            if (dataset) {
              datasetsFromParams[key] = dataset;
            } else {
              console.warn(`Dataset not found: ${paramData.value}`);
              processedParameters[key] = null; // Dataset not found
            }
          } else {
            // Literal value - try to parse JSON, numbers, booleans
            processedParameters[key] = this.parseParameterValue(paramData.value);
          }
        } else {
          // Legacy format: assume literal value
          processedParameters[key] = this.parseParameterValue(paramData);
        }
      }

      // Prepare the execution payload
      const executionPayload = {
        code: tool.code,
        datasets: datasetsFromParams, // Datasets from parameters
        parameters: processedParameters // Literal values
      };

      // Add legacy datasets to payload (for backward compatibility)
      datasets.forEach(dataset => {
        executionPayload.datasets[dataset.name] = dataset.data;
      });

      console.log(`[${windowId}] Executing operator "${tool.name}" via external endpoint...`);
      console.log(`[${windowId}] Datasets:`, Object.keys(executionPayload.datasets));
      console.log(`[${windowId}] Parameters:`, processedParameters);
      
      // Use external API endpoint for execution
      const BASE_URL = 'https://6bd2-89-213-179-161.ngrok-free.app';
      
      const response = await fetch(`${BASE_URL}/execute_code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
        },
        body: JSON.stringify({
          code: tool.code,
          parameters: executionPayload.parameters
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`External execution failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      // Handle error responses from server
      if (result.status === 'error' || result.error) {
        const errorMsg = result.error || result.message || 'External execution failed';
        throw new Error(`Server execution error: ${errorMsg}`);
      }
      
      // Handle different response formats
      if (result.success === false) {
        throw new Error(result.error || 'External execution failed');
      }
      
      // Parse the nested response structure from your server
      // Success: {'result': {'parameters': {...}, 'output': {...}, ...}, 'status': 'success'}
      // Error: {'error': 'invalid syntax...', 'type': 'SyntaxError', 'status': 'error'}
      let executionResult;
      
      if (result.result && result.result.output) {
        // Use the 'output' field from the nested result as the main result
        executionResult = result.result.output;
        console.log(`[${windowId}] Using result.result.output as execution result:`, executionResult);
      } else if (result.result) {
        // Fallback to the entire result.result object
        executionResult = result.result;
        console.log(`[${windowId}] Using result.result as execution result:`, executionResult);
      } else {
        // Fallback to the entire result
        executionResult = result;
        console.log(`[${windowId}] Using entire result as execution result:`, executionResult);
      }
      
      console.log(`[${windowId}] External execution completed for "${tool.name}":`, executionResult);
      
      return executionResult;

    } catch (error) {
      console.error(`[${windowId}] External execution error:`, error);
      
      // If external execution fails, provide helpful error message
      if (error.message.includes('fetch')) {
        throw new Error(`Cannot connect to external execution service: ${error.message}`);
      } else {
        throw new Error(`External execution failed: ${error.message}`);
      }
    }
  }

  parseParameterValue(value) {
    // Try to parse the parameter value as appropriate type
    if (typeof value !== 'string') {
      return value; // Already parsed
    }

    const trimmed = value.trim();
    
    // Boolean values
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Null/undefined
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;
    
    // Numbers
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    if (/^-?\d*\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    
    // JSON objects/arrays
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        // If JSON parsing fails, treat as string
      }
    }
    
    // Remove quotes if the value is quoted
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    
    // Return as string
    return trimmed;
  }

  extractValueFromOutput(result, outputConfig) {
    if (!outputConfig || !outputConfig.trim()) {
      return result;
    }

    try {
      const config = outputConfig.trim();
      
      // Handle special case: "output" refers to the main result
      if (config === 'output') {
        return result;
      }
      
      // Handle "output.field" pattern
      if (config.startsWith('output.')) {
        const fieldPath = config.substring(7); // Remove "output." prefix
        const path = fieldPath.split('.');
        let value = result;

        // Navigate through the object path starting from the main result
        for (const key of path) {
          if (value && typeof value === 'object' && key in value) {
            value = value[key];
          } else {
            throw new Error(`Property "${key}" not found in output`);
          }
        }

        return value;
      }
      
      // Handle direct field access (legacy support)
      const path = config.split('.');
      let value = result;

      // Navigate through the object path
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          throw new Error(`Property "${key}" not found in output`);
        }
      }

      return value;
    } catch (error) {
      console.error(`Error extracting value with config "${outputConfig}":`, error);
      throw new Error(`Failed to extract value using "${outputConfig}": ${error.message}`);
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
    if (event.target.matches('.operators-btn') || event.target.closest('.operators-btn')) {
      console.log(`[${windowId}] operators button clicked`);
      showOperatorsDialog();
    }
    
    // Listen for clicks on instance references
    if (event.target.matches('.instance-reference')) {
      const instanceName = event.target.textContent.replace('$$', '').replace(/_/g, ' ');
      openInstanceFromReference(instanceName).catch(error => {
        console.error('Error opening instance from reference:', error);
      });
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
      editInstance(instanceId).catch(error => {
        console.error('Error editing instance:', error);
      });
    }
    
    if (event.target.matches('.instance-delete-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      deleteInstance(instanceId);
    }

    if (event.target.matches('.add-parameter-btn')) {
      addParameterField();
    }
    
    if (event.target.matches('.add-output-btn')) {
      addOutputField();
    }
    
    if (event.target.matches('.instance-insert-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      insertInstanceReference(instanceId);
    }
  });
  
  // Setup tools sidebar event listeners
  setupToolsSidebarEventListeners();
}

// UI Functions
function showOperatorsDialog() {
  const dialog = document.getElementById('operators-dialog');
  if (dialog) {
    dialog.style.display = 'block';
    refreshInstancesList();
    refreshOperatorsToolsList(); // Populate the tools sidebar
  }
}

function hideOperatorsDialog() {
  const dialog = document.getElementById('operators-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

async function showAddInstanceDialog(instanceId = null) {
  const dialog = document.getElementById('add-instance-dialog');
  if (!dialog) return;

  // Populate tools dropdown
  populateToolsDropdown();

      // Reset form
    document.getElementById('instance-name').value = '';
    document.getElementById('instance-tool').value = '';
    clearParametersForm();
    clearOutputsForm();

  // Populate variables list (async) and wait for completion
  await populateVariablesList();

  if (instanceId) {
    // Edit mode
    const instance = operatorManager.getInstance(instanceId);
    if (instance) {
      console.log(`[${windowId}] Editing instance:`, instance);
      document.getElementById('instance-name').value = instance.name;
      document.getElementById('instance-tool').value = instance.toolId;
      
      // Populate form fields
      populateParametersForm(instance.parameters);
      await populateOutputsForm(instance);
      
      operatorsData.currentEditingInstance = instance;
    }
  } else {
    // Create mode - add one empty output field
    await addOutputField();
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



function populateParametersForm(parameters) {
  const container = document.getElementById('instance-parameters');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(parameters).forEach(([key, paramData]) => {
    // Check if this is a new format parameter or legacy format
    if (typeof paramData === 'object' && paramData.type && paramData.value !== undefined) {
      // New format: { type: 'dataset|literal', value: '...' }
      addParameterField(key, paramData.value, paramData.type);
    } else {
      // Legacy format: just a string value (assume literal)
      addParameterField(key, paramData, 'literal');
    }
  });
}

function clearParametersForm() {
  const container = document.getElementById('instance-parameters');
  if (container) {
    container.innerHTML = '';
  }
}

function clearOutputsForm() {
  const container = document.getElementById('instance-outputs');
  if (container) {
    container.innerHTML = '';
  }
}

async function populateOutputsForm(instance) {
  // Handle backward compatibility - convert single output to array format
  let outputs = [];
  
  if (instance.outputs && Array.isArray(instance.outputs)) {
    // New format: array of output assignments
    outputs = instance.outputs;
  } else if (instance.outputConfig || instance.outputVariable) {
    // Old format: single output assignment
    outputs = [{
      config: instance.outputConfig || '',
      variable: instance.outputVariable || ''
    }];
  }
  
  // Add output fields for each assignment
  for (const output of outputs) {
    await addOutputField(output.config, output.variable);
  }
  
  // If no outputs exist, add one empty field
  if (outputs.length === 0) {
    await addOutputField();
  }
}

async function populateVariablesDropdown(select) {
  if (!select) {
    console.error('Variable select element not provided');
    return;
  }

  console.log('🔄 Populating variables dropdown...');

  // Clear existing options except the first one
  select.innerHTML = '<option value="">Select a variable...</option>';

  try {
    // Try to get variables from the variables manager
    if (window.variablesManager && window.variablesManager.variables) {
      const variables = window.variablesManager.variables;
      console.log(`📊 Found ${variables.size} variables in variables manager`);
      
      variables.forEach((variable, name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${variable.type || 'text'})`;
        select.appendChild(option);
        console.log(`  ✓ Added variable: ${name}`);
      });
      
      if (variables.size > 0) {
        console.log(`✅ Populated ${variables.size} variables from variables manager`);
      }
    } else {
      console.log('⚠️ Variables manager not available or no variables');
    }

    // Also try to load from backend vars.json if available
    try {
      const varsFromBackend = await loadVariablesFromBackend();
      console.log('📡 Backend variables response:', varsFromBackend);
      
      if (varsFromBackend && Object.keys(varsFromBackend).length > 0) {
        let addedCount = 0;
        Object.entries(varsFromBackend).forEach(([name, variable]) => {
          // Check if this variable is already in the list
          const existingOption = select.querySelector(`option[value="${name}"]`);
          if (!existingOption) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (${variable.type || 'text'})`;
            select.appendChild(option);
            addedCount++;
            console.log(`  ✓ Added backend variable: ${name}`);
          }
        });
        console.log(`✅ Added ${addedCount} variables from backend`);
      } else {
        console.log('⚠️ No backend variables found');
      }
    } catch (error) {
      console.error('❌ Error loading backend variables:', error);
    }

  } catch (error) {
    console.error('Error populating variables dropdown:', error);
  }
}

async function populateVariablesList() {
  // This function is kept for backward compatibility
  // It now populates all existing dropdowns
  const allSelects = document.querySelectorAll('.output-variable-select');
  for (const select of allSelects) {
    await populateVariablesDropdown(select);
  }
}

async function loadVariablesFromBackend() {
  try {
    // Get the current document ID to load document-specific variables
    const documentId = window.documentManager?.activeDocumentId;
    if (!documentId) {
      console.log('⚠️ No active document ID for loading variables');
      return {};
    }

    console.log(`📡 Loading variables for document: ${documentId}`);

    const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`📡 Backend response status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('📡 Backend response data:', result);
    
    if (result.success && result.variables) {
      // The backend returns variables directly for the document
      const documentVariables = result.variables || {};
      console.log(`✅ Loaded ${Object.keys(documentVariables).length} variables for document ${documentId}:`, documentVariables);
      return documentVariables;
    } else {
      console.log('⚠️ Backend response indicates no variables or failure:', result);
    }
    
    return {};
  } catch (error) {
    console.error('❌ Could not load variables from backend:', error);
    return {};
  }
}

function addParameterField(key = '', value = '', valueType = 'literal') {
  const container = document.getElementById('instance-parameters');
  if (!container) return;

  // Get available datasets for the dropdown
  const datasets = window.dataLakeModule?.getAllDataSources() || [];
  const datasetOptions = datasets.map(dataset => 
    `<option value="${dataset.name}" ${valueType === 'dataset' && value === dataset.name ? 'selected' : ''}>${dataset.name} (${dataset.type || 'dataset'})</option>`
  ).join('');

  const field = document.createElement('div');
  field.className = 'parameter-field';
  field.innerHTML = `
    <input type="text" class="param-key" placeholder="Parameter name" value="${key}">
    <div class="param-value-container">
      <select class="param-type-select">
        <option value="literal" ${valueType === 'literal' ? 'selected' : ''}>Literal Value</option>
        <option value="dataset" ${valueType === 'dataset' ? 'selected' : ''}>Dataset</option>
      </select>
      <input type="text" class="param-value param-literal" placeholder="e.g., false, 123, 'text'" value="${valueType === 'literal' ? value : ''}" ${valueType === 'dataset' ? 'style="display: none;"' : ''}>
      <select class="param-value param-dataset" ${valueType === 'literal' ? 'style="display: none;"' : ''}>
        <option value="">Select dataset...</option>
        ${datasetOptions}
      </select>
    </div>
    <button type="button" class="remove-param-btn">✕</button>
  `;
  
  // Add event listener to toggle between literal and dataset
  const typeSelect = field.querySelector('.param-type-select');
  const literalInput = field.querySelector('.param-literal');
  const datasetSelect = field.querySelector('.param-dataset');
  
  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'literal') {
      literalInput.style.display = '';
      datasetSelect.style.display = 'none';
    } else {
      literalInput.style.display = 'none';
      datasetSelect.style.display = '';
    }
  });

  // Add remove functionality
  field.querySelector('.remove-param-btn').addEventListener('click', () => {
    field.remove();
  });

  container.appendChild(field);
}

async function addOutputField(outputConfig = '', outputVariable = '') {
  const container = document.getElementById('instance-outputs');
  if (!container) return;

  const field = document.createElement('div');
  field.className = 'output-config-field';
  field.innerHTML = `
    <input type="text" class="output-config-input" placeholder="e.g., output, output.name, output.data.value" value="${outputConfig}">
    <select class="output-variable-select">
      <option value="">Select a variable...</option>
    </select>
    <button type="button" class="remove-output-btn">✕</button>
  `;

  // Add remove functionality
  field.querySelector('.remove-output-btn').addEventListener('click', () => {
    field.remove();
  });

  container.appendChild(field);

  // Populate the variables dropdown for this field
  const select = field.querySelector('.output-variable-select');
  await populateVariablesDropdown(select);
  
  // Set the selected value if provided
  if (outputVariable) {
    select.value = outputVariable;
  }
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

  // Get output assignments
  const outputs = [];
  const outputFields = document.querySelectorAll('.output-config-field');
  
  // Validate output fields
  for (const field of outputFields) {
    const configInput = field.querySelector('.output-config-input');
    const variableSelect = field.querySelector('.output-variable-select');
    
    const config = configInput.value.trim();
    const variable = variableSelect.value;
    
    // Only add if both config and variable are provided
    if (config && variable) {
      outputs.push({
        config: config,
        variable: variable
      });
    } else if (config && !variable) {
      addMessageToUI('system', 'Please select a variable for output configuration: ' + config);
      variableSelect.focus();
      return;
    } else if (!config && variable) {
      addMessageToUI('system', 'Please specify output configuration for variable: ' + variable);
      configInput.focus();
      return;
    }
    // If both are empty, that's fine - just skip this field
  }

  // Get parameters (including datasets as parameters)
  const parameters = {};
  const paramFields = document.querySelectorAll('.parameter-field');
  paramFields.forEach(field => {
    const key = field.querySelector('.param-key').value.trim();
    const typeSelect = field.querySelector('.param-type-select');
    const paramType = typeSelect.value;
    
    let value = '';
    if (paramType === 'literal') {
      value = field.querySelector('.param-literal').value.trim();
    } else if (paramType === 'dataset') {
      value = field.querySelector('.param-dataset').value;
    }
    
    if (key && value) {
      parameters[key] = {
        type: paramType,
        value: value
      };
    }
  });

  // Get tool name for display
  const toolOption = toolSelect.options[toolSelect.selectedIndex];
  const toolName = toolOption ? toolOption.textContent : '';

  const instanceData = {
    name: name,
    toolId: toolId,
    toolName: toolName,
    inputDatasets: [], // Legacy field - now all datasets go through parameters
    parameters: parameters,
    outputs: outputs,
    // Keep backward compatibility fields for existing instances
    outputConfig: outputs.length > 0 ? outputs[0].config : '',
    outputVariable: outputs.length > 0 ? outputs[0].variable : ''
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

  // Handle multiple outputs display
  let outputText = 'No output assignment';
  
  if (instance.outputs && instance.outputs.length > 0) {
    const outputDescriptions = instance.outputs.map(output => 
      `${output.config || 'result'} → \${${output.variable}}`
    );
    outputText = `Output: ${outputDescriptions.join(', ')}`;
  } else if (instance.outputVariable) {
    // Backward compatibility
    outputText = `Output: ${instance.outputConfig || 'result'} → \${${instance.outputVariable}}`;
  }

  return `
    <div class="instance-item ${statusClass}" data-instance-id="${instance.id}">
      <div class="instance-item-info">
        <div class="instance-item-icon">🔧</div>
        <div class="instance-item-details">
          <div class="instance-item-name">${escapeHtml(instance.name)}</div>
          <div class="instance-item-tool">Tool: ${escapeHtml(instance.toolName || instance.toolId)}</div>
          <div class="instance-item-datasets">Datasets: ${escapeHtml(datasetsText)}</div>
          <div class="instance-item-output">${escapeHtml(outputText)}</div>
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
async function openInstanceFromReference(instanceName) {
  console.log(`[${windowId}] Opening instance from reference: ${instanceName}`);
  
  // Find the instance by name
  const instance = operatorManager.getInstanceByName(instanceName);
  
  if (!instance) {
    addMessageToUI('system', `Instance "${instanceName}" not found. It may have been deleted.`);
    return;
  }
  
  // Open the edit dialog for this instance
  await showAddInstanceDialog(instance.id);
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

async function editInstance(instanceId) {
  await showAddInstanceDialog(instanceId);
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
  addParameterField,
  addOutputField,
  executeRequiredOperatorsForTemplate
};

// Template-Operator Integration Functions
async function executeRequiredOperatorsForTemplate(templateContent) {
  console.log(`[${windowId}] Analyzing template for required operators...`);
  
  try {
    // 1. Extract variables from template content
    const requiredVariables = extractVariablesFromTemplate(templateContent);
    console.log(`[${windowId}] Template requires variables:`, requiredVariables);
    
    if (requiredVariables.length === 0) {
      console.log(`[${windowId}] No variables found in template, skipping operator execution`);
      return { success: true, executedOperators: [] };
    }
    
    // 2. Identify operators that output these variables
    const requiredOperators = identifyRequiredOperators(requiredVariables);
    console.log(`[${windowId}] Required operators:`, requiredOperators.map(op => op.name));
    
    if (requiredOperators.length === 0) {
      console.log(`[${windowId}] No operators needed for template variables`);
      return { success: true, executedOperators: [] };
    }
    
    // 3. Execute operators in sequence
    const executionResults = await executeOperatorsSequence(requiredOperators);
    
    return {
      success: true,
      executedOperators: requiredOperators.map(op => op.name),
      results: executionResults
    };
    
  } catch (error) {
    console.error(`[${windowId}] Error executing required operators:`, error);
    return {
      success: false,
      error: error.message,
      executedOperators: []
    };
  }
}

function extractVariablesFromTemplate(templateContent) {
  if (!templateContent || typeof templateContent !== 'string') {
    return [];
  }
  
  // Extract variables using {{variable_name}} pattern
  const variableMatches = templateContent.match(/\{\{([^}]+)\}\}/g) || [];
  const variables = variableMatches.map(match => 
    match.replace(/\{\{|\}\}/g, '').trim()
  );
  
  // Remove duplicates and filter out assignment patterns (variables that contain :=)
  const filteredVariables = variables.filter(varName => !varName.includes(':='));
  const uniqueVariables = [...new Set(filteredVariables)];
  
  console.log(`[${windowId}] Extracted variables from template:`, uniqueVariables);
  
  return uniqueVariables;
}

function identifyRequiredOperators(requiredVariables) {
  const allOperators = operatorManager.getAllInstances();
  const requiredOperators = [];
  
  for (const operator of allOperators) {
    const outputVariables = getOperatorOutputVariables(operator);
    
    // Check if any of this operator's outputs are needed by the template
    const hasRequiredOutput = outputVariables.some(varName => 
      requiredVariables.includes(varName)
    );
    
    if (hasRequiredOutput) {
      requiredOperators.push(operator);
      console.log(`[${windowId}] Operator "${operator.name}" outputs variables:`, outputVariables);
    }
  }
  
  return requiredOperators;
}

function getOperatorOutputVariables(operator) {
  const outputVars = [];
  
  // Handle new format: array of outputs
  if (operator.outputs && Array.isArray(operator.outputs)) {
    operator.outputs.forEach(output => {
      if (output.variable && output.variable.trim()) {
        outputVars.push(output.variable.trim());
      }
    });
  }
  
  // Handle legacy format: single output
  if (operator.outputVariable && operator.outputVariable.trim()) {
    const legacyVar = operator.outputVariable.trim();
    if (!outputVars.includes(legacyVar)) {
      outputVars.push(legacyVar);
    }
  }
  
  return outputVars;
}

async function executeOperatorsSequence(operators) {
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  console.log(`[${windowId}] Executing ${operators.length} required operators...`);
  
  // Set flag to prevent template auto-refresh loop
  operatorsData.isExecutingForTemplate = true;
  
  try {
    // Show progress message
    addMessageToUI('system', `🔄 Executing ${operators.length} required operators for template...`);
    
    for (const operator of operators) {
      try {
        console.log(`[${windowId}] Executing operator: ${operator.name}`);
        addMessageToUI('system', `⚙️ Executing operator: ${operator.name}...`);
        
        const result = await operatorManager.executeInstance(operator.id);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: true,
          result: result
        });
        
        successCount++;
        console.log(`[${windowId}] ✅ Operator "${operator.name}" executed successfully`);
        
      } catch (error) {
        console.error(`[${windowId}] ❌ Error executing operator "${operator.name}":`, error);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: false,
          error: error.message
        });
        
        errorCount++;
        addMessageToUI('system', `❌ Error executing operator "${operator.name}": ${error.message}`);
      }
    }
    
    // Summary message
    if (errorCount === 0) {
      addMessageToUI('system', `✅ All ${successCount} operators executed successfully`);
    } else {
      addMessageToUI('system', `⚠️ Operators execution completed: ${successCount} successful, ${errorCount} failed`);
    }
    
    console.log(`[${windowId}] Operators execution summary: ${successCount} successful, ${errorCount} failed`);
    
  } finally {
    // Always clear flag after execution is complete, even if there were errors
    operatorsData.isExecutingForTemplate = false;
  }
  
  return results;
}

// Tools Sidebar Integration Functions for Operators Dialog
function refreshOperatorsToolsList() {
  const toolsContainer = document.getElementById('operators-tools-items');
  if (!toolsContainer) return;
  
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
  
  // Clear existing items
  toolsContainer.innerHTML = '';
  
  if (tools.length === 0) {
    const noToolsDiv = document.getElementById('operators-no-tools-message');
    if (noToolsDiv) {
      noToolsDiv.style.display = 'block';
    }
    return;
  }
  
  // Hide no tools message
  const noToolsDiv = document.getElementById('operators-no-tools-message');
  if (noToolsDiv) {
    noToolsDiv.style.display = 'none';
  }
  
  // Create tool items
  tools.forEach(tool => {
    const toolElement = createOperatorsSidebarToolElement(tool);
    toolsContainer.appendChild(toolElement);
  });
}

function createOperatorsSidebarToolElement(tool) {
  const toolDiv = document.createElement('div');
  toolDiv.className = 'operators-sidebar-tool-item';
  toolDiv.dataset.toolId = tool.id;
  
  toolDiv.innerHTML = `
    <div class="sidebar-tool-name">${escapeHtml(tool.name)}</div>
    <div class="sidebar-tool-description">${escapeHtml(tool.description || 'No description')}</div>
  `;
  
  return toolDiv;
}

function setupToolsSidebarEventListeners() {
  // Tools sidebar search
  document.addEventListener('input', (e) => {
    if (e.target.id === 'operators-tools-search') {
      filterOperatorsTools(e.target.value);
    }
  });
  
  // Add tool button in sidebar
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('add-tool-btn-sidebar')) {
      // Import and use tools manager
      if (window.toolsManager && window.toolsManager.showAddToolDialog) {
        window.toolsManager.showAddToolDialog();
      } else {
        // Fallback: try to find tools module functions
        const addToolBtn = document.querySelector('.add-tool-btn');
        if (addToolBtn) {
          addToolBtn.click();
        }
      }
    }
  });
  
  // Tool selection in sidebar - show tool details dialog
  document.addEventListener('click', (e) => {
    const toolItem = e.target.closest('.operators-sidebar-tool-item');
    if (toolItem) {
      const toolId = toolItem.dataset.toolId;
      
      // Get the tool and show edit dialog
      if (window.toolsManager) {
        window.toolsManager.editTool(toolId);
      } else {
        // Fallback: try to get tool data and show edit dialog
        let tools = [];
        try {
          const toolsData = localStorage.getItem('tools_data');
          if (toolsData) {
            tools = JSON.parse(toolsData);
          }
        } catch (error) {
          console.error('Error loading tools:', error);
        }
        
        const tool = tools.find(t => t.id === toolId);
        if (tool) {
          // Show the add tool dialog with this tool's data for editing
          const addToolDialog = document.getElementById('add-tool-dialog');
          if (addToolDialog) {
            // Populate the form with tool data
            const nameInput = document.getElementById('tool-name');
            const descriptionInput = document.getElementById('tool-description');
            const codeInput = document.getElementById('tool-code');
            
            if (nameInput) nameInput.value = tool.name;
            if (descriptionInput) descriptionInput.value = tool.description || '';
            if (codeInput) {
              // Set code content with proper line break handling
              if (window.toolsManager) {
                window.toolsManager.setCodeEditorContent(codeInput, tool.code);
                window.toolsManager.currentEditingTool = tool;
              } else {
                // Fallback: manually set the content
                const htmlContent = tool.code ? tool.code.replace(/\n/g, '<br>') : '';
                codeInput.innerHTML = htmlContent;
                
                // Store the tool data for manual saving later
                codeInput.dataset.editingToolId = tool.id;
              }
            }
            
            // Update dialog title
            const title = addToolDialog.querySelector('.dialog-header h3');
            if (title) title.textContent = '✏️ Edit Tool';
            
            addToolDialog.style.display = 'flex';
          }
        }
      }
    }
  });
}

function filterOperatorsTools(searchTerm) {
  const toolItems = document.querySelectorAll('.operators-sidebar-tool-item');
  const term = searchTerm.toLowerCase();
  
  toolItems.forEach(item => {
    const name = item.querySelector('.sidebar-tool-name').textContent.toLowerCase();
    const description = item.querySelector('.sidebar-tool-description').textContent.toLowerCase();
    
    if (name.includes(term) || description.includes(term)) {
      item.classList.remove('filtered-out');
    } else {
      item.classList.add('filtered-out');
    }
  });
}

// Enhanced showAddInstanceDialog - just use the original
const originalShowAddInstanceDialog = showAddInstanceDialog;
async function showAddInstanceDialogEnhanced(instanceId = null) {
  // Call original function
  await originalShowAddInstanceDialog(instanceId);
}

// Make functions globally available
window.operatorsModule = {
  showOperatorsDialog,
  showAddInstanceDialog: showAddInstanceDialogEnhanced,
  executeInstanceById,
  editInstance,
  deleteInstance,
  addParameterField,
  addOutputField,
  insertInstanceReference,
  openInstanceFromReference,
  styleInstanceReferences,
  executeRequiredOperatorsForTemplate,
  refreshOperatorsToolsList,
  setupToolsSidebarEventListeners
}; 