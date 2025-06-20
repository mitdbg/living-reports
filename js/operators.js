// operators Module
import { elements, state, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';
import { createDocumentElementId } from './element-id-manager.js';

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
    this.outputs = options.outputs || []; // Array of output assignments
    this.lastExecuted = options.lastExecuted || null;
    this.output = options.output || null;
    this.status = options.status || 'idle'; // idle, running, completed, error
    this.error = options.error || null;
    this.createdAt = options.createdAt || new Date().toISOString();
    this.updatedAt = options.updatedAt || new Date().toISOString();
    // Always use current active document ID for new operators, or specified documentId for loaded ones
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
    // Ensure new instances are created for the active document
    if (!options.documentId) {
      options.documentId = window.documentManager?.activeDocumentId || 'default';
    }
    
    const instance = new Operator(options);
    this.instances.set(instance.id, instance);
    this.saveInstances();
    
    console.log(`[${windowId}] Created operator: ${instance.name} for document: ${instance.documentId}`);
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
    // Only search within the current document's operators
    const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
    for (const instance of this.instances.values()) {
      if (instance.name === name && instance.documentId === currentDocumentId) {
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

  // Get instances for the current active document
  getCurrentDocumentInstances() {
    const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
    return this.getInstancesForDocument(currentDocumentId);
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
      const tool = await this.getTool(instance.toolId);
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
      const outputsToProcess = instance.outputs || [];
      
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

  async getTool(toolId) {
    console.log(`[${windowId}] Getting tool with ID: ${toolId}`);
    
    // Get tool from the existing tools system
    if (window.toolsManager) {
      console.log(`[${windowId}] Using toolsManager, available tools:`, window.toolsManager.tools.length);
      const tool = window.toolsManager.tools.find(tool => tool.id === toolId);
      if (tool) {
        console.log(`[${windowId}] Found tool in toolsManager:`, {
          id: tool.id, 
          name: tool.name, 
          hasCode: !!tool.code,
          toolKeys: Object.keys(tool)
        });
        return tool;
      } else {
        console.log(`[${windowId}] Tool not found in toolsManager. Available tool IDs:`, 
          window.toolsManager.tools.map(t => t.id));
      }
    } else {
      console.log(`[${windowId}] No toolsManager available`);
    }
    
    // Fallback to API
    try {
      const response = await fetch('http://127.0.0.1:5000/api/tools');
      const result = await response.json();
      if (result.success) {
        const tools = result.tools || [];
        console.log(`[${windowId}] API returned ${tools.length} tools`);
        const tool = tools.find(tool => tool.id === toolId);
        if (tool) {
          console.log(`[${windowId}] Found tool in API:`, {
            id: tool.id, 
            name: tool.name, 
            hasCode: !!tool.code,
            toolKeys: Object.keys(tool)
          });
        }
        return tool;
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

      // Convert HTML code back to plain text for backend execution
      const plainTextCode = this.convertHtmlCodeToPlainText(tool.code);
      
      // Prepare the execution payload
      const executionPayload = {
        code: plainTextCode,
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
          code: plainTextCode,
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

  convertHtmlCodeToPlainText(htmlCode) {
    if (!htmlCode) {
      return '';
    }

    // If the code doesn't contain HTML tags, return as is
    if (!htmlCode.includes('<')) {
      return htmlCode;
    }

    // First, replace <br> tags with newlines before parsing
    let processedCode = htmlCode
      .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> and <br/> with newlines
      .replace(/<div>/gi, '\n')       // Replace <div> with newlines
      .replace(/<\/div>/gi, '')       // Remove closing </div> tags
      .replace(/<p>/gi, '\n')         // Replace <p> with newlines  
      .replace(/<\/p>/gi, '');        // Remove closing </p> tags

    // Create a temporary div to parse any remaining HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedCode;

    // Get the plain text content
    let plainText = tempDiv.textContent || tempDiv.innerText || '';

    // Clean up extra whitespace and normalize line endings
    plainText = plainText
      .replace(/\r\n/g, '\n')         // Normalize Windows line endings
      .replace(/\r/g, '\n')           // Normalize Mac line endings
      .replace(/\n{3,}/g, '\n\n')     // Replace multiple newlines with double newlines
      .trim();                        // Remove leading/trailing whitespace

    return plainText;
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
      // Get current document ID for storage key
      const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
      const instancesData = {};
      
      // Only save instances for the current document
      for (const [id, instance] of this.instances) {
        if (instance.documentId === currentDocumentId) {
          instancesData[id] = instance.toJSON();
        }
      }
      
      // Use document-specific storage key
      const storageKey = `code_instances_${windowId}_${currentDocumentId}`;
      localStorage.setItem(storageKey, JSON.stringify(instancesData));
      
      console.log(`[${windowId}] Saved ${Object.keys(instancesData).length} operators for document: ${currentDocumentId}`);
    } catch (error) {
      console.error('Error saving operators:', error);
    }
  }

  loadInstances() {
    try {
      // Get current document ID for storage key
      const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
      const storageKey = `code_instances_${windowId}_${currentDocumentId}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        const instancesData = JSON.parse(saved);
        
        // Clear existing instances for this document only
        this.clearInstancesForDocument(currentDocumentId);
        
        // Load instances for this document
        for (const [id, data] of Object.entries(instancesData)) {
          // Ensure the instance has the correct documentId
          data.documentId = currentDocumentId;
          const instance = Operator.fromJSON(data);
          this.instances.set(id, instance);
        }
        
        console.log(`[${windowId}] Loaded ${Object.keys(instancesData).length} operators for document: ${currentDocumentId}`);
      } else {
        // Clear instances for this document if no saved data
        this.clearInstancesForDocument(currentDocumentId);
        console.log(`[${windowId}] No saved operators found for document: ${currentDocumentId}`);
      }
    } catch (error) {
      console.error('Error loading operators:', error);
    }
  }

  // Clear instances for a specific document
  clearInstancesForDocument(documentId) {
    const instancesToRemove = [];
    for (const [id, instance] of this.instances) {
      if (instance.documentId === documentId) {
        instancesToRemove.push(id);
      }
    }
    
    instancesToRemove.forEach(id => {
      this.instances.delete(id);
    });
    
    console.log(`[${windowId}] Cleared ${instancesToRemove.length} operators for document: ${documentId}`);
  }

  // Method to refresh operators when switching documents
  async refreshForDocument(documentId) {
    console.log(`[${windowId}] Refreshing operators for document: ${documentId}`);
    
    // Load instances for the new document
    this.loadInstances();
    
    // Validate variable assignments for loaded operators
    await this.validateVariableAssignments();
  }

  // Validate that operator output variable assignments still exist in variables manager
  async validateVariableAssignments() {
    console.log(`[${windowId}] Validating variable assignments for operators...`);
    
    try {
      // Get current valid variables from variables manager and backend
      const validVariables = await this.getValidVariables();
      const validVariableNames = new Set(Object.keys(validVariables));
      
      console.log(`[${windowId}] Found ${validVariableNames.size} valid variables:`, Array.from(validVariableNames));
      
      let invalidAssignmentsFound = 0;
      
      // Check all operators in current document
      const currentInstances = this.getCurrentDocumentInstances();
      for (const instance of currentInstances) {
        if (instance.outputs && Array.isArray(instance.outputs)) {
          let hasInvalidAssignments = false;
          
          for (const output of instance.outputs) {
            if (output.variable && !validVariableNames.has(output.variable)) {
              console.warn(`[${windowId}] Operator "${instance.name}" has invalid variable assignment: ${output.variable}`);
              hasInvalidAssignments = true;
              invalidAssignmentsFound++;
            }
          }
          
          // Mark instance with validation issues (for UI display)
          instance.hasInvalidVariableAssignments = hasInvalidAssignments;
        }
      }
      
      if (invalidAssignmentsFound > 0) {
        console.warn(`[${windowId}] Found ${invalidAssignmentsFound} invalid variable assignments`);
        addMessageToUI('system', `⚠️ ${invalidAssignmentsFound} operator output assignments point to non-existent variables`);
        
        // Save the updated instances with validation flags
        this.saveInstances();
      } else {
        console.log(`[${windowId}] All variable assignments are valid`);
      }
      
    } catch (error) {
      console.error(`[${windowId}] Error validating variable assignments:`, error);
    }
  }

  // Get valid variables from variables manager only (ground truth)
  async getValidVariables() {
    const validVariables = {};
    
    try {
      let variables = null;
      
      // Try variables manager first
      if (window.variablesManager) {
        console.log(`[${windowId}] Loading fresh variables from backend via variables manager...`);
        await window.variablesManager.loadVariables();
        
        if (window.variablesManager.variables && window.variablesManager.variables.size > 0) {
          variables = window.variablesManager.variables;
          console.log(`[${windowId}] Found ${variables.size} variables from variables manager`);
        } else {
          console.log(`[${windowId}] No variables found in variables manager after loading`);
        }
      } else {
        console.log(`[${windowId}] Variables manager not available, falling back to direct API call`);
      }
      
      // Fallback: Call API directly if variables manager is null or has no variables
      if (!variables || variables.size === 0) {
        console.log(`[${windowId}] Calling /api/variables directly as fallback...`);
        
        const documentId = window.documentManager?.activeDocumentId;
        if (!documentId) {
          console.warn(`[${windowId}] No active document ID available for API call`);
          return validVariables;
        }
        
        const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`);
        
        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success && result.variables) {
          const variablesData = result.variables || {};
          console.log(`[${windowId}] API returned ${Object.keys(variablesData).length} variables`);
          
          // Convert API response to object for consistent processing
          Object.entries(variablesData).forEach(([name, variable]) => {
            validVariables[name] = variable;
          });
        } else {
          console.log(`[${windowId}] API returned no variables or failed`);
        }
      } else {
        // Use variables from variables manager
        variables.forEach((variable, name) => {
          validVariables[name] = variable;
        });
        console.log(`[${windowId}] Loaded ${variables.size} variables from variables manager`);
      }
      
    } catch (error) {
      console.error(`[${windowId}] Error loading valid variables:`, error);
    }
    
    return validVariables;
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
  
  // Initialize tools manager (moved from tools.js)
  initToolsManager();
  
  setupOperatorEventListeners();
  
  // Set up auto-styling for template editors
  setupAutoStyling();
  
  // Set up document switching listener to refresh operators
  setupDocumentSwitchingListener();
  
  console.log(`[${windowId}] operators initialized`);
}

// Setup listener for document switching to refresh operators
function setupDocumentSwitchingListener() {
  // Listen for document tab changes
  document.addEventListener('click', async (event) => {
    // Check if a document tab was clicked
    if (event.target.matches('.document-tab') || event.target.closest('.document-tab')) {
      // Wait a bit for the document manager to update activeDocumentId
      setTimeout(async () => {
        if (operatorManager && window.documentManager?.activeDocumentId) {
          const newDocumentId = window.documentManager.activeDocumentId;
          console.log(`[${windowId}] Document switched to: ${newDocumentId}, refreshing operators`);
          await operatorManager.refreshForDocument(newDocumentId);
          
          // If operators panel is currently open, refresh its content
          const container = getActiveDocumentContainer();
          if (container && container.querySelector('.operators-panel.active')) {
            refreshInstancesList();
          }
        }
      }, 100);
    }
  });
  
  // Also listen for programmatic document changes
  document.addEventListener('documentChanged', async (event) => {
    if (operatorManager && event.detail?.documentId) {
      const newDocumentId = event.detail.documentId;
      console.log(`[${windowId}] Document changed event to: ${newDocumentId}, refreshing operators`);
      await operatorManager.refreshForDocument(newDocumentId);
      
      // If operators panel is currently open, refresh its content
      const container = getActiveDocumentContainer();
      if (container && container.querySelector('.operators-panel.active')) {
        refreshInstancesList();
      }
    }
  });
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
  // Listen for tool selection changes to auto-populate fields
  document.addEventListener('change', (event) => {
    if (event.target.id === createDocumentElementId('embedded-instance-tool')) {
      const toolId = event.target.value;
      if (toolId) {
        autoPopulateOperatorFields(toolId);
      }
    }
  });

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
      showInstanceEditor();
    }
    
    if (event.target.matches('.back-to-operators-btn') || event.target.closest('.back-to-operators-btn')) {
      showOperatorsListView();
    }
    
    if (event.target.id === createDocumentElementId('save-embedded-tool-btn')) {
      saveTool();
    }
    
    if (event.target.id === createDocumentElementId('cancel-embedded-tool-btn')) {
      showOperatorsListView();
    }
    
    if (event.target.id === createDocumentElementId('save-embedded-instance-btn')) {
      saveInstance();
    }
    
    if (event.target.id === createDocumentElementId('cancel-embedded-instance-btn')) {
      showOperatorsListView();
    }
    
    if (event.target.matches('.instance-execute-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      executeInstanceById(instanceId);
    }
    
    if (event.target.matches('.instance-edit-btn')) {
      const instanceId = event.target.getAttribute('data-instance-id');
      showInstanceEditor(instanceId);
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
    
    if (event.target.matches('.add-tool-btn-sidebar')) {
      showToolEditor();
    }
    
    if (event.target.matches('.close-operators-btn') || event.target.closest('.close-operators-btn')) {
      hideOperatorsDialog();
    }
    

  });
  
  // Setup tools sidebar event listeners
  setupToolsSidebarEventListeners();
}

// Helper function to get the active document container
function getActiveDocumentContainer() {
  // Find the active document tab content (not the template)
  const activeContent = document.querySelector('.tab-content.active:not(.document-tab-template)');
  if (activeContent) {
    return activeContent;
  }
  
  // Fallback: if we have an active document ID from window.documentManager
  if (window.documentManager?.activeDocumentId) {
    const container = document.getElementById(`document-${window.documentManager.activeDocumentId}`);
    if (container) {
      return container;
    }
  }
  
  // Last fallback: find any visible tab content that's not the template
  const visibleContent = document.querySelector('.tab-content[style*="flex"]:not(.document-tab-template), .tab-content:not([style*="none"]):not(.document-tab-template)');
  if (visibleContent) {
    return visibleContent;
  }
  
  return null;
}

// UI Functions
async function showOperatorsDialog() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error('No active document container found');
    return;
  }
  
  // Hide all other panels within this document first
  const panels = container.querySelectorAll('.source-panel, .template-panel, .preview-panel, .operators-panel, .diff-view');
  panels.forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });
  
  // Show the operators panel within this document
  const operatorsPanel = container.querySelector('.operators-panel');
  if (operatorsPanel) {
    operatorsPanel.style.display = 'flex';
    operatorsPanel.classList.add('active');
    
    // Update content title
    const contentTitle = container.querySelector(`#${createDocumentElementId('content-title')}, .content-title`);
    if (contentTitle) {
      contentTitle.textContent = 'Operators Management';
    }
    
    // Ensure we're showing the list view, not editor views
    showOperatorsListView();
    
    // Refresh operators for current document and validate variables
    const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
    await operatorManager.refreshForDocument(currentDocumentId);
    
    // Refresh the content
    refreshInstancesList();
    refreshOperatorsToolsList();
  } else {
    console.error('Operators panel not found in active document');
  }
}

function hideOperatorsDialog() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error('No active document container found');
    return;
  }
  
  // Hide the operators panel and show the template panel
  const operatorsPanel = container.querySelector('.operators-panel');
  const templatePanel = container.querySelector('.template-panel');
  const contentTitle = container.querySelector(`#${createDocumentElementId('content-title')}, .content-title`);
  
  if (operatorsPanel) {
    operatorsPanel.style.display = 'none';
    operatorsPanel.classList.remove('active');
  }
  
  if (templatePanel) {
    templatePanel.style.display = 'block';
    templatePanel.classList.add('active');
  }
  
  if (contentTitle) {
    contentTitle.textContent = 'Template Editor';
  }
}

function showOperatorsListView() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error('No active document container found');
    return;
  }
  
  const listView = container.querySelector('.operators-list-view');
  const toolEditorView = container.querySelector('.operators-tool-editor-view');
  const instanceEditorView = container.querySelector('.operators-instance-editor-view');
  const breadcrumb = container.querySelector('.nav-breadcrumb');
  
  if (listView) {
    listView.style.display = 'flex';
    listView.classList.add('active');
  }
  
  if (toolEditorView) {
    toolEditorView.style.display = 'none';
    toolEditorView.classList.remove('active');
  }
  
  if (instanceEditorView) {
    instanceEditorView.style.display = 'none';
    instanceEditorView.classList.remove('active');
  }
  
  if (breadcrumb) {
    breadcrumb.textContent = 'Operators';
  }
}

function showToolEditor(toolId = null) {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error('No active document container found');
    return;
  }
  
  const listView = container.querySelector('.operators-list-view');
  const toolEditorView = container.querySelector('.operators-tool-editor-view');
  const instanceEditorView = container.querySelector('.operators-instance-editor-view');
  const breadcrumb = container.querySelector('.nav-breadcrumb');
  const title = container.querySelector(`#${createDocumentElementId('tool-editor-title')}`);
  
  if (listView) {
    listView.style.display = 'none';
    listView.classList.remove('active');
  }
  
  if (instanceEditorView) {
    instanceEditorView.style.display = 'none';
    instanceEditorView.classList.remove('active');
  }
  
  if (toolEditorView) {
    toolEditorView.style.display = 'flex';
    toolEditorView.classList.add('active');
  }
  
  if (breadcrumb) {
    breadcrumb.textContent = 'Operators > Tool Editor';
  }
  
  // Set title and populate form if editing
  if (toolId) {
    if (title) title.textContent = 'Edit Tool';
    populateToolForm(toolId);
  } else {
    if (title) title.textContent = 'Add New Tool';
    clearToolForm();
  }
}

function showInstanceEditor(instanceId = null) {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error('No active document container found');
    return;
  }
  
  const listView = container.querySelector('.operators-list-view');
  const toolEditorView = container.querySelector('.operators-tool-editor-view');
  const instanceEditorView = container.querySelector('.operators-instance-editor-view');
  const breadcrumb = container.querySelector('.nav-breadcrumb');
  const title = container.querySelector(`#${createDocumentElementId('instance-editor-title')}`);
  
  if (listView) {
    listView.style.display = 'none';
    listView.classList.remove('active');
  }
  
  if (toolEditorView) {
    toolEditorView.style.display = 'none';
    toolEditorView.classList.remove('active');
  }
  
  if (instanceEditorView) {
    instanceEditorView.style.display = 'flex';
    instanceEditorView.classList.add('active');
  }
  
  if (breadcrumb) {
    breadcrumb.textContent = 'Operators > Instance Editor';
  }
  
  // Populate tools dropdown
  populateToolsDropdown();
  
  // Populate variables list
  populateVariablesList();
  
  // Set title and populate form if editing
  if (instanceId) {
    if (title) title.textContent = 'Edit Operator Instance';
    populateInstanceForm(instanceId);
  } else {
    if (title) title.textContent = 'Configure Operator Instance';
    clearInstanceForm();
    // Add one empty output field for new instances
    addOutputField();
  }
}

function populateToolForm(toolId) {
  // Get the tool data
  const tool = window.toolsManager?.tools.find(t => t.id === toolId);
  if (!tool) return;
  
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  // Populate form fields
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-tool-name')}`);
  const descriptionInput = container.querySelector(`#${createDocumentElementId('embedded-tool-description')}`);
  const codeEditor = container.querySelector(`#${createDocumentElementId('embedded-tool-code')}`);
  
  if (nameInput) nameInput.value = tool.name;
  if (descriptionInput) descriptionInput.value = tool.description || '';
  if (codeEditor) {
    // If tool.code already contains HTML (like <br> tags), use it directly
    // Otherwise, convert newlines to <br> tags for proper display in contenteditable div
    if (tool.code && (tool.code.includes('<br>') || tool.code.includes('<div>') || tool.code.includes('<p>'))) {
      codeEditor.innerHTML = tool.code;
    } else {
      codeEditor.innerHTML = tool.code ? tool.code.replace(/\n/g, '<br>') : '';
    }
    codeEditor.dataset.editingToolId = toolId;
  }
}

function clearToolForm() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-tool-name')}`);
  const descriptionInput = container.querySelector(`#${createDocumentElementId('embedded-tool-description')}`);
  const codeEditor = container.querySelector(`#${createDocumentElementId('embedded-tool-code')}`);
  
  if (nameInput) nameInput.value = '';
  if (descriptionInput) descriptionInput.value = '';
  if (codeEditor) {
    codeEditor.innerHTML = '';
    delete codeEditor.dataset.editingToolId;
  }
}

async function populateToolsDropdown() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  const select = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  if (!select) return;

  // Clear existing options
  select.innerHTML = '<option value="">Select a tool...</option>';

  // Get available tools
  let tools = [];
  if (window.toolsManager) {
    tools = window.toolsManager.tools;
  } else {
    // Fallback to API
    try {
      const response = await fetch('http://127.0.0.1:5000/api/tools');
      const result = await response.json();
      if (result.success) {
        tools = result.tools || [];
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

async function populateVariablesList() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  console.log('🔄 Populating all variable dropdowns in instance editor...');
  
  const allSelects = container.querySelectorAll(`#${createDocumentElementId('embedded-instance-outputs')} .output-variable-select`);
  console.log(`📊 Found ${allSelects.length} variable dropdown(s) to populate`);
  
  for (const select of allSelects) {
    await populateVariablesDropdown(select);
  }
  
  console.log('✅ All variable dropdowns populated');
}

function populateInstanceForm(instanceId) {
  const instance = operatorManager.getInstance(instanceId);
  if (!instance) return;
  
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
  const toolSelect = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  
  if (nameInput) nameInput.value = instance.name;
  if (toolSelect) toolSelect.value = instance.toolId;
  
  // Populate parameters
  populateParametersForm(instance.parameters);
  
  // Populate outputs
  populateOutputsForm(instance);
  
  // Store editing instance
  operatorsData.currentEditingInstance = instance;
}

function clearInstanceForm() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
  const toolSelect = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  
  if (nameInput) nameInput.value = '';
  if (toolSelect) toolSelect.value = '';
  
  clearParametersForm();
  clearOutputsForm();
  
  operatorsData.currentEditingInstance = null;
}

function populateParametersForm(parameters) {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (!container) return;

  container.innerHTML = '';

      Object.entries(parameters).forEach(([key, paramData]) => {
      if (typeof paramData === 'object' && paramData.type && paramData.value !== undefined) {
        addParameterField(key, paramData.value, paramData.type);
      } else {
        addParameterField(key, paramData, 'literal');
      }
    });
}

function clearParametersForm() {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (container) {
    container.innerHTML = '';
  }
}

function populateOutputsForm(instance) {
  // Clear existing output fields first
  clearOutputsForm();
  
  // Get outputs array
  const outputs = instance.outputs || [];
  
  // Add output fields for each assignment
  outputs.forEach(output => {
    addOutputField(output.config, output.variable);
  });
  
  // If no outputs exist, add one empty field
  if (outputs.length === 0) {
    addOutputField();
  }
}

function clearOutputsForm() {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-outputs')}`);
  if (container) {
    container.innerHTML = '';
  }
}

function addParameterField(key = '', value = '', valueType = 'literal') {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
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
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-outputs')}`);
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
    console.log(`🔧 Setting output variable selection to: "${outputVariable}"`);
    
    // Check if the variable exists in the dropdown
    const optionExists = select.querySelector(`option[value="${outputVariable}"]`);
    if (optionExists) {
      select.value = outputVariable;
      console.log(`  ✅ Variable "${outputVariable}" found and selected`);
    } else {
      console.log(`  ⚠️ Variable "${outputVariable}" not found in existing variables. Skipping assignment.`);
      console.log(`  Available variables:`, Array.from(select.options).map(opt => opt.value).filter(v => v));
      // Just skip - don't set any value, leave it unselected
    }
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
    let variables = null;
    
    // Try variables manager first
    if (window.variablesManager) {
      console.log('📡 Loading fresh variables from backend via variables manager...');
      await window.variablesManager.loadVariables();
      
      if (window.variablesManager.variables && window.variablesManager.variables.size > 0) {
        variables = window.variablesManager.variables;
        console.log(`📊 Found ${variables.size} variables in variables manager`);
      } else {
        console.log('📊 No variables found in variables manager after loading from backend');
      }
    } else {
      console.log('⚠️ Variables manager not available, falling back to direct API call');
    }
    
    // Fallback: Call API directly if variables manager is null or has no variables
    if (!variables || variables.size === 0) {
      console.log('📡 Calling /api/variables directly as fallback...');
      
      const documentId = window.documentManager?.activeDocumentId;
      if (!documentId) {
        console.warn('No active document ID available for API call');
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/variables?documentId=${encodeURIComponent(documentId)}`);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success && result.variables) {
        const variablesData = result.variables || {};
        console.log(`📊 API returned ${Object.keys(variablesData).length} variables`);
        
        // Convert API response to Map-like structure for consistent processing
        variables = new Map();
        Object.entries(variablesData).forEach(([name, variable]) => {
          variables.set(name, variable);
        });
      } else {
        console.log('📊 API returned no variables or failed');
        variables = new Map(); // Empty map
      }
    }
    
    // Populate dropdown with variables (from either source)
    if (variables && variables.size > 0) {
      variables.forEach((variable, name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${variable.type || 'text'})`;
        select.appendChild(option);
        console.log(`  ✓ Added variable: ${name}`);
      });
      
      console.log(`✅ Populated ${variables.size} variables in dropdown`);
    } else {
      console.log('📊 No variables available from any source');
    }

  } catch (error) {
    console.error('Error populating variables dropdown:', error);
  }
}

// Show loading indicator in operator dialog
function showOperatorLoadingIndicator() {
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  // Show AI indicator
  const aiIndicator = container.querySelector(`#${createDocumentElementId('operator-ai-indicator')}`);
  if (aiIndicator) {
    aiIndicator.style.display = 'flex';
  }
  
  // Disable form fields during loading
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
  const toolSelect = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  
  if (nameInput) nameInput.disabled = true;
  if (toolSelect) toolSelect.disabled = true;
  
  console.log('🔄 Showing operator loading indicator');
}

// Hide loading indicator in operator dialog
function hideOperatorLoadingIndicator() {
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  // Hide AI indicator
  const aiIndicator = container.querySelector(`#${createDocumentElementId('operator-ai-indicator')}`);
  if (aiIndicator) {
    aiIndicator.style.display = 'none';
  }
  
  // Re-enable form fields
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
  const toolSelect = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  
  if (nameInput) nameInput.disabled = false;
  if (toolSelect) toolSelect.disabled = false;
  
  console.log('✅ Hiding operator loading indicator');
}

// Auto-populate operator fields using LLM
async function autoPopulateOperatorFields(toolId) {
  console.log(`[${windowId}] Auto-populating fields for tool: ${toolId}`);
  
  try {
    // Get the tool
    const tool = await operatorManager.getTool(toolId);
    if (!tool) {
      console.error('Tool not found for auto-population');
      return;
    }

    // Show loading indicator
    showOperatorLoadingIndicator();
    addMessageToUI('system', `🤖 Analyzing tool "${tool.name}" to suggest operator configuration...`);

    // Call LLM to analyze the tool and suggest configurations
    const suggestions = await callLLMForToolAnalysis(tool);
    
    if (suggestions) {
      // Populate the suggested fields (force repopulation since this is auto-triggered by tool selection)
      await populateSuggestedFields(suggestions, true);
      addMessageToUI('system', `✅ Auto-populated operator fields based on "${tool.name}"`);
    }

  } catch (error) {
    console.error('Error auto-populating operator fields:', error);
    addMessageToUI('system', `⚠️ Could not auto-populate fields: ${error.message}`);
  } finally {
    // Always hide loading indicator, even if there was an error
    hideOperatorLoadingIndicator();
  }
}

async function callLLMForToolAnalysis(tool) {
  try {
    // Convert HTML code to plain text for analysis
    const plainTextCode = operatorManager.convertHtmlCodeToPlainText(tool.code);
    
    // Call the dedicated operator config suggestion API
    const response = await fetch('http://127.0.0.1:5000/api/suggest-operator-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_name: tool.name,
        tool_description: tool.description || '',
        tool_code: plainTextCode,
        document_id: window.documentManager?.activeDocumentId || 'default'
      })
    });

    if (!response.ok) {
      throw new Error(`Operator config API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Operator config suggestion response:', result);

    if (result.success && result.suggestion) {
      const suggestions = result.suggestion;
      
      // Validate the structure (the backend already validates, but double-check)
      if (typeof suggestions === 'object' && suggestions !== null) {
        // Ensure required fields have defaults
        suggestions.operatorName = suggestions.operatorName || '';
        suggestions.parameters = Array.isArray(suggestions.parameters) ? suggestions.parameters : [];
        suggestions.outputs = Array.isArray(suggestions.outputs) ? suggestions.outputs : [];
        
        console.log('Validated suggestions:', suggestions);
        
        // Show warning if fallback was used
        if (result.warning) {
          console.warn('Warning from API:', result.warning);
          addMessageToUI('system', `⚠️ ${result.warning}`);
        }
        
        return suggestions;
      }
      
      throw new Error('Invalid suggestion structure from API');
    } else {
      throw new Error(result.error || 'API request failed');
    }

  } catch (error) {
    console.error('Error calling API for tool analysis:', error);
    throw error;
  }
}

async function populateSuggestedFields(suggestions, forceRepopulate = false) {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;

  console.log('🔧 Populating suggested fields:', {
    operatorName: suggestions.operatorName,
    parametersCount: suggestions.parameters?.length || 0,
    outputsCount: suggestions.outputs?.length || 0,
    forceRepopulate: forceRepopulate
  });

  // 1. Populate operator name
  if (suggestions.operatorName && suggestions.operatorName.trim()) {
    const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
    if (nameInput && (!nameInput.value.trim() || forceRepopulate)) {
      nameInput.value = suggestions.operatorName.trim();
      console.log(`✅ Set operator name: "${suggestions.operatorName}"`);
    }
  }

  // 2. Append suggested parameters (don't clear existing ones)
  const parametersContainer = container.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (parametersContainer && suggestions.parameters && suggestions.parameters.length > 0) {
    const existingParams = parametersContainer.querySelectorAll('.parameter-field');
    
    console.log(`🔧 Appending ${suggestions.parameters.length} suggested parameters to ${existingParams.length} existing parameters`);
    
    let addedCount = 0;
    // Add suggested parameters (append, don't clear)
    for (const param of suggestions.parameters) {
      if (param.name && param.name.trim()) {
        addParameterField(
          param.name.trim(), 
          param.defaultValue || '', 
          param.type || 'literal'
        );
        console.log(`  ✅ Added parameter: ${param.name} (${param.type})`);
        addedCount++;
      } else {
        console.log(`  ⚠️ Skipping parameter with missing name:`, param);
      }
    }
    
    console.log(`✅ Added ${addedCount} parameter fields (${addedCount + existingParams.length} total)`);
  }

  // 3. Append suggested outputs (don't clear existing ones)
  const outputsContainer = container.querySelector(`#${createDocumentElementId('embedded-instance-outputs')}`);
  if (outputsContainer) {
    const existingOutputs = outputsContainer.querySelectorAll('.output-config-field');
    
    if (suggestions.outputs && suggestions.outputs.length > 0) {
      console.log(`🔧 Processing ${suggestions.outputs.length} suggested outputs...`);
      
      // Get valid variables to filter out non-existent ones
      try {
        const validVariables = await operatorManager.getValidVariables();
        const validVariableNames = new Set(Object.keys(validVariables));
        
        // Filter outputs to only include those with existing variables
        const validOutputs = suggestions.outputs.filter(output => {
          if (!output.variable || !output.variable.trim()) {
            console.log(`  ⚠️ Skipping output with missing variable:`, output);
            return false;
          }
          
          const varName = output.variable.trim();
          if (!validVariableNames.has(varName)) {
            console.log(`  ⚠️ Skipping output with non-existent variable: ${varName}`);
            return false;
          }
          
          return true;
        });
        
        console.log(`🔧 Filtered to ${validOutputs.length} valid outputs (from ${suggestions.outputs.length} suggested)`);
        
        let addedCount = 0;
        // Add only valid outputs (append, don't clear)
        for (const output of validOutputs) {
          console.log(`  ✓ Adding output field: config="${output.config}", variable="${output.variable}"`);
          await addOutputField(output.config || 'output', output.variable.trim());
          addedCount++;
        }
        
        console.log(`✅ Added ${addedCount} output fields (${addedCount + existingOutputs.length} total)`);
        
      } catch (error) {
        console.error('❌ Error filtering suggested outputs:', error);
        // Fallback: just add all suggested outputs (the addOutputField function will handle validation)
        let addedCount = 0;
        for (const output of suggestions.outputs) {
          if (output.variable && output.variable.trim()) {
            console.log(`  ✓ Adding output field (fallback): config="${output.config}", variable="${output.variable}"`);
            await addOutputField(output.config || 'output', output.variable.trim());
            addedCount++;
          }
        }
        console.log(`✅ Added ${addedCount} output fields (fallback mode)`);
      }
    } else if (existingOutputs.length === 0) {
      // If no outputs suggested and no existing outputs, ensure at least one empty output field
      console.log('🔧 No outputs suggested, adding empty output field');
      await addOutputField();
    } else {
      console.log('🔧 No outputs to add, keeping existing outputs');
    }
  } else {
    console.error('❌ Output container not found');
  }

  console.log('✅ Successfully populated suggested fields');
}

function refreshInstancesList() {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('instances-items')}`);
  if (!container) return;

  // Get only instances for the current document
  const instances = operatorManager.getCurrentDocumentInstances();

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

  // Handle multiple outputs display with validation warnings
  let outputText = 'No output assignment';
  let hasInvalidOutputs = false;
  
  if (instance.outputs && instance.outputs.length > 0) {
    const outputDescriptions = instance.outputs.map(output => {
      let outputDesc = `${output.config || 'result'} → \${${output.variable}}`;
      // Check if this specific output has invalid variable assignment
      if (instance.hasInvalidVariableAssignments) {
        outputDesc += ' ⚠️';
        hasInvalidOutputs = true;
      }
      return outputDesc;
    });
    outputText = `Output: ${outputDescriptions.join(', ')}`;
  }

  // Add validation warning if there are invalid variable assignments
  const validationWarning = instance.hasInvalidVariableAssignments 
    ? `<div class="instance-validation-warning">⚠️ Warning: Some output variables no longer exist</div>` 
    : '';

  return `
    <div class="instance-item ${statusClass} ${instance.hasInvalidVariableAssignments ? 'has-validation-issues' : ''}" data-instance-id="${instance.id}">
      <div class="instance-item-info">
        <div class="instance-item-icon">🔧</div>
        <div class="instance-item-details">
          <div class="instance-item-name">${escapeHtml(instance.name)}</div>
          <div class="instance-item-tool">Tool: ${escapeHtml(instance.toolName || instance.toolId)}</div>
          <div class="instance-item-datasets">Datasets: ${escapeHtml(datasetsText)}</div>
          <div class="instance-item-output ${hasInvalidOutputs ? 'has-invalid-outputs' : ''}">${escapeHtml(outputText)}</div>
          <div class="instance-item-meta">
            <span>Status: ${statusText}</span>
            <span>Last run: ${lastExecuted}</span>
          </div>
          ${validationWarning}
          ${instance.error ? `<div class="instance-error">Error: ${escapeHtml(instance.error)}</div>` : ''}
        </div>
      </div>
      <div class="instance-item-actions">
        <button class="instance-item-btn instance-execute-btn" data-instance-id="${instance.id}" ${instance.status === 'running' ? 'disabled' : ''}>
          ${instance.status === 'running' ? 'Running...' : 'Execute'}
        </button>
        <button class="instance-item-btn instance-edit-btn" data-instance-id="${instance.id}">Edit</button>
        <button class="instance-item-btn instance-delete-btn" data-instance-id="${instance.id}">Delete</button>
      </div>
    </div>
  `;
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
  
  // Open the instance editor for this instance
  showInstanceEditor(instance.id);
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

  // Form Save Functions
async function saveTool() {
  console.log('Saving tool.............');
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  
  const nameInput = container.querySelector(`#${createDocumentElementId('embedded-tool-name')}`);
  const descriptionInput = container.querySelector(`#${createDocumentElementId('embedded-tool-description')}`);
  const codeEditor = container.querySelector(`#${createDocumentElementId('embedded-tool-code')}`);

  const name = nameInput?.value.trim();
  const description = descriptionInput?.value.trim();
  // Preserve formatting for source code - save innerHTML to preserve <br> tags and formatting
  const code = codeEditor?.innerHTML || '';

  // Validation
  if (!name) {
    addMessageToUI('system', 'Please enter a tool name.');
    nameInput?.focus();
    return;
  }

  // Check if code has any meaningful content (not just whitespace or empty HTML tags)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = code;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  if (!textContent.trim()) {
    addMessageToUI('system', 'Please enter source code for the tool.');
    codeEditor?.focus();
    return;
  }

  try {
    const toolData = {
      name: name,
      description: description,
      code: code
    };

    // Check if we're editing an existing tool
    const editingToolId = codeEditor?.dataset.editingToolId;
    
    if (window.toolsManager) {
      // Use the toolsManager to save the tool (handles both create and update)
      if (editingToolId) {
        // Find the existing tool and update it
        const existingTool = window.toolsManager.tools.find(t => t.id === editingToolId);
        if (existingTool) {
          // Update the existing tool data
          Object.assign(existingTool, {
            name: toolData.name,
            description: toolData.description,
            code: toolData.code,
            updatedAt: new Date().toISOString()
          });
          await window.toolsManager.saveTools();
          addMessageToUI('system', `Tool "${name}" updated successfully.`);
        }
      } else {
        // Create new tool
        const newTool = {
          id: window.toolsManager.generateId(),
          name: toolData.name,
          description: toolData.description,
          code: toolData.code,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        window.toolsManager.tools.push(newTool);
        await window.toolsManager.saveTools();
        addMessageToUI('system', `Tool "${name}" created successfully.`);
      }
    } else {
      // Fallback API call
      const response = await fetch('http://127.0.0.1:5000/api/tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toolData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save tool');
      }
      addMessageToUI('system', `Tool "${name}" saved successfully.`);
    }

    // Refresh the tools list and go back to list view
    await refreshOperatorsToolsList();
    showOperatorsListView();
    
  } catch (error) {
    console.error('Error saving tool:', error);
    addMessageToUI('system', `Error saving tool: ${error.message}`);
  }
}

function saveInstance() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  const embeddedInstanceName = createDocumentElmentId('embedded-instance-name');
  const embeddedInstanceTool = createDocumentElmentId('embedded-instance-tool');
  
  const nameInput = container.querySelector(`#${embeddedInstanceName}`);
  const toolSelect = container.querySelector(`#${embeddedInstanceTool}`);

  const name = nameInput?.value.trim();
  const toolId = toolSelect?.value;

  // Validation
  if (!name) {
    addMessageToUI('system', 'Please enter an instance name.');
    nameInput?.focus();
    return;
  }

  if (!toolId) {
    addMessageToUI('system', 'Please select a tool.');
    toolSelect?.focus();
    return;
  }

  // Get output assignments
  const outputs = [];
  const outputFields = container.querySelectorAll(`#${createDocumentElementId('embedded-instance-outputs')} .output-config-field`);
  
  // Validate output fields
  for (const field of outputFields) {
    const configInput = field.querySelector('.output-config-input');
    const variableSelect = field.querySelector('.output-variable-select');
    
    const config = configInput?.value.trim();
    const variable = variableSelect?.value;
    
    // Only add if both config and variable are provided
    if (config && variable) {
      outputs.push({
        config: config,
        variable: variable
      });
    } else if (config && !variable) {
      addMessageToUI('system', 'Please select a variable for output configuration: ' + config);
      variableSelect?.focus();
      return;
    } else if (!config && variable) {
      addMessageToUI('system', 'Please specify output configuration for variable: ' + variable);
      configInput?.focus();
      return;
    }
  }

  // Get parameters
  const parameters = {};
  const paramFields = container.querySelectorAll(`#${createDocumentElementId('embedded-instance-parameters')} .parameter-field`);
  paramFields.forEach(field => {
    const key = field.querySelector('.param-key')?.value.trim();
    const typeSelect = field.querySelector('.param-type-select');
    const paramType = typeSelect?.value;
    
    let value = '';
    if (paramType === 'literal') {
      value = field.querySelector('.param-literal')?.value.trim();
    } else if (paramType === 'dataset') {
      value = field.querySelector('.param-dataset')?.value;
    }
    
    if (key && value) {
      parameters[key] = {
        type: paramType,
        value: value
      };
    }
  });

  // Get tool name for display
  const toolOption = toolSelect?.options[toolSelect.selectedIndex];
  const toolName = toolOption ? toolOption.textContent : '';

  const instanceData = {
    name: name,
    toolId: toolId,
    toolName: toolName,
    inputDatasets: [],
    parameters: parameters,
    outputs: outputs
  };

  try {
    if (operatorsData.currentEditingInstance) {
      // Update existing instance
      operatorManager.updateInstance(operatorsData.currentEditingInstance.id, instanceData);
      addMessageToUI('system', `Operator "${name}" updated successfully.`);
    } else {
      // Create new instance
      operatorManager.createInstance(instanceData);
      addMessageToUI('system', `Operator "${name}" created successfully.`);
    }

    // Refresh the instances list and go back to list view
    refreshInstancesList();
    showOperatorsListView();
    
  } catch (error) {
    console.error('Error saving instance:', error);
    addMessageToUI('system', `Error saving instance: ${error.message}`);
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
  showInstanceEditor,
  addParameterField,
  addOutputField,
  executeRequiredOperatorsForTemplate,
  autoPopulateOperatorFields,
  callLLMForToolAnalysis,
  populateSuggestedFields,
  resetOperatorsInitialization
};

// Reset function for DocumentManager cleanup
function resetOperatorsInitialization() {
  console.log('🔄 Operators initialization reset');
  
  // Reset the global operator manager
  if (operatorManager) {
    operatorManager = null;
  }
  
  // Reset tools manager
  if (toolsManager) {
    toolsManager = null;
    window.toolsManager = null;
  }
  
  // Clear any operators panel state for open documents
  const operatorsPanels = document.querySelectorAll('.operators-panel');
  operatorsPanels.forEach(panel => {
    if (panel) {
      panel.style.display = 'none';
      
      // Reset to list view
      const listView = panel.querySelector('.operators-list-view');
      const toolEditorView = panel.querySelector('.operators-tool-editor-view');
      const instanceEditorView = panel.querySelector('.operators-instance-editor-view');
      
      if (listView) listView.style.display = 'block';
      if (toolEditorView) toolEditorView.style.display = 'none';
      if (instanceEditorView) instanceEditorView.style.display = 'none';
    }
  });
  
  // Clear any styling timeouts
  if (window.instanceStylingTimeout) {
    clearTimeout(window.instanceStylingTimeout);
    window.instanceStylingTimeout = null;
  }
  
  // Reset global operators module reference
  if (window.operatorsModule) {
    window.operatorsModule = null;
  }
}

// Tool storage management (moved from tools.js)
class ToolsManager {
  constructor() {
    this.tools = [];
  }

  async init() {
    await this.loadTools();
  }

  generateId() {
    return 'tool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
      }
    } catch (error) {
      console.error('Error saving tools:', error);
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

  removeTool(toolId) {
    this.tools = this.tools.filter(t => t.id !== toolId);
    this.saveTools();
  }
}

// Initialize tools manager and make it globally available
let toolsManager;

async function initToolsManager() {
  if (!toolsManager) {
    toolsManager = new ToolsManager();
    await toolsManager.init();
    window.toolsManager = toolsManager;
  }
}

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
  // Only check operators from the current document
  const currentDocumentOperators = operatorManager.getCurrentDocumentInstances();
  const requiredOperators = [];
  
  for (const operator of currentDocumentOperators) {
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
  
  // Handle outputs array
  if (operator.outputs && Array.isArray(operator.outputs)) {
    operator.outputs.forEach(output => {
      if (output.variable && output.variable.trim()) {
        outputVars.push(output.variable.trim());
      }
    });
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
async function refreshOperatorsToolsList() {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const toolsContainer = documentContainer.querySelector(`#${createDocumentElementId('operators-tools-items')}`);
  if (!toolsContainer) return;
  
  // Get available tools
  let tools = [];
  if (window.toolsManager) {
    tools = window.toolsManager.tools;
  } else {
    // Fallback to API
    try {
      const response = await fetch('http://127.0.0.1:5000/api/tools');
      const result = await response.json();
      if (result.success) {
        tools = result.tools || [];
      }
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  }
  
  // Clear existing items
  toolsContainer.innerHTML = '';
  
  if (tools.length === 0) {
    const noToolsDiv = documentContainer.querySelector(`#${createDocumentElementId('operators-no-tools-message')}`);
    if (noToolsDiv) {
      noToolsDiv.style.display = 'block';
    }
    return;
  }
  
  // Hide no tools message
  const noToolsDiv = documentContainer.querySelector(`#${createDocumentElementId('operators-no-tools-message')}`);
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
    <div class="sidebar-tool-content">
      <div class="sidebar-tool-name">${escapeHtml(tool.name)}</div>
      <div class="sidebar-tool-description">${escapeHtml(tool.description || 'No description')}</div>
    </div>
    <div class="sidebar-tool-actions">
      <button class="sidebar-tool-delete-btn" data-tool-id="${tool.id}" title="Delete tool">🗑️</button>
    </div>
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
      // Use the embedded tool editor in operators panel
      showToolEditor();
    }
    
    // Delete tool button
    if (e.target.classList.contains('sidebar-tool-delete-btn')) {
      e.stopPropagation(); // Prevent triggering tool selection
      const toolId = e.target.getAttribute('data-tool-id');
      if (window.toolsManager) {
        window.toolsManager.removeTool(toolId);
      }
    }
  });
  
  // Tool selection in sidebar - show tool editor
  document.addEventListener('click', (e) => {
    const toolItem = e.target.closest('.operators-sidebar-tool-item');
    if (toolItem && !e.target.classList.contains('sidebar-tool-delete-btn')) {
      const toolId = toolItem.dataset.toolId;
      showToolEditor(toolId);
    }
  });
}

function filterOperatorsTools(searchTerm) {
  const toolItems = document.querySelectorAll('.operators-sidebar-tool-item');
  const term = searchTerm.toLowerCase();
  
  toolItems.forEach(item => {
    const nameElement = item.querySelector('.sidebar-tool-name');
    const descriptionElement = item.querySelector('.sidebar-tool-description');
    
    if (nameElement && descriptionElement) {
      const name = nameElement.textContent.toLowerCase();
      const description = descriptionElement.textContent.toLowerCase();
      
      if (name.includes(term) || description.includes(term)) {
        item.classList.remove('filtered-out');
      } else {
        item.classList.add('filtered-out');
      }
    }
  });
}



// Make functions globally available
window.operatorsModule = {
  showOperatorsDialog,
  hideOperatorsDialog,
  showOperatorsListView,
  showToolEditor,
  showInstanceEditor,
  saveTool,
  saveInstance,
  executeInstanceById,
  deleteInstance,
  addParameterField,
  addOutputField,
  openInstanceFromReference,
  styleInstanceReferences,
  executeRequiredOperatorsForTemplate,
  refreshOperatorsToolsList,
  setupToolsSidebarEventListeners,
  autoPopulateOperatorFields,
  callLLMForToolAnalysis,
  populateSuggestedFields,
  showOperatorLoadingIndicator,
  hideOperatorLoadingIndicator
}; 