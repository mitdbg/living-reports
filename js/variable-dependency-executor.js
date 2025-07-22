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
  }

  /**
   * Add or update a variable in the system
   */
  addVariable(variableName, variableInfo) {
    const existing = this.variables.get(variableName);
    this.variables.set(variableName, variableInfo);
    
    // Check if this is an update that requires invalidation
    if (existing && this.hasVariableChanged(existing, variableInfo)) {
      console.log(`🔄 Variable ${variableName} changed, invalidating dependents`);
      this.invalidateDependents(variableName);
    }
    
    this.buildDependencyGraph();
  }

  /**
   * Check if a variable has changed in a way that requires re-execution
   */
  hasVariableChanged(oldVariable, newVariable) {
    // Check if value option changed
    if (oldVariable.valueOption !== newVariable.valueOption) {
      return true;
    }
    
    // For manual variables, check if value changed
    if (newVariable.valueOption === 'manual') {
      return oldVariable.value !== newVariable.value;
    }
    
    // For code variables, check if code changed
    if (newVariable.valueOption === 'code') {
      return oldVariable.generatedCode !== newVariable.generatedCode;
    }
    
    // Check if dependencies changed
    const oldDeps = (oldVariable.dependencies || []).sort().join(',');
    const newDeps = (newVariable.dependencies || []).sort().join(',');
    return oldDeps !== newDeps;
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

    for (const varName of executionOrder) {
      try {
        const result = await this.executeVariable(varName, forceReexecute);
        results[varName] = result;
      } catch (error) {
        console.error(`Failed to execute variable ${varName}:`, error);
        throw error;
      }
    }

    console.log('🎯 All variables executed successfully:', results);
    return results;
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
}

// Create and export singleton instance
export const variableDependencyExecutor = new VariableDependencyExecutor();
export default variableDependencyExecutor;