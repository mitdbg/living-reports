import { getDocumentElement } from './element-id-manager.js';

  /**
   * Show execution result
   */
 function showExecutionResult(output, error) {
    const resultContainer = getDocumentElement('execution-result');
    const resultContent = getDocumentElement('result-content');
    
    if (resultContainer) resultContainer.style.display = 'block';
    
    if (resultContent) {
      if (error) {
        resultContent.innerHTML = `<div style="color: red;"><strong>Error:</strong><br>${error}</div>`;
      } else {
        resultContent.innerHTML = `<div style="color: green;"><strong>Output:</strong><br>${output}</div>`;
      }
    }
  }


export function convertHtmlCodeToPlainText(htmlCode) {
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

function parseParameterValue(value) {
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

function extractValueFromOutput(result, outputConfig) {
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


export async function executeOperatorWithData(tool, datasets, parameters, windowId='default', outputs=[]) {
    try {
      // Process parameters to separate datasets from literal values
      const processedParameters = {};
      const datasetsFromParams = {};

      for (const [key, paramData] of Object.entries(parameters || {})) {
        if (typeof paramData === 'object' && paramData.type && paramData.value !== undefined) {
          // New format: { type: 'dataset|literal', value: '...' }
          if (paramData.type === 'dataset') {
            // Load dataset from data sources
            const dataset = window.dataSourcesModule?.getDataSource(paramData.value);
            if (dataset) {
              datasetsFromParams[key] = dataset;
            } else {
              console.warn(`Dataset not found: ${paramData.value}`);
              processedParameters[key] = null; // Dataset not found
            }
          } else {
            // Literal value - try to parse JSON, numbers, booleans
            processedParameters[key] = parseParameterValue(paramData.value);
          }
        } else {
          // Legacy format: assume literal value
          processedParameters[key] = parseParameterValue(paramData);
        }
      }

      // Convert HTML code back to plain text for backend execution
      const plainTextCode = convertHtmlCodeToPlainText(tool.code);
      
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

      console.log(`[${windowId}] Executing operator "${tool.name}" via local endpoint...`);
      console.log(`[${windowId}] Datasets:`, Object.keys(executionPayload.datasets));
      console.log(`[${windowId}] Parameters:`, processedParameters);
      
      console.log(`[${windowId}] About to make fetch request to local endpoint...`);
      
      // Use local API endpoint for execution with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('http://127.0.0.1:5000/api/execute-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
        },
        signal: controller.signal,
        body: JSON.stringify({
          code: plainTextCode,
          parameters: executionPayload.parameters
        })
      });
      
      clearTimeout(timeoutId);
      console.log(`[${windowId}] Fetch request completed successfully`);

      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          showExecutionResult(result.output, null);
          
          // If execution was successful and returned a value, store in specified output variables
          if (result.output && outputs && outputs.length > 0) {
            for (const output of outputs) {
              if (output.variable && output.variable.trim() && window.variablesManager) {
                try {
                  // Extract the value using the output configuration if specified
                  let valueToStore = result.output;
                  
                                     if (output.config && output.config.trim()) {
                     // Extract the value using the output configuration
                     valueToStore = extractValueFromOutput(result.output, output.config);
                     console.log(`[${windowId}] Extracted value using config "${output.config}":`, valueToStore);
                   }
                  
                  await window.variablesManager.setVariableValue(output.variable, valueToStore);
                  console.log(`[${windowId}] Stored output in variable: ${output.variable}`);
                } catch (error) {
                  console.warn(`[${windowId}] Failed to store output in variable ${output.variable}:`, error);
                }
              }
            }
          }
          
          return result.output;
        } else {
          // Handle backend error response
          showExecutionResult(null, result.error || 'Code execution failed');
          throw new Error(result.error || 'Code execution failed');
        }

      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

    } catch (error) {
      console.error(`[${windowId}] External execution error:`, error);
      
      // Clear timeout if it exists
      if (typeof timeoutId !== 'undefined') {
        clearTimeout(timeoutId);
      }
      
      // Handle specific error types
      if (error.name === 'AbortError') {
        throw new Error(`Code execution timed out after 30 seconds. Check if backend is running at http://127.0.0.1:5000`);
      } else if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error(`Cannot connect to backend at http://127.0.0.1:5000. Please ensure the backend server is running.`);
      } else if (error.message.includes('NetworkError')) {
        throw new Error(`Network error connecting to backend. Check if backend is running at http://127.0.0.1:5000`);
      } else {
        throw new Error(`Code execution failed: ${error.message}`);
      }
    }
  }

  export async function executeCodeForAuthorLocal(code, datasets, variableName, windowId='default', skipPropagation = false) {
    try {
      // Process parameters to separate datasets from literal values
      const plainTextCode = convertHtmlCodeToPlainText(code);
      
      let processedParameters = {}
      processedParameters['data_source'] = datasets;
      const executionPayload = {
        code: plainTextCode,
        parameters: processedParameters // Literal values
      };

      console.log(`[${windowId}] Executing code for author...`);
      const response = await fetch('http://127.0.0.1:5000/api/execute-code', {
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

      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          showExecutionResult(result.output, null);
          
          // If execution was successful and returned a value, offer to populate the variable
          if (result.output) {
            if (window.variablesManager && variableName) {
              await window.variablesManager.setVariableValue(variableName, result.output, skipPropagation);
            }
          }
          
          return result.output;
        } else {
          // Handle backend error response
          showExecutionResult(null, result.error || 'Code execution failed');
          throw new Error(result.error || 'Code execution failed');
        }

      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

    }  catch (error) {
        console.error('Error running code:', error);
        showExecutionResult('', error.message);
      }
  }