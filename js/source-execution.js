// Source Code Execution Module
import { state, elements, updateState, windowId } from './state.js';
import { addMessageToUI } from './chat.js';
import { getCurrentUser } from './auth.js';

// Create window-specific storage for initialization flags and handlers
const SOURCE_EXEC_KEY = `sourceExec_${windowId}`;
if (!window[SOURCE_EXEC_KEY]) {
  window[SOURCE_EXEC_KEY] = {
    sourceExecutionInitialized: false,
    executeHandler: null,
    currentExecuteBtn: null
  };
}

const sourceExecData = window[SOURCE_EXEC_KEY];

// Execute source code
export function executeSourceCode(clearCache = false, isLiveUpdate = false) {
  // Check if user can execute source code
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    console.log(`[${windowId}] User ${currentUser.name} (${currentUser.role}) cannot execute source code`);
    setSourceExecutionStatus('Access denied: Consumers cannot execute source code', 'error');
    return;
  }
  
  const sourceCode = elements.sourceEditor.textContent;
  if (!sourceCode.trim()) {
    setSourceExecutionStatus('Please enter source code first', 'error');
    return;
  }

  if (!isLiveUpdate) {
    setSourceExecutionStatus(clearCache ? 'Executing source code (no cache)...' : 'Executing source code...', 'loading');
  }

  executeSourceCodeRequest(sourceCode, clearCache, isLiveUpdate);
}

async function executeSourceCodeRequest(sourceCode, clearCache = false, isLiveUpdate = false) {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/execute-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        source_code: sourceCode,
        session_id: state.sessionId,
        clear_cache: clearCache
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      // Update state with generated variables and source code
      updateState({ 
        variables: { ...state.variables, ...data.variables },
        sourceVariables: data.variables || {},
        currentSourceCode: sourceCode,
        sourceOutput: data.output || ''
      });
      
      if (!isLiveUpdate) {
        setSourceExecutionStatus('Source code executed successfully', 'success');
      }
      
      // Show success message with variable count
      const varCount = Object.keys(data.variables || {}).length;
      if (varCount > 0) {
        addMessageToUI('system', `✅ Source code executed successfully! Generated ${varCount} variable${varCount > 1 ? 's' : ''}: ${Object.keys(data.variables).join(', ')}`);
      } else {
        addMessageToUI('system', '✅ Source code executed successfully!');
      }
      
      // Update variables display
      updateVariablesDisplay(data.variables || {});
      
    } else {
      setSourceExecutionStatus('Source execution failed', 'error');
      addMessageToUI('system', `❌ Source execution failed: ${data.error}`);
    }
  } catch (error) {
    console.error('Error executing source code:', error);
    setSourceExecutionStatus('Source execution failed', 'error');
    addMessageToUI('system', `❌ Source execution failed: ${error.message}`);
  }
}

function updateVariablesDisplay(variables) {
  if (!elements.variablesList) return;
  
  if (Object.keys(variables).length === 0) {
    elements.variablesList.innerHTML = '<p class="no-variables">No variables generated</p>';
    return;
  }
  
  const variablesHtml = Object.entries(variables).map(([name, value]) => {
    let displayValue = value;
    if (typeof value === 'object') {
      displayValue = JSON.stringify(value, null, 2);
    } else if (typeof value === 'string' && value.length > 100) {
      displayValue = value.substring(0, 100) + '...';
    }
    
    return `
      <div class="variable-item">
        <span class="variable-name">${name}</span>
        <span class="variable-value">${displayValue}</span>
        <span class="variable-type">${typeof value}</span>
      </div>
    `;
  }).join('');
  
  elements.variablesList.innerHTML = variablesHtml;
  
  // Show variables display
  if (elements.variablesDisplay) {
    elements.variablesDisplay.style.display = 'block';
  }
}

function setSourceExecutionStatus(message, type) {
  if (!elements.sourceExecutionStatus) return;
  
  elements.sourceExecutionStatus.textContent = message;
  elements.sourceExecutionStatus.className = `source-execution-status ${type}`;
  
  if (type !== 'error') {
    setTimeout(() => {
      elements.sourceExecutionStatus.textContent = '';
      elements.sourceExecutionStatus.className = 'source-execution-status';
    }, 3000);
  }
}

export function initSourceExecution() {
  if (!elements.executeSourceBtn) {
    console.error(`[${windowId}] Execute source button not found!`);
    return;
  }
  
  // Check if user can execute source code
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'Report Consumer') {
    console.log(`[${windowId}] Hiding execute source button for consumer: ${currentUser.name}`);
    elements.executeSourceBtn.style.display = 'none';
    return; // Don't add event listeners for consumers
  }
  
  // Remove existing event listener from the previous button if it exists
  if (sourceExecData.executeHandler && sourceExecData.currentExecuteBtn) {
    console.log(`[${windowId}] Removing event listener from previous execute source button`);
    sourceExecData.currentExecuteBtn.removeEventListener('click', sourceExecData.executeHandler);
  }
  
  // Create new event handler
  sourceExecData.executeHandler = () => {
    console.log(`[${windowId}] Execute source code clicked`);
    executeSourceCode();
  };
  
  // Add the event listener to the current button
  elements.executeSourceBtn.addEventListener('click', sourceExecData.executeHandler);
  
  // Track which button currently has the listener
  sourceExecData.currentExecuteBtn = elements.executeSourceBtn;
  
  console.log(`[${windowId}] Source execution initialized, button:`, elements.executeSourceBtn);
  
  // Mark as initialized
  sourceExecData.sourceExecutionInitialized = true;
  window[SOURCE_EXEC_KEY] = sourceExecData;
}

// Function to reset initialization flag (for DocumentManager)
export function resetSourceExecutionInitialization() {
  // Clean up existing event listener before resetting
  if (sourceExecData.executeHandler && sourceExecData.currentExecuteBtn) {
    console.log(`[${windowId}] Cleaning up execute source event listener during reset`);
    sourceExecData.currentExecuteBtn.removeEventListener('click', sourceExecData.executeHandler);
  }
  
  sourceExecData.sourceExecutionInitialized = false;
  sourceExecData.executeHandler = null;
  sourceExecData.currentExecuteBtn = null;
  window[SOURCE_EXEC_KEY] = sourceExecData;
} 