/**
 * Variable Dependency Execution System
 * Handles proper dependency graph execution for variables
 */

class VariableDependencyExecutor {
  constructor() {
    this.variables = new Map(); // variable_name -> variable_info
    this.executionResults = new Map(); // variable_name -> execution_result
    this.executionMetadata = new Map(); // variable_name -> {lastExecuted, codeHash, valueOption}
    this.dependencyGraph = new Map(); // variable_name -> [dependent_variables]
    this.reverseDependencyGraph = new Map(); // variable_name -> [dependency_variables]
    this.isInitialized = false; // Track if we've loaded variables initially
  }

  /**
   * Show floating execution indicator for dependency graph processing
   */
  showDependencyExecutionIndicator() {
    let indicator = document.getElementById('dependency-execution-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'dependency-execution-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 320px;
        max-width: 450px;
        animation: slideInRight 0.3s ease-out;
      `;
      
      // Add keyframe animation if not already present
      if (!document.querySelector('#dependency-indicator-styles')) {
        const style = document.createElement('style');
        style.id = 'dependency-indicator-styles';
        style.textContent = `
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideOutRight {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .dependency-spinner {
            animation: spin 1s linear infinite;
          }
          
          .dependency-progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 8px;
          }
          
          .dependency-progress-fill {
            height: 100%;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 2px;
            transition: width 0.3s ease;
            width: 0%;
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(indicator);
    }
    
    indicator.innerHTML = `
      <div class="dependency-spinner" style="
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        flex-shrink: 0;
      "></div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">Executing Variables</div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;" id="dependency-current-variable">Processing dependency graph...</div>
        <div class="dependency-progress-bar">
          <div class="dependency-progress-fill" id="dependency-progress-fill" style="width: 0%;"></div>
        </div>
      </div>
    `;
    
    indicator.style.display = 'flex';
  }

  /**
   * Hide floating execution indicator
   */
  hideDependencyExecutionIndicator() {
    const indicator = document.getElementById('dependency-execution-indicator');
    if (indicator) {
      indicator.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => {
        if (indicator && indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }
  }

  /**
   * Update execution progress
   */
  updateDependencyExecutionProgress(variableName, currentIndex, totalCount) {
    const indicator = document.getElementById('dependency-execution-indicator');
    if (indicator) {
      const messageDiv = indicator.querySelector('#dependency-current-variable');
      const progressBar = indicator.querySelector('#dependency-progress-fill');
      
      if (messageDiv) {
        messageDiv.textContent = `Executing: ${variableName}`;
      }
      
      if (progressBar && totalCount > 0) {
        const progress = ((currentIndex + 1) / totalCount) * 100;
        progressBar.style.width = `${progress}%`;
      }
    }
  }

  /**
   * Show completion state
   */
  showDependencyExecutionComplete(executedCount, message = null) {
    const indicator = document.getElementById('dependency-execution-indicator');
    if (indicator) {
      // Change color to green for completion
      indicator.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
      
      // Use custom message if provided, otherwise use default
      const completionMessage = message || `Successfully executed ${executedCount} variable${executedCount !== 1 ? 's' : ''}`;
      
      indicator.innerHTML = `
        <div style="
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4CAF50;
          font-weight: bold;
          flex-shrink: 0;
        ">✓</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">Execution Complete</div>
          <div style="font-size: 12px; opacity: 0.9;">${completionMessage}</div>
        </div>
      `;
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        this.hideDependencyExecutionIndicator();
      }, 3000);
    }
  }

  /**
   * Show simple completion notification using floating window
   */
  showSimpleCompletionNotification(message) {
    // Create or reuse the execution indicator for completion notifications
    let indicator = document.getElementById('dependency-execution-indicator');
    
    if (!indicator) {
      // Create indicator if it doesn't exist
      this.showDependencyExecutionIndicator();
      indicator = document.getElementById('dependency-execution-indicator');
    }
    
    if (indicator) {
      // Change to completion state immediately
      indicator.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
      
      indicator.innerHTML = `
        <div style="
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4CAF50;
          font-weight: bold;
          flex-shrink: 0;
        ">✓</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">Execution Complete</div>
          <div style="font-size: 12px; opacity: 0.9;">${message}</div>
        </div>
      `;
      
      indicator.style.display = 'flex';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        this.hideDependencyExecutionIndicator();
      }, 3000);
    }
  }

  /**
   * Add or update a variable in the system
   */
  async addVariable(variableName, variableInfo, isInitialLoad = false) {
    const existing = this.variables.get(variableName);
    
    console.log(`🔍 addVariable called for ${variableName}:`, {
      isInitialLoad: isInitialLoad,
      hasExisting: !!existing,
      existingValue: existing?.value,
      newValue: variableInfo.value,
      existingValueOption: existing?.valueOption,
      newValueOption: variableInfo.valueOption
    });
    
    // Skip change detection during initial load
    if (isInitialLoad) {
      console.log(`📥 Initial load of variable ${variableName}, skipping change detection`);
      this.variables.set(variableName, variableInfo);
    } else {
      console.log(`🔍 Checking for changes in ${variableName}...`);
      // Check if this is an update that requires invalidation
      if (existing && this.hasVariableChanged(existing, variableInfo)) {
        console.log(`🔄 Variable ${variableName} changed, invalidating dependents`);
        
        // Update the variable AFTER change detection but BEFORE invalidation
        this.variables.set(variableName, variableInfo);
        
        this.invalidateDependents(variableName);
        
        // Automatically re-execute invalidated dependents
        try {
          const reexecutedResults = await this.executeInvalidatedVariables();
          if (Object.keys(reexecutedResults).length > 0) {
            const dependentNames = Object.keys(reexecutedResults);
            console.log(`🎯 Auto re-executed dependent variables due to ${variableName} change:`, dependentNames);
            
            // Show user notification about automatic re-execution
            this.showDependencyUpdateNotification(variableName, dependentNames);
          }
        } catch (error) {
          console.error(`❌ Error auto re-executing dependents of ${variableName}:`, error);
          // Don't throw the error - just log it, as the variable save should still succeed
        }
      } else if (existing) {
        console.log(`ℹ️ Variable ${variableName} unchanged - no cascading execution needed`);
        this.variables.set(variableName, variableInfo);
      } else {
        console.log(`✨ New variable ${variableName} added - no dependents to update yet`);
        this.variables.set(variableName, variableInfo);
      }
    }
    
    this.buildDependencyGraph();
  }

  /**
   * Check if a variable has changed in a way that requires re-execution
   */
  hasVariableChanged(oldVariable, newVariable) {
    console.log(`🔍 Checking if variable changed:`, {
      name: newVariable.name || 'unknown',
      oldValueOption: oldVariable.valueOption,
      newValueOption: newVariable.valueOption,
      oldValue: oldVariable.value,
      newValue: newVariable.value,
      oldValueType: typeof oldVariable.value,
      newValueType: typeof newVariable.value,
      valuesEqual: oldVariable.value === newVariable.value,
      oldCode: oldVariable.generatedCode,
      newCode: newVariable.generatedCode
    });
    
    // Check if value option changed
    if (oldVariable.valueOption !== newVariable.valueOption) {
      console.log(`✅ Variable changed: value option changed from ${oldVariable.valueOption} to ${newVariable.valueOption}`);
      return true;
    }
    
    // For manual variables, check if value changed
    if (newVariable.valueOption === 'manual') {
      const valueChanged = oldVariable.value !== newVariable.value;
      console.log(`🔍 Manual variable comparison: "${oldVariable.value}" !== "${newVariable.value}" = ${valueChanged}`);
      if (valueChanged) {
        console.log(`✅ Variable changed: manual value changed from "${oldVariable.value}" to "${newVariable.value}"`);
        return true;
      }
    }
    
    // For code variables, check if code changed
    if (newVariable.valueOption === 'code') {
      const codeChanged = oldVariable.generatedCode !== newVariable.generatedCode;
      if (codeChanged) {
        console.log(`✅ Variable changed: generated code changed`);
        return true;
      }
    }
    
    // Check if dependencies changed
    const oldDeps = (oldVariable.dependencies || []).sort().join(',');
    const newDeps = (newVariable.dependencies || []).sort().join(',');
    const depsChanged = oldDeps !== newDeps;
    if (depsChanged) {
      console.log(`✅ Variable changed: dependencies changed from [${oldDeps}] to [${newDeps}]`);
      return true;
    }
    
    console.log(`❌ No changes detected - this is the problem!`);
    return false;
  }

  /**
   * Remove a variable from the system
   */
  removeVariable(variableName) {
    this.variables.delete(variableName);
    this.executionResults.delete(variableName);
    this.executionMetadata.delete(variableName);
    this.buildDependencyGraph();
    this.invalidateDependents(variableName);
  }

  /**
   * Build dependency graph from variable dependencies
   */
  buildDependencyGraph() {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    // Initialize graphs
    for (const [varName] of this.variables) {
      this.dependencyGraph.set(varName, []);
      this.reverseDependencyGraph.set(varName, []);
    }

    // Build dependency relationships
    for (const [varName, varInfo] of this.variables) {
      const dependencies = varInfo.dependencies || [];
      
      // Set reverse dependencies (what this variable depends on)
      this.reverseDependencyGraph.set(varName, dependencies);

      // Set forward dependencies (what depends on this variable)
      for (const depName of dependencies) {
        if (!this.dependencyGraph.has(depName)) {
          this.dependencyGraph.set(depName, []);
        }
        this.dependencyGraph.get(depName).push(varName);
      }
    }

    console.log('🔗 Built dependency graph:', {
      forward: Object.fromEntries(this.dependencyGraph),
      reverse: Object.fromEntries(this.reverseDependencyGraph)
    });
  }

  /**
   * Get topological execution order for variables
   */
  getExecutionOrder(variableNames = null) {
    const varsToExecute = variableNames || Array.from(this.variables.keys());
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (varName) => {
      if (visiting.has(varName)) {
        throw new Error(`Circular dependency detected involving variable: ${varName}`);
      }
      if (visited.has(varName)) {
        return;
      }

      visiting.add(varName);

      // Visit dependencies first
      const dependencies = this.reverseDependencyGraph.get(varName) || [];
      for (const depName of dependencies) {
        if (this.variables.has(depName)) {
          visit(depName);
        }
      }

      visiting.delete(varName);
      visited.add(varName);
      order.push(varName);
    };

    for (const varName of varsToExecute) {
      if (this.variables.has(varName)) {
        visit(varName);
      }
    }

    console.log('📋 Execution order:', order);
    return order;
  }

  /**
   * Execute a single variable with dependency values
   */
  async executeVariable(variableName, forceReexecute = false) {
    const variable = this.variables.get(variableName);
    if (!variable) {
      throw new Error(`Variable ${variableName} not found`);
    }

    // Check if we can skip execution
    if (!forceReexecute && this.canSkipExecution(variableName, variable)) {
      const cachedResult = this.executionResults.get(variableName);
      console.log(`⚡ Skipping execution for ${variableName}, using cached result:`, cachedResult);
      return cachedResult;
    }

    console.log(`🔄 Executing variable: ${variableName}`);

    try {
      let result;

      if (variable.valueOption === 'manual') {
        // Manual value - use stored value directly, no execution needed
        result = variable.value;
        console.log(`📝 Using manual value for ${variableName}:`, result);
      } else if (variable.valueOption === 'code') {
        // Code generation - execute with dependency values
        result = await this.executeVariableCode(variableName, variable);
      } else {
        throw new Error(`Unknown value option: ${variable.valueOption}`);
      }

      // Store execution result and metadata
      this.executionResults.set(variableName, result);
      this.executionMetadata.set(variableName, {
        lastExecuted: Date.now(),
        codeHash: this.hashCode(variable.generatedCode || ''),
        valueOption: variable.valueOption,
        value: variable.value
      });

      console.log(`✅ Variable ${variableName} executed successfully:`, result);
      return result;

    } catch (error) {
      console.error(`❌ Error executing variable ${variableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if we can skip execution for a variable
   */
  canSkipExecution(variableName, variable) {
    const metadata = this.executionMetadata.get(variableName);
    const cachedResult = this.executionResults.get(variableName);
    
    // No cached result or metadata - must execute
    if (!metadata || cachedResult === undefined) {
      return false;
    }

    // For manual variables, check if value changed
    if (variable.valueOption === 'manual') {
      return metadata.value === variable.value;
    }

    // For code variables, check if code changed
    if (variable.valueOption === 'code') {
      const currentCodeHash = this.hashCode(variable.generatedCode || '');
      return metadata.codeHash === currentCodeHash;
    }

    return false;
  }

  /**
   * Simple hash function for code comparison
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Execute variable code with dependency values
   */
  async executeVariableCode(variableName, variable) {
    const dependencies = variable.dependencies || [];
    const dependencyValues = {};

    // Get dependency values from execution results
    for (const depName of dependencies) {
      const depResult = this.executionResults.get(depName);
      if (depResult === undefined) {
        throw new Error(`Dependency ${depName} for variable ${variableName} has not been executed`);
      }
      dependencyValues[depName] = depResult;
    }

    console.log(`🔧 Executing code for ${variableName} with dependencies:`, Object.keys(dependencyValues));

    // Generate function call with actual dependency values
    const code = variable.generatedCode;
    if (!code) {
      throw new Error(`No generated code found for variable ${variableName}`);
    }

    // Execute code with dependency values as direct function parameters
    const executableCode = await this.generateExecutableCode(code, dependencyValues);
    
    // Execute via backend API
    const response = await fetch('http://127.0.0.1:5001/api/execute-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: executableCode,
        parameters: dependencyValues,
        document_id: window.documentManager?.activeDocumentId || 'default'
      })
    });

    if (response.ok) {
      const apiResult = await response.json();
      console.log('📋 Backend API response:', apiResult);
      
      if (apiResult.success && apiResult.output !== undefined && apiResult.output !== null) {
        return apiResult.output;
      } else {
        // Handle backend error properly
        let errorMessage = 'Code execution failed';
        
        if (apiResult.error) {
          if (typeof apiResult.error === 'object') {
            // Try to extract meaningful error information from error object
            if (apiResult.error.result && apiResult.error.result.error) {
              errorMessage += `: ${apiResult.error.result.error}`;
            } else {
              errorMessage += `: ${JSON.stringify(apiResult.error, null, 2)}`;
            }
          } else {
            errorMessage += `: ${apiResult.error}`;
          }
        } else {
          errorMessage += ': Unknown error';
        }
        
        console.error('❌ Backend execution error:', apiResult.error);
        throw new Error(errorMessage);
      }
    } else {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Generate executable code with proper dependency value injection
   */
  async generateExecutableCode(originalCode, dependencyValues) {
    // Find function definition
    const functionMatch = originalCode.match(/def\s+(\w+)\s*\([^)]*\):/);
    if (!functionMatch) {
      throw new Error('Could not find function definition in generated code');
    }

    const functionName = functionMatch[1];
    
    // Build function call with actual values
    const paramMatch = originalCode.match(new RegExp(`def\\s+${functionName}\\s*\\(([^)]*)\\):`));
    
    let functionCall = `${functionName}()`;
    let variableInjections = [];
    
    if (paramMatch && paramMatch[1].trim()) {
      const params = paramMatch[1].split(',').map(p => p.trim().split('=')[0].trim());
      const paramValues = params.map(param => {
        // Find matching dependency value
        for (const [depName, depValue] of Object.entries(dependencyValues)) {
          const paramNormalized = param.toLowerCase().replace(/[-_]/g, '');
          const depNormalized = depName.toLowerCase().replace(/[-_]/g, '');
          
          if (paramNormalized === depNormalized || paramNormalized.includes(depNormalized) || depNormalized.includes(paramNormalized)) {
            // Inject the dependency value as a variable in Python
            if (typeof depValue === 'string') {
              variableInjections.push(`${param} = ${JSON.stringify(depValue)}`);
            } else if (typeof depValue === 'object') {
              variableInjections.push(`${param} = ${JSON.stringify(depValue)}`);
            } else {
              variableInjections.push(`${param} = ${depValue}`);
            }
            return param; // Use the parameter name directly
          }
        }
        return 'None';  // Fallback
      });
      
      functionCall = `${functionName}(${paramValues.join(', ')})`;
    }

    // Create executable code with variable injections
    let executableCode = originalCode;
    
    if (variableInjections.length > 0) {
      executableCode += `\n\n# Inject dependency values as variables\n${variableInjections.join('\n')}`;
    }
    
    executableCode += `\n\n# Execute function with dependency values\nresult = ${functionCall}\nprint('Function result:', result)\nresult`;

    console.log('🔧 Generated executable code:', executableCode);
    return executableCode;
  }

  /**
   * Execute variables in dependency order
   */
  async executeVariables(variableNames = null, forceReexecute = false) {
    const executionOrder = this.getExecutionOrder(variableNames);
    const results = {};

    // Only show indicator if we have variables to execute
    if (executionOrder.length > 0) {
      this.showDependencyExecutionIndicator();
    }

    try {
      for (let i = 0; i < executionOrder.length; i++) {
        const varName = executionOrder[i];
        
        // Update progress
        this.updateDependencyExecutionProgress(varName, i, executionOrder.length);
        
        try {
          const result = await this.executeVariable(varName, forceReexecute);
          results[varName] = result;
        } catch (error) {
          console.error(`Failed to execute variable ${varName}:`, error);
          this.hideDependencyExecutionIndicator();
          throw error;
        }
      }

      console.log('🎯 All variables executed successfully:', results);
      
      // Show completion state if we executed any variables
      if (executionOrder.length > 0) {
        this.showDependencyExecutionComplete(executionOrder.length);
      }
      
      return results;
    } catch (error) {
      // Hide indicator on error
      this.hideDependencyExecutionIndicator();
      throw error;
    }
  }

  /**
   * Force re-execution of all variables in dependency order
   */
  async forceExecuteAllVariables() {
    console.log('🚀 Force executing ALL variables (ignoring cache)...');
    
    // Clear all cached results and metadata to force re-execution
    this.executionResults.clear();
    this.executionMetadata.clear();
    
    const results = await this.executeVariables(null, true);
    console.log('✅ Force execution completed for all variables');
    return results;
  }

  /**
   * Invalidate dependent variables when a variable changes
   */
  invalidateDependents(variableName) {
    const dependents = this.dependencyGraph.get(variableName) || [];
    console.log(`🔍 Finding dependents of ${variableName}:`, dependents);
    
    if (dependents.length === 0) {
      console.log(`ℹ️ No dependents found for ${variableName}`);
      return;
    }
    
    const toInvalidate = new Set(dependents);

    // Recursively invalidate all dependents
    const visited = new Set();
    const invalidateRecursive = (varName) => {
      if (visited.has(varName)) return;
      visited.add(varName);

      this.executionResults.delete(varName);
      this.executionMetadata.delete(varName);
      console.log(`🗑️ Invalidated variable: ${varName}`);

      const deps = this.dependencyGraph.get(varName) || [];
      for (const dep of deps) {
        toInvalidate.add(dep);
        invalidateRecursive(dep);
      }
    };

    for (const dep of dependents) {
      invalidateRecursive(dep);
    }
    
    console.log(`🗑️ Total invalidated variables:`, Array.from(toInvalidate));
  }

  /**
   * Find variables that are invalidated (no cached results) and need re-execution
   */
  getInvalidatedVariables() {
    const invalidated = [];
    
    for (const [varName] of this.variables) {
      // Variable is invalidated if it has no cached execution result
      if (!this.executionResults.has(varName)) {
        invalidated.push(varName);
      }
    }
    
    console.log(`🔍 Found ${invalidated.length} invalidated variables:`, invalidated);
    return invalidated;
  }

  /**
   * Automatically re-execute all invalidated variables in dependency order
   */
  async executeInvalidatedVariables(showNotification = false) {
    const invalidated = this.getInvalidatedVariables();
    
    if (invalidated.length === 0) {
      console.log('✅ No invalidated variables to re-execute');
      return {};
    }

    console.log(`🔄 Auto re-executing ${invalidated.length} invalidated variables:`, invalidated);
    
    try {
      // Execute invalidated variables in proper dependency order
      const results = await this.executeVariables(invalidated, false);
      console.log(`✅ Successfully re-executed ${invalidated.length} invalidated variables`);
      
      // Show notification if requested (e.g., during template execution)
      if (showNotification && invalidated.length > 0) {
        const message = invalidated.length === 1 
          ? `Variable ${invalidated[0]} executed`
          : `${invalidated.length} variables executed`;
        this.showTemporaryStatus(message);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error during automatic re-execution:', error);
      throw error;
    }
  }

  /**
   * Get stored execution result for a variable
   */
  getVariableValue(variableName) {
    return this.executionResults.get(variableName);
  }

  /**
   * Get all variable values for template substitution
   */
  getAllVariableValues() {
    return Object.fromEntries(this.executionResults);
  }

  /**
   * Show user notification when dependent variables are automatically re-executed
   */
  showDependencyUpdateNotification(changedVariable, dependentVariables) {
    if (dependentVariables.length === 0) return;
    
    const message = dependentVariables.length === 1 
      ? `Variable ${dependentVariables[0]} updated`
      : `${dependentVariables.length} variables updated`;
    
    console.log(`📢 Variable "${changedVariable}" changed. Updated dependents: ${dependentVariables.join(', ')}`);
    
    // Show a subtle notification using the floating window
    this.showTemporaryStatus(message);
  }

  /**
   * Show temporary status message using floating window
   */
  showTemporaryStatus(message) {
    // Use the new floating window instead of the old status element
    this.showSimpleCompletionNotification(message);
  }
}

// Create and export singleton instance
export const variableDependencyExecutor = new VariableDependencyExecutor();
export default variableDependencyExecutor;

// Make it globally available
window.variableDependencyExecutor = variableDependencyExecutor;

// Test functions for debugging
window.testDependencyIndicator = function() {
  const executor = variableDependencyExecutor;
  
  executor.showDependencyExecutionIndicator();
  
  // Simulate variable execution progress
  setTimeout(() => {
    executor.updateDependencyExecutionProgress('variable_1', 0, 3);
  }, 1000);
  
  setTimeout(() => {
    executor.updateDependencyExecutionProgress('variable_2', 1, 3);
  }, 2000);
  
  setTimeout(() => {
    executor.updateDependencyExecutionProgress('variable_3', 2, 3);
  }, 3000);
  
  // Show completion
  setTimeout(() => {
    executor.showDependencyExecutionComplete(3);
  }, 4000);
};

// Test simple completion notification
window.testSimpleNotification = function(message = 'All 3 variables executed') {
  const executor = variableDependencyExecutor;
  executor.showSimpleCompletionNotification(message);
};

// Test dependency update notification
window.testDependencyUpdate = function() {
  const executor = variableDependencyExecutor;
  executor.showDependencyUpdateNotification('revenue', ['profit', 'margin']);
};