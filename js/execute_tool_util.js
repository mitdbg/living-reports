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


export async function executeToolWithData(tool, datasets, parameters, windowId='default') {
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

  export async function executeCodeForAuthorLocal(code, datasets, windowId='default') {
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
      console.log(`[${windowId}] Datasets:`, Object.keys(executionPayload.parameters));

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
            const shouldPopulate = confirm('Code executed successfully! Would you like to populate the variable with this result?');
            if (shouldPopulate && window.variablesManager) {
              await window.variablesManager.setVariableValue(this.currentVariable.name, result.output);
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