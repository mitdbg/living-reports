// operators Module
// Updated for consistency with variable-operator-generator.js:
// - Standardized parameter type definitions (LITERAL, DATASET, VARIABLE)
// - Standardized dependency handling patterns
// - Consistent code execution with dependency support
import { elements, state, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';
import { createDocumentElementId } from './element-id-manager.js';
import { executeCodeForAuthorLocal, convertHtmlCodeToPlainText } from './execute_tool_util.js';

// Standardized Parameter Type Definitions (consistent with variable-operator-generator)
const PARAMETER_TYPES = {
  LITERAL: 'literal',
  DATASET: 'dataset',
  VARIABLE: 'variable'
};

// Standardized Dependency Handling Patterns
class DependencyHandler {
  /**
   * Get current values of dependency variables (consistent with variable-operator-generator)
   */
  static async getDependencyValues(dependencies) {
    const dependencyValues = {};
    
    if (!dependencies || dependencies.length === 0) {
      return dependencyValues;
    }
    
    try {
      // Load variables manager to get current values
      const { variablesManager } = await import('./variables.js');
      
      if (!variablesManager) {
        console.warn('Variables manager not available for getting dependency values');
        return dependencyValues;
      }
      
      // Load latest variables
      await variablesManager.loadVariables();
      
      // Get values for each dependency
      for (const depName of dependencies) {
        const variable = variablesManager.variables.get(depName);
        if (variable) {
          // Include variable info and current value
          dependencyValues[depName] = {
            name: variable.name,
            type: variable.type || 'text',
            description: variable.description || '',
            value: variable.value !== undefined ? variable.value : null,
            format: variable.format || ''
          };
          
          console.log(`Dependency ${depName}:`, dependencyValues[depName]);
        } else {
          console.warn(`Dependency variable ${depName} not found`);
          dependencyValues[depName] = {
            name: depName,
            type: 'text',
            description: 'Variable not found',
            value: null,
            format: ''
          };
        }
      }
      
    } catch (error) {
      console.error('Error getting dependency values:', error);
    }
    
    return dependencyValues;
  }

  /**
   * Execute code with dependency values as function arguments (consistent with variable-operator-generator)
   */
  static async executeCodeWithDependencies(code, dataSource, dependencyValues) {
    try {
      // Prepare the execution context with dependencies
      let executionCode = code;
      
      // If there are dependencies, we need to call the function with dependency values
      if (dependencyValues && Object.keys(dependencyValues).length > 0) {
        // Extract the function name from the generated code (assuming it follows pattern: def function_name(...))
        const functionMatch = code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (functionMatch) {
          const functionName = functionMatch[1];
          
          // Prepare arguments for function call
          const args = [];
          const dependencies = Object.keys(dependencyValues);
          
          for (const depName of dependencies) {
            console.log(`🔍 Processing dependency ${depName}:`, dependencyValues[depName]);
            
            if (dependencyValues[depName] && dependencyValues[depName].value !== null && dependencyValues[depName].value !== undefined) {
              const value = dependencyValues[depName].value;
              console.log(`✅ Found value for ${depName}:`, value, typeof value);
              
              // Format the value based on type with proper JSON serialization
              if (typeof value === 'string') {
                args.push(`'${value.replace(/'/g, "\\'")}'`);
              } else if (typeof value === 'number') {
                args.push(value.toString());
              } else if (typeof value === 'boolean') {
                args.push(value.toString());
              } else if (value === null) {
                args.push('None');
              } else if (typeof value === 'object') {
                // For objects (dicts, lists, etc.), serialize as JSON
                try {
                  const jsonValue = JSON.stringify(value);
                  args.push(`json.loads('${jsonValue.replace(/'/g, "\\'")}')`);
                } catch (error) {
                  console.error(`❌ Failed to serialize ${depName}:`, error);
                  args.push('None');
                }
              } else {
                // Fallback for other types
                args.push(`'${String(value).replace(/'/g, "\\'")}'`);
              }
            } else {
              console.warn(`❌ No valid value for dependency ${depName}, using None`);
              args.push('None');
            }
          }
          
          // Check if function expects data_source parameter
          const functionSignature = code.match(new RegExp(`def\\s+${functionName}\\s*\\(([^)]+)\\)`))?.[1] || '';
          const hasDataSourceParam = functionSignature.includes('data_source');
          
          // Build function call with proper arguments
          let functionCall;
          if (hasDataSourceParam && dataSource) {
            functionCall = `${functionName}(${args.join(', ')}, parameters['data_source'])`;
          } else {
            functionCall = `${functionName}(${args.join(', ')})`;
          }
          
          // Append function call to the code
          executionCode += `\n\n# Execute function with dependency values\noutput = ${functionCall}`;          
        }
      }
      
      // Use the same execution method but without variable storage (operators handle this separately)
      const result = await executeCodeForAuthorLocal(
        executionCode, 
        dataSource, 
        null, // Don't store in variable - operators handle this
        window.documentManager?.activeDocumentId || 'default',
        true // Skip propagation to avoid infinite loops during dependency execution
      );
      
      return result;
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extract dependencies from operator parameters
   */
  static extractDependenciesFromParameters(parameters) {
    const dependencies = [];
    
    if (!parameters) return dependencies;
    
    // Look for parameters of type 'variable' which represent dependencies
    Object.entries(parameters).forEach(([key, paramData]) => {
      if (typeof paramData === 'object' && paramData.type === PARAMETER_TYPES.VARIABLE) {
        dependencies.push(paramData.value);
      }
    });
    
    return dependencies;
  }

  /**
   * Validate that all dependencies exist in variables manager
   */
  static async validateDependencies(dependencies) {
    if (!dependencies || dependencies.length === 0) {
      return { valid: true, missing: [] };
    }
    
    try {
      const { variablesManager } = await import('./variables.js');
      
      if (!variablesManager) {
        return { valid: false, missing: dependencies, error: 'Variables manager not available' };
      }
      
      await variablesManager.loadVariables();
      
      const missing = [];
      for (const depName of dependencies) {
        const variable = variablesManager.variables.get(depName);
        if (!variable) {
          missing.push(depName);
        }
      }
      
      return {
        valid: missing.length === 0,
        missing: missing
      };
      
    } catch (error) {
      console.error('Error validating dependencies:', error);
      return { valid: false, missing: dependencies, error: error.message };
    }
  }
}

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

  getInstanceByOutputVariable(variableName) {
    // Only search within the current document's operators
    const currentDocumentId = window.documentManager?.activeDocumentId || 'default';
    for (const instance of this.instances.values()) {
      if (instance.documentId === currentDocumentId && instance.outputs) {
        const hasOutput = instance.outputs.some(output => output.variable === variableName);
        if (hasOutput) {
          return instance;
        }
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

    let dataSource = null; // Declare dataSource in the broader scope
    
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

      // Get the tool code and convert to plain text for execution
      const plainTextCode = convertHtmlCodeToPlainText(tool.code);
      
      // Get the primary data source from parameters (same as variable-operator-generator approach)
      if (instance.parameters && instance.parameters.data_source) {
        if (typeof instance.parameters.data_source === 'object') {
          dataSource = instance.parameters.data_source.value;
        } else {
          dataSource = instance.parameters.data_source;
        }
      }
      
      // Extract dependencies from parameters using standardized approach
      const dependencies = DependencyHandler.extractDependenciesFromParameters(instance.parameters);
      
      // Validate dependencies before execution
      const dependencyValidation = await DependencyHandler.validateDependencies(dependencies);
      if (!dependencyValidation.valid) {
        console.warn(`[${windowId}] Missing dependencies:`, dependencyValidation.missing);
      }

      // Execute using standardized dependency handling (consistent with variable-operator-generator)
      let result;
      if (dependencies.length > 0) {
        // Get current dependency values
        const dependencyValues = await DependencyHandler.getDependencyValues(dependencies);
        console.log(`[${windowId}] Dependency values:`, dependencyValues);
        
        // Execute with dependencies
        result = await DependencyHandler.executeCodeWithDependencies(
          plainTextCode,
          dataSource,
          dependencyValues
        );
      } else {
        // Execute without dependencies (original approach)
        result = await executeCodeForAuthorLocal(
          plainTextCode, 
          dataSource, 
          instance.name, 
          window.documentManager?.activeDocumentId || 'default'
        );
      }
      
      // Update instance with results
      instance.output = result;
      instance.lastExecuted = new Date().toISOString();
      instance.error = null;

      // Store outputs in variables if specified (same as variable-operator-generator approach)
      const outputsToProcess = instance.outputs || [];
      
      // Check if execution was successful (result is not null/undefined)
      if (result !== null && result !== undefined) {
        instance.status = 'completed';
        
        for (const output of outputsToProcess) {
          if (output.variable && output.variable.trim()) {
            try {
              // Extract the value using the output configuration
              let valueToStore = result;
              
              // For executeCodeForAuthorLocal, the result is the direct value
              // but we still support output config for nested value extraction
              if (output.config && output.config.trim() && output.config !== 'output') {
                valueToStore = this.extractValueFromOutput(result, output.config);
              }
              
              // Import variables manager and store the result (same as variable-operator-generator)
              const { variablesManager } = await import('./variables.js');
              if (variablesManager) {
                // Get current variables first
                await variablesManager.loadVariables();
                
                const variable = variablesManager.variables.get(output.variable);
                if (variable) {
                  // Update metadata directly
                  variable.lastUpdated = new Date().toISOString();
                  variable.extractedBy = instance.name;
                  variable.dataSource = dataSource;
                  
                  // Use setVariableValue to trigger dependency propagation
                  await variablesManager.setVariableValue(output.variable, valueToStore);
                } else {
                  console.warn(`[${windowId}] Variable not found: ${output.variable}`);
                }
              }
            } catch (error) {
              console.warn(`[${windowId}] Failed to store output in variable ${output.variable}:`, error);
            }
          }
        }

        this.saveInstances();
        this.notifyInstanceUpdate(instance);
  
        return result;
      } else {
        // Execution failed
        instance.status = 'error';
        instance.error = 'Execution returned null or undefined result';
        this.saveInstances();
        this.notifyInstanceUpdate(instance);
        throw new Error('Execution returned null or undefined result');
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

      throw error;
    }
  }

  async getTool(toolId) {
    
    // Get tool from the existing tools system
    if (window.toolsManager) {
      const tool = window.toolsManager.tools.find(tool => tool.id === toolId);
      if (tool) {
        return tool;
      }
    }
    
    // Fallback to API
    try {
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot load tools from API: no current document set`);
        return null;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}&windowId=${windowId}`);
      const result = await response.json();
      if (result.success) {
        const tools = result.tools || [];
        const tool = tools.find(tool => tool.id === toolId);
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
        // Simple string reference to dataset name or file path
        let dataset = window.dataSourcesModule?.getDataSource(ref);
        if (!dataset) {
          // Try to find by file path if not found by reference name
          const allDataSources = window.dataSourcesModule?.getAllDataSources() || [];
          dataset = allDataSources.find(ds => ds.filePath === ref || ds.referenceName === ref);
        }
        
        if (dataset) {
          datasets.push({
            name: dataset.referenceName || ref,
            data: dataset
          });
        } else {
          console.warn(`[${windowId}] Dataset not found: ${ref}`);
        }
      } else if (typeof ref === 'object' && ref.name) {
        // Object with name and optional alias
        let dataset = window.dataSourcesModule?.getDataSource(ref.name);
        if (!dataset) {
          // Try to find by file path if not found by reference name
          const allDataSources = window.dataSourcesModule?.getAllDataSources() || [];
          dataset = allDataSources.find(ds => ds.filePath === ref.name || ds.referenceName === ref.name);
        }
        
        if (dataset) {
          datasets.push({
            name: ref.alias || dataset.referenceName || ref.name,
            data: dataset
          });
        } else {
          console.warn(`[${windowId}] Dataset not found: ${ref.name}`);
        }
      }
    }
    
    return datasets;
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
      } else {
        // Clear instances for this document if no saved data
        this.clearInstancesForDocument(currentDocumentId);
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
  }

  // Method to refresh operators when switching documents
  async refreshForDocument(documentId) {
    // Load instances for the new document
    this.loadInstances();
    
    // Validate variable assignments for loaded operators
    await this.validateVariableAssignments();
  }

  // Validate that operator output variable assignments still exist in variables manager
  async validateVariableAssignments() {
    try {
      // Get current valid variables from variables manager and backend
      const validVariables = await this.getValidVariables();
      const validVariableNames = new Set(Object.keys(validVariables));
      
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
        // Save the updated instances with validation flags
        this.saveInstances();
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
        await window.variablesManager.loadVariables();
        
        if (window.variablesManager.variables && window.variablesManager.variables.size > 0) {
          variables = window.variablesManager.variables;
        }
      }
      
      // Fallback: Call API directly if variables manager is null or has no variables
      if (!variables || variables.size === 0) {
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
          
          // Convert API response to object for consistent processing
          Object.entries(variablesData).forEach(([name, variable]) => {
            validVariables[name] = variable;
          });
        }
      } else {
        // Use variables from variables manager
        variables.forEach((variable, name) => {
          validVariables[name] = variable;
        });
      }
      
    } catch (error) {
      console.error(`[${windowId}] Error loading valid variables:`, error);
    }
    
    return validVariables;
  }
}

// Global instance manager
let operatorManager = null;

// Event handlers tracking for cleanup (similar to file-operations.js)
const operatorsEventData = {
  operatorsInitialized: false,
  // Click handlers
  operatorsBtnHandler: null,
  instanceReferenceHandler: null,
  addInstanceBtnHandler: null,
  backToOperatorsBtnHandler: null,
  saveToolBtnHandler: null,
  cancelToolBtnHandler: null,
  saveInstanceBtnHandler: null,
  cancelInstanceBtnHandler: null,
  closeOperatorsBtnHandler: null,
  // Dynamic handlers for instances
  instanceExecuteHandler: null,
  instanceEditHandler: null,
  instanceDeleteHandler: null,
  addParameterBtnHandler: null,
  addOutputBtnHandler: null,
  // Change handlers
  toolSelectionChangeHandler: null,
  // Tools sidebar handlers
  toolsSearchHandler: null,
  addToolBtnSidebarHandler: null,
  toolsSidebarClickHandler: null,
  // Current elements with attached listeners
  currentOperatorsPanel: null,
  currentElements: {
    operatorsBtn: null,
    addInstanceBtn: null,
    backToOperatorsBtn: null,
    saveToolBtn: null,
    cancelToolBtn: null,
    saveInstanceBtn: null,
    cancelInstanceBtn: null,
    closeOperatorsBtn: null,
    toolSelection: null,
    // Tools sidebar elements
    toolsSearch: null,
    addToolBtnSidebar: null,
    toolsContainer: null
  }
};

// Initialize operators
export function initOperators() {
  console.log(`[${windowId}] Initializing operators`);
  
  if (!operatorManager) {
    operatorManager = new OperatorManager();
    // Expose to window for external access
    window.operatorManager = operatorManager;
  }
  
  // Initialize tools manager (moved from tools.js)
  initToolsManager();
  
  // Set up event listeners for active document
  setupOperatorEventListeners();
  
  // Set up auto-styling for template editors
  setupAutoStyling();
  
  // Set up document switching listener to refresh operators
  setupDocumentSwitchingListener();
  
  // Ensure window.operatorsModule is available immediately after initialization
  // This fixes the race condition where template execution happens before the global assignment
  if (!window.operatorsModule) {
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
  }  
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

// Setup event listeners using direct element attachment (similar to file-operations.js)
function setupOperatorEventListeners() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error(`[${windowId}] No active document container found for operator event listeners`);
    return;
  }
  
  // Clean up existing event listeners first
  cleanupOperatorEventListeners();
  
  // Store current container reference
  operatorsEventData.currentOperatorsPanel = container;
  
  // Create event handlers
  operatorsEventData.operatorsBtnHandler = () => {
    showOperatorsDialog();
  };
  
  operatorsEventData.addInstanceBtnHandler = () => {
    showInstanceEditor();
  };
  
  operatorsEventData.backToOperatorsBtnHandler = () => {
    showOperatorsListView();
  };
  
  operatorsEventData.saveToolBtnHandler = () => {
    saveTool();
  };
  
  operatorsEventData.cancelToolBtnHandler = () => {
    showOperatorsListView();
  };
  
  operatorsEventData.saveInstanceBtnHandler = () => {
    saveInstance();
  };
  
  operatorsEventData.cancelInstanceBtnHandler = () => {
    showOperatorsListView();
  };
  
  operatorsEventData.closeOperatorsBtnHandler = () => {
    hideOperatorsDialog();
  };
  
  operatorsEventData.toolSelectionChangeHandler = (e) => {
    const toolId = e.target.value;
    if (toolId) {
      autoPopulateOperatorFields(toolId);
    }
  };
  
  // Dynamic click handler for the operators panel (using event delegation within the panel)
  operatorsEventData.operatorsPanelClickHandler = (e) => {
    // Instance references (can be anywhere in template editors)
    if (e.target.matches('.instance-reference')) {
      const instanceName = e.target.textContent.replace('$$', '').replace(/_/g, ' ');
      openInstanceFromReference(instanceName).catch(error => {
        console.error('Error opening instance from reference:', error);
      });
      return;
    }
    
    // Instance action buttons
    if (e.target.matches('.instance-execute-btn')) {
      const instanceId = e.target.getAttribute('data-instance-id');
      executeInstanceById(instanceId);
      return;
    }
    
    if (e.target.matches('.instance-edit-btn')) {
      const instanceId = e.target.getAttribute('data-instance-id');
      showInstanceEditor(instanceId);
      return;
    }
    
    if (e.target.matches('.instance-delete-btn')) {
      const instanceId = e.target.getAttribute('data-instance-id');
      deleteInstance(instanceId);
      return;
    }

    if (e.target.matches('.add-parameter-btn')) {
      addParameterField();
      return;
    }
    
    if (e.target.matches('.add-output-btn')) {
      addOutputField();
      return;
    }
  };
  
  // Find and attach to specific elements
  const operatorsBtn = container.querySelector('.operators-btn');
  const addInstanceBtn = container.querySelector('.add-instance-btn');
  const backToOperatorsBtn = container.querySelector('.back-to-operators-btn');
  const saveToolBtn = container.querySelector(`#${createDocumentElementId('save-embedded-tool-btn')}`);
  const cancelToolBtn = container.querySelector(`#${createDocumentElementId('cancel-embedded-tool-btn')}`);
  const saveInstanceBtn = container.querySelector(`#${createDocumentElementId('save-embedded-instance-btn')}`);
  const cancelInstanceBtn = container.querySelector(`#${createDocumentElementId('cancel-embedded-instance-btn')}`);
  const closeOperatorsBtn = container.querySelector('.close-operators-btn');
  const toolSelection = container.querySelector(`#${createDocumentElementId('embedded-instance-tool')}`);
  
  // Attach event listeners to found elements
  if (operatorsBtn) {
    operatorsBtn.addEventListener('click', operatorsEventData.operatorsBtnHandler);
    operatorsEventData.currentElements.operatorsBtn = operatorsBtn;
  }
  
  if (addInstanceBtn) {
    addInstanceBtn.addEventListener('click', operatorsEventData.addInstanceBtnHandler);
    operatorsEventData.currentElements.addInstanceBtn = addInstanceBtn;
  }
  
  if (backToOperatorsBtn) {
    backToOperatorsBtn.addEventListener('click', operatorsEventData.backToOperatorsBtnHandler);
    operatorsEventData.currentElements.backToOperatorsBtn = backToOperatorsBtn;
  }
  
  if (saveToolBtn) {
    saveToolBtn.addEventListener('click', operatorsEventData.saveToolBtnHandler);
    operatorsEventData.currentElements.saveToolBtn = saveToolBtn;
  }
  
  if (cancelToolBtn) {
    cancelToolBtn.addEventListener('click', operatorsEventData.cancelToolBtnHandler);
    operatorsEventData.currentElements.cancelToolBtn = cancelToolBtn;
  }
  
  if (saveInstanceBtn) {
    saveInstanceBtn.addEventListener('click', operatorsEventData.saveInstanceBtnHandler);
    operatorsEventData.currentElements.saveInstanceBtn = saveInstanceBtn;
  }
  
  if (cancelInstanceBtn) {
    cancelInstanceBtn.addEventListener('click', operatorsEventData.cancelInstanceBtnHandler);
    operatorsEventData.currentElements.cancelInstanceBtn = cancelInstanceBtn;
  }
  
  if (closeOperatorsBtn) {
    closeOperatorsBtn.addEventListener('click', operatorsEventData.closeOperatorsBtnHandler);
    operatorsEventData.currentElements.closeOperatorsBtn = closeOperatorsBtn;
  }
  
  if (toolSelection) {
    toolSelection.addEventListener('change', operatorsEventData.toolSelectionChangeHandler);
    operatorsEventData.currentElements.toolSelection = toolSelection;
  }
  
  // Attach the panel click handler for dynamic elements
  if (container) {
    container.addEventListener('click', operatorsEventData.operatorsPanelClickHandler);
  }
  
  // Setup tools sidebar event listeners
  setupToolsSidebarEventListeners();
  
  // Mark as initialized
  operatorsEventData.operatorsInitialized = true;
  
}

// Cleanup function for operator event listeners
function cleanupOperatorEventListeners() {
  // Remove listeners from tracked elements
  if (operatorsEventData.currentElements.operatorsBtn && operatorsEventData.operatorsBtnHandler) {
    operatorsEventData.currentElements.operatorsBtn.removeEventListener('click', operatorsEventData.operatorsBtnHandler);
  }
  
  if (operatorsEventData.currentElements.addInstanceBtn && operatorsEventData.addInstanceBtnHandler) {
    operatorsEventData.currentElements.addInstanceBtn.removeEventListener('click', operatorsEventData.addInstanceBtnHandler);
  }
  
  if (operatorsEventData.currentElements.backToOperatorsBtn && operatorsEventData.backToOperatorsBtnHandler) {
    operatorsEventData.currentElements.backToOperatorsBtn.removeEventListener('click', operatorsEventData.backToOperatorsBtnHandler);
  }
  
  if (operatorsEventData.currentElements.saveToolBtn && operatorsEventData.saveToolBtnHandler) {
    operatorsEventData.currentElements.saveToolBtn.removeEventListener('click', operatorsEventData.saveToolBtnHandler);
  }
  
  if (operatorsEventData.currentElements.cancelToolBtn && operatorsEventData.cancelToolBtnHandler) {
    operatorsEventData.currentElements.cancelToolBtn.removeEventListener('click', operatorsEventData.cancelToolBtnHandler);
  }
  
  if (operatorsEventData.currentElements.saveInstanceBtn && operatorsEventData.saveInstanceBtnHandler) {
    operatorsEventData.currentElements.saveInstanceBtn.removeEventListener('click', operatorsEventData.saveInstanceBtnHandler);
  }
  
  if (operatorsEventData.currentElements.cancelInstanceBtn && operatorsEventData.cancelInstanceBtnHandler) {
    operatorsEventData.currentElements.cancelInstanceBtn.removeEventListener('click', operatorsEventData.cancelInstanceBtnHandler);
  }
  
  if (operatorsEventData.currentElements.closeOperatorsBtn && operatorsEventData.closeOperatorsBtnHandler) {
    operatorsEventData.currentElements.closeOperatorsBtn.removeEventListener('click', operatorsEventData.closeOperatorsBtnHandler);
  }
  
  if (operatorsEventData.currentElements.toolSelection && operatorsEventData.toolSelectionChangeHandler) {
    operatorsEventData.currentElements.toolSelection.removeEventListener('change', operatorsEventData.toolSelectionChangeHandler);
  }
  
  // Remove panel delegation handler
  if (operatorsEventData.currentOperatorsPanel && operatorsEventData.operatorsPanelClickHandler) {
    operatorsEventData.currentOperatorsPanel.removeEventListener('click', operatorsEventData.operatorsPanelClickHandler);
  }
  
  // Clean up tools sidebar listeners
  cleanupToolsSidebarEventListeners();
  
  // Clear all references
  operatorsEventData.currentOperatorsPanel = null;
  operatorsEventData.operatorsBtnHandler = null;
  operatorsEventData.addInstanceBtnHandler = null;
  operatorsEventData.backToOperatorsBtnHandler = null;
  operatorsEventData.saveToolBtnHandler = null;
  operatorsEventData.cancelToolBtnHandler = null;
  operatorsEventData.saveInstanceBtnHandler = null;
  operatorsEventData.cancelInstanceBtnHandler = null;
  operatorsEventData.closeOperatorsBtnHandler = null;
  operatorsEventData.toolSelectionChangeHandler = null;
  operatorsEventData.operatorsPanelClickHandler = null;
  operatorsEventData.toolsSearchHandler = null;
  operatorsEventData.addToolBtnSidebarHandler = null;
  operatorsEventData.toolsSidebarClickHandler = null;
  
  // Clear element references
  Object.keys(operatorsEventData.currentElements).forEach(key => {
    operatorsEventData.currentElements[key] = null;
  });
  
  operatorsEventData.operatorsInitialized = false;
  
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

async function showInstanceEditor(instanceId = null) {
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
    hideOperatorLoadingIndicator();
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
    await populateInstanceForm(instanceId);
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
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot load tools from API: no current document set`);
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}&windowId=${windowId}`);
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
  
  const allSelects = container.querySelectorAll(`#${createDocumentElementId('embedded-instance-outputs')} .output-variable-select`);
  
  for (const select of allSelects) {
    await populateVariablesDropdown(select);
  }
}

async function populateInstanceForm(instanceId) {
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
  await populateParametersForm(instance.parameters);
  
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

async function populateParametersForm(parameters) {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (!container) return;

  container.innerHTML = '';

  for (const [key, paramData] of Object.entries(parameters)) {
    if (typeof paramData === 'object' && paramData.type && paramData.value !== undefined) {
      // Use standardized parameter types
      const paramType = Object.values(PARAMETER_TYPES).includes(paramData.type) 
        ? paramData.type 
        : PARAMETER_TYPES.LITERAL;
      await addParameterField(key, paramData.value, paramType);
    } else {
      await addParameterField(key, paramData, PARAMETER_TYPES.LITERAL);
    }
  }
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

async function addParameterField(key = '', value = '', valueType = 'literal') {
  // Get the active document container
  const documentContainer = getActiveDocumentContainer();
  if (!documentContainer) return;
  
  const container = documentContainer.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (!container) return;

  // Get available datasets for the dropdown (use same approach as variable-operator-generator)
  const datasets = window.dataSourcesModule?.getAllDataSources() || [];
  const datasetOptions = datasets.map(dataset => {
    // Use filePath as the value for code execution, fallback to referenceName for backward compatibility
    const datasetValue = dataset.filePath || dataset.referenceName;
    const isSelected = valueType === PARAMETER_TYPES.DATASET && (value === datasetValue || value === dataset.referenceName);
    const displayName = `${getFileIcon(dataset.type)} ${dataset.name} ($${dataset.referenceName})`;
    return `<option value="${datasetValue}" ${isSelected ? 'selected' : ''}>${displayName}</option>`;
  }).join('');

  // Get available variables for the dropdown (load fresh if needed)
  let variables = [];
  if (window.variablesManager) {
    try {
      await window.variablesManager.loadVariables();
      variables = Array.from(window.variablesManager.variables.keys());
    } catch (error) {
      console.warn('Could not load variables for parameter field:', error);
    }
  }
  const variableOptions = variables.map(varName => {
    const isSelected = valueType === PARAMETER_TYPES.VARIABLE && value === varName;
    return `<option value="${varName}" ${isSelected ? 'selected' : ''}>${varName}</option>`;
  }).join('');

  const field = document.createElement('div');
  field.className = 'parameter-field';
  field.innerHTML = `
    <input type="text" class="param-key" placeholder="Parameter name" value="${key}">
    <div class="param-value-container">
      <select class="param-type-select">
        <option value="${PARAMETER_TYPES.LITERAL}" ${valueType === PARAMETER_TYPES.LITERAL ? 'selected' : ''}>Literal Value</option>
        <option value="${PARAMETER_TYPES.DATASET}" ${valueType === PARAMETER_TYPES.DATASET ? 'selected' : ''}>Dataset</option>
        <option value="${PARAMETER_TYPES.VARIABLE}" ${valueType === PARAMETER_TYPES.VARIABLE ? 'selected' : ''}>Variable</option>
      </select>
      <input type="text" class="param-value param-literal" placeholder="e.g., false, 123, 'text'" value="${valueType === PARAMETER_TYPES.LITERAL ? value : ''}" ${valueType !== PARAMETER_TYPES.LITERAL ? 'style="display: none;"' : ''}>
      <select class="param-value param-dataset" ${valueType !== PARAMETER_TYPES.DATASET ? 'style="display: none;"' : ''}>
        <option value="">Select dataset...</option>
        ${datasetOptions}
      </select>
      <select class="param-value param-variable" ${valueType !== PARAMETER_TYPES.VARIABLE ? 'style="display: none;"' : ''}>
        <option value="">Select variable...</option>
        ${variableOptions}
      </select>
    </div>
    <button type="button" class="remove-param-btn">✕</button>
  `;
  
  // Add event listener to toggle between parameter types
  const typeSelect = field.querySelector('.param-type-select');
  const literalInput = field.querySelector('.param-literal');
  const datasetSelect = field.querySelector('.param-dataset');
  const variableSelect = field.querySelector('.param-variable');
  
  typeSelect.addEventListener('change', () => {
    // Hide all inputs first
    literalInput.style.display = 'none';
    datasetSelect.style.display = 'none';
    variableSelect.style.display = 'none';
    
    // Show the appropriate input based on selection
    if (typeSelect.value === PARAMETER_TYPES.LITERAL) {
      literalInput.style.display = '';
    } else if (typeSelect.value === PARAMETER_TYPES.DATASET) {
      datasetSelect.style.display = '';
    } else if (typeSelect.value === PARAMETER_TYPES.VARIABLE) {
      variableSelect.style.display = '';
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
    // Check if the variable exists in the dropdown
    const optionExists = select.querySelector(`option[value="${outputVariable}"]`);
    if (optionExists) {
      select.value = outputVariable;
    }
  }
}

async function populateVariablesDropdown(select) {
  if (!select) {
    console.error('Variable select element not provided');
    return;
  }

  // Clear existing options except the first one
  select.innerHTML = '<option value="">Select a variable...</option>';

  try {
    let variables = null;
    
    // Try variables manager first
    if (window.variablesManager) {
      await window.variablesManager.loadVariables();
      
      if (window.variablesManager.variables && window.variablesManager.variables.size > 0) {
        variables = window.variablesManager.variables;
      }
    }
    
    // Fallback: Call API directly if variables manager is null or has no variables
    if (!variables || variables.size === 0) {
      
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
        
        // Convert API response to Map-like structure for consistent processing
        variables = new Map();
        Object.entries(variablesData).forEach(([name, variable]) => {
          variables.set(name, variable);
        });
      } else {
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
      });
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
  
}

// Auto-populate operator fields using LLM
async function autoPopulateOperatorFields(toolId) {
  try {
    // Get the tool
    const tool = await operatorManager.getTool(toolId);
    if (!tool) {
      console.error('Tool not found for auto-population');
      return;
    }

    // Show loading indicator
    showOperatorLoadingIndicator();

    // Call LLM to analyze the tool and suggest configurations
    const suggestions = await callLLMForToolAnalysis(tool);
    
    if (suggestions) {
      // Populate the suggested fields (force repopulation since this is auto-triggered by tool selection)
      await populateSuggestedFields(suggestions, true);
    }

  } catch (error) {
    hideOperatorLoadingIndicator();
    console.error('Error auto-populating operator fields:', error);
  } finally {
    // Always hide loading indicator, even if there was an error
    hideOperatorLoadingIndicator();
  }
}

async function callLLMForToolAnalysis(tool) {
  try {
    // Convert HTML code to plain text for analysis
    const plainTextCode = convertHtmlCodeToPlainText(tool.code);
    
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

    if (result.success && result.suggestion) {
      const suggestions = result.suggestion;
      
      // Validate the structure (the backend already validates, but double-check)
      if (typeof suggestions === 'object' && suggestions !== null) {
        // Ensure required fields have defaults
        suggestions.operatorName = suggestions.operatorName || '';
        suggestions.parameters = Array.isArray(suggestions.parameters) ? suggestions.parameters : [];
        suggestions.outputs = Array.isArray(suggestions.outputs) ? suggestions.outputs : [];
        
        // Show warning if fallback was used
        if (result.warning) {
          console.warn('Warning from API:', result.warning);
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

  // 1. Populate operator name
  if (suggestions.operatorName && suggestions.operatorName.trim()) {
    const nameInput = container.querySelector(`#${createDocumentElementId('embedded-instance-name')}`);
    if (nameInput && (!nameInput.value.trim() || forceRepopulate)) {
      nameInput.value = suggestions.operatorName.trim();
    }
  }

  // 2. Append suggested parameters (don't clear existing ones)
  const parametersContainer = container.querySelector(`#${createDocumentElementId('embedded-instance-parameters')}`);
  if (parametersContainer && suggestions.parameters && suggestions.parameters.length > 0) {
    const existingParams = parametersContainer.querySelectorAll('.parameter-field');
    
    let addedCount = 0;
    // Add suggested parameters (append, don't clear)
    for (const param of suggestions.parameters) {
      if (param.name && param.name.trim()) {
        addParameterField(
          param.name.trim(), 
          param.defaultValue || '', 
          param.type || 'literal'
        );
        addedCount++;
      }
    }
  }

  // 3. Append suggested outputs (don't clear existing ones)
  const outputsContainer = container.querySelector(`#${createDocumentElementId('embedded-instance-outputs')}`);
  if (outputsContainer) {
    const existingOutputs = outputsContainer.querySelectorAll('.output-config-field');
    
    if (suggestions.outputs && suggestions.outputs.length > 0) {
      // Get valid variables to filter out non-existent ones
      try {
        const validVariables = await operatorManager.getValidVariables();
        const validVariableNames = new Set(Object.keys(validVariables));
        
        // Filter outputs to only include those with existing variables
        const validOutputs = suggestions.outputs.filter(output => {
          if (!output.variable || !output.variable.trim()) {
            return false;
          }
          
          const varName = output.variable.trim();
          if (!validVariableNames.has(varName)) {
            return false;
          }
          
          return true;
        });
        
        let addedCount = 0;
        // Add only valid outputs (append, don't clear)
        for (const output of validOutputs) {
          await addOutputField(output.config || 'output', output.variable.trim());
          addedCount++;
        }
        
      } catch (error) {
        console.error('❌ Error filtering suggested outputs:', error);
        // Fallback: just add all suggested outputs (the addOutputField function will handle validation)
        let addedCount = 0;
        for (const output of suggestions.outputs) {
          if (output.variable && output.variable.trim()) {
            await addOutputField(output.config || 'output', output.variable.trim());
            addedCount++;
          }
        }
      }
    } else if (existingOutputs.length === 0) {
      // If no outputs suggested and no existing outputs, ensure at least one empty output field
      await addOutputField();
    }
  } else {
    console.error('❌ Output container not found');
  }
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
  // Find the instance by name
  const instance = operatorManager.getInstanceByName(instanceName);
  
  if (!instance) {
    return;
  }
  
  // Open the instance editor for this instance
  showInstanceEditor(instance.id);
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
    nameInput?.focus();
    return;
  }

  // Check if code has any meaningful content (not just whitespace or empty HTML tags)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = code;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  if (!textContent.trim()) {
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
    }

    // Refresh the tools list and go back to list view
    await refreshOperatorsToolsList();
    showOperatorsListView();
    
  } catch (error) {
    console.error('Error saving tool:', error);
  }
}

function saveInstance() {
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) return;
  const embeddedInstanceName = createDocumentElementId('embedded-instance-name');
  const embeddedInstanceTool = createDocumentElementId('embedded-instance-tool');
  
  const nameInput = container.querySelector(`#${embeddedInstanceName}`);
  const toolSelect = container.querySelector(`#${embeddedInstanceTool}`);

  const name = nameInput?.value.trim();
  const toolId = toolSelect?.value;

  // Validation
  if (!name) {
    nameInput?.focus();
    return;
  }

  if (!toolId) {
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
      variableSelect?.focus();
      return;
    } else if (!config && variable) {
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
    if (paramType === PARAMETER_TYPES.LITERAL) {
      value = field.querySelector('.param-literal')?.value.trim();
    } else if (paramType === PARAMETER_TYPES.DATASET) {
      value = field.querySelector('.param-dataset')?.value;
    } else if (paramType === PARAMETER_TYPES.VARIABLE) {
      value = field.querySelector('.param-variable')?.value;
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
    } else {
      // Create new instance
      operatorManager.createInstance(instanceData);
    }

    // Refresh the instances list and go back to list view
    refreshInstancesList();
    showOperatorsListView();
    
  } catch (error) {
    console.error('Error saving instance:', error);
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
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get file icon based on type (same as variable-operator-generator)
 */
function getFileIcon(type) {
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

// Export functions
export { 
  Operator, 
  OperatorManager, 
  DependencyHandler,
  PARAMETER_TYPES,
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
  // Clean up all event listeners first
  cleanupOperatorEventListeners();
  
  // Reset the global operator manager
  if (operatorManager) {
    operatorManager = null;
    window.operatorManager = null;
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
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot save tools: no current document set`);
        return;
      }
      
      const response = await fetch('http://127.0.0.1:5000/api/tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          documentId: currentDocumentId,
          windowId: windowId,
          tools: this.tools 
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`[${windowId}] Saved ${this.tools.length} tools for document ${currentDocumentId}`);
      } else {
        console.error('Error saving tools:', result.error);
      }
    } catch (error) {
      console.error('Error saving tools:', error);
    }
  }

  async loadTools() {
    try {
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot load tools: no current document set`);
        this.tools = [];
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}&windowId=${windowId}`);
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

  async removeTool(toolId) {
    try {
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot remove tool: no current document set`);
        return;
      }
      
      // Remove from local array
      this.tools = this.tools.filter(t => t.id !== toolId);
      
      // Save the updated tools
      await this.saveTools();
      
    } catch (error) {
      console.error('Error removing tool:', error);
    }
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
  try {
    // 1. Extract variables from template content
    const requiredVariables = extractVariablesFromTemplate(templateContent);
    
    if (requiredVariables.length === 0) {
      return { success: true, executedOperators: [] };
    }
    
    // 2. Identify operators that output these variables
    const requiredOperators = identifyRequiredOperators(requiredVariables);
    
    if (requiredOperators.length === 0) {
      return { success: true, executedOperators: [] };
    }
    
    // 3. Execute operators with cascading dependency updates
    const executionResults = await executeOperatorsWithCascadingUpdates(requiredOperators);
    
    return {
      success: true,
      executedOperators: executionResults.executedOperators || [],
      results: executionResults.results || []
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

// Store to track previous dependency values for change detection
let previousDependencyValues = new Map();

/**
 * Clear dependency cache to force re-execution of all operators
 */
function clearDependencyCache() {
  previousDependencyValues.clear();
  console.log(`[${windowId}] Dependency cache cleared - next execution will run all operators with cascading updates`);
}

/**
 * Identify operators that need re-execution due to changed dependencies
 */
async function identifyOperatorsWithChangedDependencies(operators) {
  try {
    // Load variables manager to get variable values
    const { variablesManager } = await import('./variables.js');
    
    if (!variablesManager) {
      console.warn('Variables manager not available, executing all operators');
      return operators;
    }
    
    // Use current variables in memory - don't reload to preserve dependency information
    // Variables should already be loaded when the application starts
    
    const operatorsToExecute = [];
    const changedOperators = new Set();
    
    // First, check if any operator has dependencies that have changed
    for (const operator of operators) {
      const outputVars = getOperatorOutputVariables(operator);
      
      for (const varName of outputVars) {
        const variable = variablesManager.variables.get(varName);
        if (variable && variable.dependencies && variable.dependencies.length > 0) {
          const operatorKey = `${operator.id}-${varName}`;
          
          // Get current dependency values
          const currentDependencyValues = {};
          for (const depName of variable.dependencies) {
            const depVariable = variablesManager.variables.get(depName);
            currentDependencyValues[depName] = depVariable ? depVariable.value : null;
          }
          
          // Compare with previous values
          const previousValues = previousDependencyValues.get(operatorKey) || {};
          const hasChanged = variable.dependencies.some(depName => 
            previousValues[depName] !== currentDependencyValues[depName]
          );
          
          if (hasChanged || !previousDependencyValues.has(operatorKey)) {
            console.log(`[${windowId}] Operator "${operator.name}" needs re-execution due to changed dependencies`);
            changedOperators.add(operator.id);
            
            // Update stored values
            previousDependencyValues.set(operatorKey, currentDependencyValues);
          }
        } else {
          // Operator has no dependencies, check if it was executed before
          const operatorKey = `${operator.id}-${varName}`;
          if (!previousDependencyValues.has(operatorKey)) {
            console.log(`[${windowId}] Operator "${operator.name}" needs initial execution`);
            changedOperators.add(operator.id);
            previousDependencyValues.set(operatorKey, {});
          }
        }
      }
    }
    
    // If any operator needs re-execution, we need to identify all dependent operators
    if (changedOperators.size > 0) {
      const dependentOperators = await findDependentOperators(operators, changedOperators);
      operatorsToExecute.push(...dependentOperators);
    }
    
    return operatorsToExecute;
    
  } catch (error) {
    console.error(`[${windowId}] Error identifying operators with changed dependencies:`, error);
    return operators; // Fall back to executing all operators
  }
}

/**
 * Find all operators that depend on the changed operators (recursive dependency resolution)
 */
async function findDependentOperators(allOperators, changedOperatorIds) {
  try {
    const { variablesManager } = await import('./variables.js');
    
    if (!variablesManager) {
      return allOperators.filter(op => changedOperatorIds.has(op.id));
    }
    
    // Get all variables and their dependencies
    const affectedVariables = new Set();
    const operatorToVariables = new Map();
    
    // Map operators to their output variables
    for (const operator of allOperators) {
      const outputVars = getOperatorOutputVariables(operator);
      operatorToVariables.set(operator.id, outputVars);
      
      // If this operator changed, mark its output variables as affected
      if (changedOperatorIds.has(operator.id)) {
        outputVars.forEach(varName => affectedVariables.add(varName));
      }
    }
    
    // Find all variables that depend on affected variables (recursive)
    const findDependentVariables = (varName) => {
      const dependents = variablesManager.findDependentVariables(varName);
      for (const dependent of dependents) {
        if (!affectedVariables.has(dependent)) {
          affectedVariables.add(dependent);
          findDependentVariables(dependent); // Recursive call
        }
      }
    };
    
    // Find all dependent variables
    for (const varName of affectedVariables) {
      findDependentVariables(varName);
    }
    
    // Find operators that output affected variables
    const operatorsToExecute = [];
    for (const operator of allOperators) {
      const outputVars = getOperatorOutputVariables(operator);
      const hasAffectedOutput = outputVars.some(varName => affectedVariables.has(varName));
      
      if (hasAffectedOutput) {
        operatorsToExecute.push(operator);
      }
    }
    
    return operatorsToExecute;
    
  } catch (error) {
    console.error(`[${windowId}] Error finding dependent operators:`, error);
    return allOperators.filter(op => changedOperatorIds.has(op.id));
  }
}

/**
 * Execute operators with cascading dependency updates
 * This ensures that when an operator executes and updates variables,
 * all operators that depend on those variables are also re-executed
 */
async function executeOperatorsWithCascadingUpdates(initialOperators) {
  const results = [];
  const executedOperators = [];
  let totalOperatorsExecuted = 0;
  
  // Set flag to prevent template auto-refresh loop
  operatorsData.isExecutingForTemplate = true;
  
  try {
    // Show progress message
    if (window.showOperatorExecutionIndicator) {
      window.showOperatorExecutionIndicator(`Starting cascading execution...`);
    }
    
    // Initialize execution queue with operators that have changed dependencies
    const executionQueue = [];
    const operatorExecutionCount = new Map(); // Track how many times each operator has been executed
    const maxExecutionsPerOperator = 10; // Prevent infinite loops
    
    // Find initially changed operators
    const initialChangedOperators = await identifyOperatorsWithChangedDependencies(initialOperators);
    
    if (initialChangedOperators.length === 0) {
      console.log(`[${windowId}] No operators need re-execution - all dependencies unchanged`);
      return { executedOperators: [], results: [], skippedDueToNoChanges: true };
    }
    
    // Add initial operators to queue in dependency order
    const orderedInitialOperators = await getOperatorsInDependencyOrder(initialChangedOperators);
    executionQueue.push(...orderedInitialOperators);
    
    // Process execution queue with cascading updates
    while (executionQueue.length > 0) {
      const operator = executionQueue.shift();
      
      console.log(`[${windowId}] Processing operator "${operator.name}" from queue. Queue size: ${executionQueue.length}`);
      
      // Check if this operator has been executed too many times (infinite loop protection)
      const executionCount = operatorExecutionCount.get(operator.id) || 0;
      if (executionCount >= maxExecutionsPerOperator) {
        console.log(`[${windowId}] Skipping operator "${operator.name}" - maximum executions reached (${maxExecutionsPerOperator})`);
        continue;
      }
      
      try {
        totalOperatorsExecuted++;
        
        // Update progress indicator
        if (window.updateOperatorExecutionProgress) {
          window.updateOperatorExecutionProgress(
            `Executing operator ${totalOperatorsExecuted} (cascading): ${operator.name}`, 
            operator.name, 
            null
          );
        }
        
        // Store pre-execution variable values to detect changes
        const preExecutionValues = await captureVariableValues(operator);
        
        // Execute the operator
        const substitutedOperator = await substituteOperatorDependencies(operator);
        const result = await operatorManager.executeInstance(substitutedOperator.id);
        
        // Store execution result
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: true,
          result: result
        });
        
        executedOperators.push(operator.name);
        operatorExecutionCount.set(operator.id, executionCount + 1);
        
        // Update progress indicator for completion
        if (window.updateOperatorExecutionProgress) {
          window.updateOperatorExecutionProgress(`Completed: ${operator.name}`, operator.name, null);
        }
        
        // Check if this operator's execution caused other variables to change
        // Note: We don't need to reload variables here because the operator execution
        // already properly updates them via setVariableValue()
        const postExecutionValues = await captureVariableValues(operator);
        const changedVariables = detectChangedVariables(preExecutionValues, postExecutionValues);
        
        // Update dependency cache with new values
        await updateDependencyCacheForOperator(operator, postExecutionValues);
        
        if (changedVariables.length > 0) {
          console.log(`[${windowId}] Operator "${operator.name}" changed variables: ${changedVariables.join(', ')}`);
          
          // Find operators that depend on the newly changed variables (search ALL operators, not just initial ones)
          const allOperators = operatorManager.getCurrentDocumentInstances();
          console.log(`[${windowId}] Searching ${allOperators.length} total operators for dependencies on changed variables`);
          
          const dependentOperators = await findOperatorsDependingOnVariables(allOperators, changedVariables);
          console.log(`[${windowId}] Found ${dependentOperators.length} dependent operators: ${dependentOperators.map(op => op.name).join(', ')}`);
          
          // Add dependent operators to queue (if not already in queue)
          for (const depOperator of dependentOperators) {
            if (!executionQueue.find(op => op.id === depOperator.id)) {
              console.log(`[${windowId}] Adding dependent operator "${depOperator.name}" to execution queue`);
              executionQueue.push(depOperator);
            } else {
              console.log(`[${windowId}] Skipping operator "${depOperator.name}" - already in queue`);
            }
          }
        } else {
          console.log(`[${windowId}] Operator "${operator.name}" did not change any variables`);
        }
        
      } catch (error) {
        console.error(`[${windowId}] ❌ Error executing operator "${operator.name}":`, error);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: false,
          error: error.message
        });
        
        operatorExecutionCount.set(operator.id, executionCount + 1);
        
        // Update progress indicator for error
        if (window.updateOperatorExecutionProgress) {
          window.updateOperatorExecutionProgress(`Failed: ${operator.name}`, operator.name, null);
        }
      }
    }
    
    console.log(`[${windowId}] Cascading execution completed. Total operators executed: ${totalOperatorsExecuted}`);
    
  } finally {
    // Always clear flag after execution is complete
    operatorsData.isExecutingForTemplate = false;
    
    // Hide the floating indicator
    if (window.hideOperatorExecutionIndicator) {
      window.hideOperatorExecutionIndicator();
    }
  }
  
  return { executedOperators, results };
}

/**
 * Capture variable values before operator execution
 * Now captures ALL variables to detect any changes, not just operator outputs
 */
async function captureVariableValues(operator) {
  try {
    const { variablesManager } = await import('./variables.js');
    if (!variablesManager) return {};
    
    // Don't reload variables here - use the current state in memory
    // Loading variables would clear the in-memory state and potentially lose dependency info
    const values = {};
    
    // Capture ALL variables in the system to detect any changes
    variablesManager.variables.forEach((variable, varName) => {
      values[varName] = variable ? variable.value : null;
    });
    
    return values;
  } catch (error) {
    console.error(`[${windowId}] Error capturing variable values:`, error);
    return {};
  }
}

/**
 * Detect which variables changed after operator execution
 */
function detectChangedVariables(preValues, postValues) {
  const changedVariables = [];
  
  console.log(`[${windowId}] Comparing pre-execution values:`, preValues);
  console.log(`[${windowId}] Comparing post-execution values:`, postValues);
  
  for (const [varName, preValue] of Object.entries(preValues)) {
    const postValue = postValues[varName];
    const preStr = JSON.stringify(preValue);
    const postStr = JSON.stringify(postValue);
    
    if (preStr !== postStr) {
      console.log(`[${windowId}] Variable "${varName}" changed from ${preStr} to ${postStr}`);
      changedVariables.push(varName);
    }
  }
  
  // Check for new variables that weren't in preValues
  for (const [varName, postValue] of Object.entries(postValues)) {
    if (!(varName in preValues)) {
      console.log(`[${windowId}] New variable "${varName}" appeared with value ${JSON.stringify(postValue)}`);
      changedVariables.push(varName);
    }
  }
  
  return changedVariables;
}

/**
 * Find operators that depend on specific variables
 */
async function findOperatorsDependingOnVariables(allOperators, changedVariables) {
  try {
    const { variablesManager } = await import('./variables.js');
    if (!variablesManager) return [];
    
    // Don't reload variables here - use the current state in memory
    // Loading variables would clear dependency information that we need to preserve
    const dependentOperators = [];
    
    console.log(`[${windowId}] Looking for operators that depend on changed variables: ${changedVariables.join(', ')}`);
    
    for (const operator of allOperators) {
      const outputVars = getOperatorOutputVariables(operator);
      
      for (const varName of outputVars) {
        const variable = variablesManager.variables.get(varName);
        if (variable && variable.dependencies) {
          console.log(`[${windowId}] Checking operator "${operator.name}" output variable "${varName}" with dependencies: ${variable.dependencies.join(', ')}`);
          
          // Check if this operator depends on any of the changed variables
          const dependsOnChanged = variable.dependencies.some(dep => changedVariables.includes(dep));
          if (dependsOnChanged) {
            console.log(`[${windowId}] ✓ Operator "${operator.name}" depends on changed variables`);
            dependentOperators.push(operator);
            break; // Don't add the same operator multiple times
          }
        } else {
          console.log(`[${windowId}] Operator "${operator.name}" output variable "${varName}" has no dependencies`);
        }
      }
    }
    
    return dependentOperators;
  } catch (error) {
    console.error(`[${windowId}] Error finding dependent operators:`, error);
    return [];
  }
}

/**
 * Update dependency cache for an operator after execution
 */
async function updateDependencyCacheForOperator(operator, newValues) {
  try {
    const { variablesManager } = await import('./variables.js');
    if (!variablesManager) return;
    
    // Don't reload variables here - use the current state in memory
    // Loading variables would clear dependency information that we need to preserve
    const outputVars = getOperatorOutputVariables(operator);
    
    for (const varName of outputVars) {
      const variable = variablesManager.variables.get(varName);
      if (variable && variable.dependencies && variable.dependencies.length > 0) {
        const operatorKey = `${operator.id}-${varName}`;
        
        // Get current dependency values
        const currentDependencyValues = {};
        for (const depName of variable.dependencies) {
          const depVariable = variablesManager.variables.get(depName);
          currentDependencyValues[depName] = depVariable ? depVariable.value : null;
        }
        
        // Update the cache with current dependency values
        previousDependencyValues.set(operatorKey, currentDependencyValues);
        
        console.log(`[${windowId}] Updated dependency cache for operator "${operator.name}" variable "${varName}"`);
      }
    }
  } catch (error) {
    console.error(`[${windowId}] Error updating dependency cache:`, error);
  }
}

/**
 * Execute operators in proper dependency order (topological sort)
 */
async function executeOperatorsInDependencyOrder(operators) {
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  // Set flag to prevent template auto-refresh loop
  operatorsData.isExecutingForTemplate = true;
  
  try {
    // Show progress message
    if (window.showOperatorExecutionIndicator) {
      window.showOperatorExecutionIndicator(`Starting execution of ${operators.length} operators...`);
    }
    
    // Execute operators in dependency order
    const orderedOperators = await getOperatorsInDependencyOrder(operators);
    
    for (let i = 0; i < orderedOperators.length; i++) {
      const operator = orderedOperators[i];
      try {
        // Update progress indicator for individual operator
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Executing operator ${i + 1} of ${orderedOperators.length}`, operator.name, progress);
        }
        
        // Set up timeout for slow operations
        const slowOperationMessage = setTimeout(() => {
          if (window.updateOperatorExecutionProgress) {
            window.updateOperatorExecutionProgress(`Still processing: ${operator.name} (this may take a moment for data downloads)`, operator.name);
          }
        }, 5000);
        
        // Substitute dependency values in operator parameters before execution
        const substitutedOperator = await substituteOperatorDependencies(operator);
        
        const result = await operatorManager.executeInstance(substitutedOperator.id);
        
        // Clear the slow operation timeout
        clearTimeout(slowOperationMessage);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: true,
          result: result
        });
        
        successCount++;
        
        // Update progress indicator for completion
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Completed: ${operator.name}`, operator.name, progress);
        }
        
      } catch (error) {
        console.error(`[${windowId}] ❌ Error executing operator "${operator.name}":`, error);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: false,
          error: error.message
        });
        
        errorCount++;
        
        // Update progress indicator for error
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Failed: ${operator.name}`, operator.name, progress);
        }
      }
    }
    
  } finally {
    // Always clear flag after execution is complete
    operatorsData.isExecutingForTemplate = false;
    
    // Hide the floating indicator
    if (window.hideOperatorExecutionIndicator) {
      window.hideOperatorExecutionIndicator();
    }
  }
  
  return results;
}

async function executeOperatorsSequence(operators) {
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  // Set flag to prevent template auto-refresh loop
  operatorsData.isExecutingForTemplate = true;
  
  try {
    // Show progress message
    // Show the floating indicator at the start
    if (window.showOperatorExecutionIndicator) {
      window.showOperatorExecutionIndicator(`Starting execution of ${operators.length} operators...`);
    } else {
      console.log(`[${windowId}] ❌ showOperatorExecutionIndicator function NOT found`);
    }
    
    // Execute operators in dependency order
    const orderedOperators = await getOperatorsInDependencyOrder(operators);
    
    for (let i = 0; i < orderedOperators.length; i++) {
      const operator = orderedOperators[i];
      try {
        // Update progress indicator for individual operator
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Executing operator ${i + 1} of ${orderedOperators.length}`, operator.name, progress);
        }        
        // Set up timeout for slow operations
        let slowOperationTimeout;
        const slowOperationMessage = setTimeout(() => {
          if (window.updateOperatorExecutionProgress) {
            window.updateOperatorExecutionProgress(`Still processing: ${operator.name} (this may take a moment for data downloads)`, operator.name);
          }
        }, 5000); // Show message after 5 seconds
        
        // Substitute dependency values in operator parameters before execution
        const substitutedOperator = await substituteOperatorDependencies(operator);
        
        const result = await operatorManager.executeInstance(substitutedOperator.id);
        
        // Clear the slow operation timeout
        clearTimeout(slowOperationMessage);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: true,
          result: result
        });
        
        successCount++;
        
        // Update progress indicator for completion
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Completed: ${operator.name}`, operator.name, progress);
        }
        
      } catch (error) {
        console.error(`[${windowId}] ❌ Error executing operator "${operator.name}":`, error);
        
        results.push({
          operatorId: operator.id,
          operatorName: operator.name,
          success: false,
          error: error.message
        });
        
        errorCount++;        
        // Update progress indicator for error
        if (window.updateOperatorExecutionProgress) {
          const progress = ((i + 1) / orderedOperators.length) * 100;
          window.updateOperatorExecutionProgress(`Failed: ${operator.name}`, operator.name, progress);
        }
      }
    }
    
  } finally {
    // Always clear flag after execution is complete, even if there were errors
    operatorsData.isExecutingForTemplate = false;
    
    // Hide the floating indicator at the end
    if (window.hideOperatorExecutionIndicator) {
      window.hideOperatorExecutionIndicator();
    }
  }
  
  return results;
}

/**
 * Order operators based on variable dependencies
 */
async function getOperatorsInDependencyOrder(operators) {
  try {
    // Load variables manager to get dependency information
    const { variablesManager } = await import('./variables.js');
    
    if (!variablesManager) {
      console.warn('Variables manager not available, executing operators in original order');
      return operators;
    }
    
    // Use current variables in memory - don't reload to preserve dependency information
    
    // Create a map of variable to operator for easy lookup
    const variableToOperator = new Map();
    
    // Map each operator to its output variables
    operators.forEach(operator => {
      const outputVars = getOperatorOutputVariables(operator);
      outputVars.forEach(varName => {
        variableToOperator.set(varName, operator);
      });
    });
    
    // Get variables in dependency order from variables manager
    const orderedVariableNames = variablesManager.getVariablesInDependencyOrder();
    
    // Create ordered operators list based on variable dependencies
    const orderedOperators = [];
    const processedOperators = new Set();
    
    // Add operators in dependency order
    for (const varName of orderedVariableNames) {
      const operator = variableToOperator.get(varName);
      if (operator && !processedOperators.has(operator.id)) {
        orderedOperators.push(operator);
        processedOperators.add(operator.id);
      }
    }
    
    // Add any remaining operators that weren't mapped to variables
    operators.forEach(operator => {
      if (!processedOperators.has(operator.id)) {
        orderedOperators.push(operator);
      }
    });
    
    return orderedOperators;
    
  } catch (error) {
    console.error('Error ordering operators by dependencies:', error);
    console.warn('Falling back to original order');
    return operators;
  }
}

/**
 * Prepare operator for execution with dependency values
 */
async function substituteOperatorDependencies(operator) {
  try {
    // Load variables manager to get variable values
    const { variablesManager } = await import('./variables.js');
    
    if (!variablesManager) {
      console.warn('Variables manager not available for dependency substitution');
      return operator;
    }
    
    // Use current variables in memory - don't reload to preserve dependency information
    
    // Get the output variables for this operator
    const outputVars = getOperatorOutputVariables(operator);
    
    // For each output variable, check if it has dependencies
    for (const varName of outputVars) {
      const variable = variablesManager.variables.get(varName);
      if (variable && variable.dependencies && variable.dependencies.length > 0) {
        // Get the generated code for this operator (from parameters or stored code)
        let code = operator.parameters?.code || operator.code || '';
        
        // Extract function name from code
        const functionMatch = code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (functionMatch) {
          const functionName = functionMatch[1];
          
          // Prepare arguments for function call
          const args = [];
          for (const depName of variable.dependencies) {
            const depVariable = variablesManager.variables.get(depName);
            if (depVariable && depVariable.value !== undefined) {
              const depValue = depVariable.value;
              
              // Format the value based on type with proper JSON serialization
              if (typeof depValue === 'string') {
                args.push(`'${depValue.replace(/'/g, "\\'")}'`);
              } else if (typeof depValue === 'number') {
                args.push(depValue.toString());
              } else if (typeof depValue === 'boolean') {
                args.push(depValue.toString());
              } else if (depValue === null) {
                args.push('None');
              } else if (typeof depValue === 'object') {
                // For objects (dicts, lists, etc.), serialize as JSON
                try {
                  const jsonValue = JSON.stringify(depValue);
                  args.push(`json.loads('${jsonValue.replace(/'/g, "\\'")}')`);
                } catch (error) {
                  console.error(`[${windowId}] Failed to serialize ${depName}:`, error);
                  args.push('None');
                }
              } else {
                // Fallback for other types
                args.push(`'${String(depValue).replace(/'/g, "\\'")}'`);
              }
            } else {
              args.push('None');
              console.warn(`[${windowId}] Dependency ${depName} not found or has no value`);
            }
          }
          
          // Check if function expects data_source parameter
          const functionSignature = code.match(new RegExp(`def\\s+${functionName}\\s*\\(([^)]+)\\)`))?.[1] || '';
          const hasDataSourceParam = functionSignature.includes('data_source');
          
          // Build function call with proper arguments
          let functionCall;
          if (hasDataSourceParam && operator.parameters?.data_source) {
            functionCall = `${functionName}(${args.join(', ')}, parameters['data_source'])`;
          } else {
            functionCall = `${functionName}(${args.join(', ')})`;
          }
          
          // Append function call to the code
          const executionCode = code + `\n\n# Execute function with dependency values\noutput = ${functionCall}`;
          
          // Update the operator with execution code
          if (operator.parameters) {
            operator.parameters.code = executionCode;
          }
        }
      }
    }
    
    return operator;
    
  } catch (error) {
    console.error('Error preparing operator dependencies:', error);
    return operator;
  }
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
      const currentDocumentId = window.documentManager?.activeDocumentId;
      
      if (!currentDocumentId) {
        console.warn(`[${windowId}] Cannot load tools from API: no current document set`);
        return;
      }
      
      const response = await fetch(`http://127.0.0.1:5000/api/tools?documentId=${currentDocumentId}&windowId=${windowId}`);
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
  // Get the active document container
  const container = getActiveDocumentContainer();
  if (!container) {
    console.error(`[${windowId}] No active document container found for tools sidebar event listeners`);
    return;
  }
  
  // Clean up existing tools sidebar listeners first
  cleanupToolsSidebarEventListeners();
  
  // Create event handlers
  operatorsEventData.toolsSearchHandler = (e) => {
    filterOperatorsTools(e.target.value);
  };
  
  operatorsEventData.addToolBtnSidebarHandler = () => {
    showToolEditor();
  };
  
  operatorsEventData.toolsSidebarClickHandler = (e) => {
    // Log clicks for debugging
    if (e.target.classList.contains('sidebar-tool-delete-btn') ||
        e.target.closest('.operators-sidebar-tool-item')) {
    }
    
    // Delete tool button
    if (e.target.classList.contains('sidebar-tool-delete-btn')) {
      e.stopPropagation(); // Prevent triggering tool selection
      const toolId = e.target.getAttribute('data-tool-id');
      if (window.toolsManager) {
        window.toolsManager.removeTool(toolId);
        // Refresh the tools list UI immediately after deletion
        refreshOperatorsToolsList();
        addMessageToUI('system', '🗑️ Tool deleted successfully');
      }
      return;
    }
    
    // Tool selection in sidebar - show tool editor
    const toolItem = e.target.closest('.operators-sidebar-tool-item');
    if (toolItem && !e.target.classList.contains('sidebar-tool-delete-btn')) {
      const toolId = toolItem.dataset.toolId;
      showToolEditor(toolId);
    }
  };
  
  // Find and attach to specific elements
  const toolsSearch = container.querySelector(`#${createDocumentElementId('operators-tools-search')}`);
  const addToolBtnSidebar = container.querySelector('.add-tool-btn-sidebar');
  const toolsContainer = container.querySelector(`#${createDocumentElementId('operators-tools-items')}`);
  
  // Attach event listeners to found elements
  if (toolsSearch) {
    toolsSearch.addEventListener('input', operatorsEventData.toolsSearchHandler);
    operatorsEventData.currentElements.toolsSearch = toolsSearch;
  }
  
  if (addToolBtnSidebar) {
    addToolBtnSidebar.addEventListener('click', operatorsEventData.addToolBtnSidebarHandler);
    operatorsEventData.currentElements.addToolBtnSidebar = addToolBtnSidebar;
  }
  
  // Attach click delegation to tools container for dynamic tool items
  if (toolsContainer) {
    toolsContainer.addEventListener('click', operatorsEventData.toolsSidebarClickHandler);
    operatorsEventData.currentElements.toolsContainer = toolsContainer;
  }
  
}

// Cleanup function for tools sidebar event listeners
function cleanupToolsSidebarEventListeners() {
  
  // Remove listeners from tracked tools sidebar elements
  if (operatorsEventData.currentElements.toolsSearch && operatorsEventData.toolsSearchHandler) {
    operatorsEventData.currentElements.toolsSearch.removeEventListener('input', operatorsEventData.toolsSearchHandler);
  }
  
  if (operatorsEventData.currentElements.addToolBtnSidebar && operatorsEventData.addToolBtnSidebarHandler) {
    operatorsEventData.currentElements.addToolBtnSidebar.removeEventListener('click', operatorsEventData.addToolBtnSidebarHandler);
  }
  
  if (operatorsEventData.currentElements.toolsContainer && operatorsEventData.toolsSidebarClickHandler) {
    operatorsEventData.currentElements.toolsContainer.removeEventListener('click', operatorsEventData.toolsSidebarClickHandler);
  }
  
  // Clear handler references
  operatorsEventData.toolsSearchHandler = null;
  operatorsEventData.addToolBtnSidebarHandler = null;
  operatorsEventData.toolsSidebarClickHandler = null;
  
  // Clear tools sidebar element references
  operatorsEventData.currentElements.toolsSearch = null;
  operatorsEventData.currentElements.addToolBtnSidebar = null;
  operatorsEventData.currentElements.toolsContainer = null;
  
  
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
  hideOperatorLoadingIndicator,
  getOperatorForVariable: (variableName) => operatorManager?.getInstanceByOutputVariable(variableName),
  clearDependencyCache
}; 