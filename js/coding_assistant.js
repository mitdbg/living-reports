// Coding Assistant Module - AI Agent Integration for Chat
import { addMessageToUI } from './chat.js';
import { getTextContentWithLineBreaks } from './utils.js';
import { createDocumentElement, createDocumentElementId, getDocumentElement } from './element-id-manager.js';
import { getElements } from './state.js';

class CodingAssistant {
  constructor() {
    this.availableAgents = [
      'coding_agent',
      'debugger', 
      'explainer',
      'test_writer',
      'code_writer'
    ];
    this.isProcessing = false;
    this.apiBaseUrl = 'http://127.0.0.1:5000';
  }

  init() {
    this.setupEventListeners();
    console.log('✅ Coding Assistant initialized');
  }

  setupEventListeners() {
    // Set up auto-complete for agent commands
    // this.setupAutoComplete();
  }

  // This method is no longer needed since we integrate with sendMessage() directly

  setupAutoComplete() {
    // Set up auto-complete on a timer to ensure elements exist
    const setupAutoCompleteForInput = () => {
      const chatInput = getElements.messageInput;
      if (!chatInput) {
        setTimeout(setupAutoCompleteForInput, 100);
        return;
      }

      // Remove existing listener if any
      if (this.autoCompleteListener) {
        chatInput.removeEventListener('input', this.autoCompleteListener);
      }

      this.autoCompleteListener = (e) => {
        const value = e.target.value;
        
        // Show suggestions when user types @
        if (value.includes('@') && !this.isProcessing) {
          const atIndex = value.lastIndexOf('@');
          const searchTerm = value.substring(atIndex + 1).toLowerCase();
          
          if (searchTerm.length >= 0) {
            const suggestions = this.availableAgents.filter(agent => 
              agent.toLowerCase().includes(searchTerm)
            );
            
            if (suggestions.length > 0) {
              this.showSuggestions(chatInput, suggestions, atIndex);
            } else {
              this.hideSuggestions();
            }
          }
        } else {
          this.hideSuggestions();
        }
      };

      chatInput.addEventListener('input', this.autoCompleteListener);

      // Handle suggestion selection
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('agent-suggestion')) {
          const agentName = e.target.dataset.agent;
          const currentValue = chatInput.value;
          const atIndex = currentValue.lastIndexOf('@');
          
          chatInput.value = currentValue.substring(0, atIndex) + `@${agentName} `;
          chatInput.focus();
          this.hideSuggestions();
        }
      });

      // Hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.agent-suggestions') && !e.target.closest('.message-input')) {
          this.hideSuggestions();
        }
      });

      console.log('✅ Auto-complete set up for coding assistant');
    };

    setupAutoCompleteForInput();
  }

  showSuggestions(chatInput, suggestions, atIndex) {
    this.hideSuggestions(); // Remove existing suggestions

    const suggestionsList = createDocumentElement('div', `agent-suggestions-${Date.now()}`, 'coding-assistant', window.documentManager.getCurrentDocumentId());
    suggestionsList.className = 'agent-suggestions';
    suggestionsList.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 1000;
      max-height: 200px;
      overflow-y: auto;
    `;

    suggestions.forEach(agent => {
      const suggestion = document.createElement('div');
      suggestion.className = 'agent-suggestion';
      suggestion.dataset.agent = agent;
      suggestion.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
      `;
      suggestion.innerHTML = `
        <strong>@${agent}</strong>
        <div style="font-size: 12px; color: #666;">${this.getAgentDescription(agent)}</div>
      `;
      
      suggestion.addEventListener('mouseenter', () => {
        suggestion.style.backgroundColor = '#f5f5f5';
      });
      suggestion.addEventListener('mouseleave', () => {
        suggestion.style.backgroundColor = 'white';
      });

      suggestionsList.appendChild(suggestion);
    });

    // Position suggestions below chat input
    const inputRect = chatInput.getBoundingClientRect();
    suggestionsList.style.top = `${inputRect.bottom + window.scrollY}px`;
    suggestionsList.style.left = `${inputRect.left + window.scrollX}px`;
    suggestionsList.style.width = `${inputRect.width}px`;

    document.body.appendChild(suggestionsList);
  }

  hideSuggestions() {
    const existing = document.querySelector('.agent-suggestions');
    if (existing) {
      existing.remove();
    }
  }

  getAgentDescription(agent) {
    const descriptions = {
      'coding_agent': 'Main coordinator - routes to appropriate specialist',
      'debugger': 'Fix bugs and runtime errors in code',
      'explainer': 'Explain how code works and provide insights',
      'test_writer': 'Generate comprehensive unit tests',
      'code_writer': 'Write new functions and algorithms'
    };
    return descriptions[agent] || 'AI coding assistant';
  }

  detectAgentCommand(message) {
    const agentPattern = /^@(coding_agent|debugger|explainer|test_writer|code_writer)\s+(.+)$/i;
    const match = message.match(agentPattern);
    
    console.log('🔍 Checking message for agent command:', message);
    console.log('🔍 Pattern match result:', match);
    
    if (match) {
      const result = {
        isAgentCommand: true,
        agentType: match[1].toLowerCase(),
        prompt: match[2].trim()
      };
      console.log('✅ Agent command detected:', result);
      return result;
    }
    
    console.log('❌ No agent command detected');
    return { isAgentCommand: false };
  }

  async handleAgentCommand(agentType, prompt) {
    console.log('🤖 handleAgentCommand called with:', { agentType, prompt });
    
    if (this.isProcessing) {
      addMessageToUI('system', '⏳ Another agent request is already processing. Please wait...');
      return;
    }

    this.isProcessing = true;
    
    try {
      // Show user message in chat
      addMessageToUI('user', `@${agentType} ${prompt}`);
      
      // Show processing indicator
      const processingMsg = this.getProcessingMessage(agentType);
      addMessageToUI('system', processingMsg);
      
      // Gather context from current document
      const context = this.gatherCurrentContext();
      console.log('📋 Context gathered:', context);
      
      // Make API call to coding agent
      console.log('🚀 Making API call to /api/agents/coding');
      const response = await fetch(`http://127.0.0.1:5000/api/agents/coding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          context: context,
          agent_type: agentType
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📥 API Response received:', result);
      
      if (result.success) {
        console.log('✅ API call successful, handling response');
        await this.handleAgentResponse(result, agentType);
      } else {
        console.log('❌ API call failed:', result.error);
        addMessageToUI('system', `❌ Agent Error: ${result.error || 'Unknown error occurred'}`);
      }
      
    } catch (error) {
      console.error('Coding agent error:', error);
      addMessageToUI('system', `❌ Failed to reach ${agentType}: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  getProcessingMessage(agentType) {
    const messages = {
      'coding_agent': '🤖 Coding Agent is analyzing your request and routing to the best specialist...',
      'debugger': '🐛 Debugger is analyzing your code for issues...',
      'explainer': '📚 Code Explainer is preparing a detailed explanation...',
      'test_writer': '🧪 Test Writer is generating comprehensive test cases...',
      'code_writer': '✍️ Code Writer is crafting your solution...'
    };
    return messages[agentType] || `🤖 ${agentType} is processing your request...`;
  }

  async handleAgentResponse(result, agentType) {
    const { raw_response, extracted_code, has_code } = result;
    
    // Always show the agent's response in chat
    addMessageToUI('assistant', raw_response);
    
    // If there's code, offer to load it into editor
    if (has_code && extracted_code) {
      const success = this.loadCodeIntoEditor(extracted_code);
      
      if (success) {
        addMessageToUI('system', '✅ Generated code loaded into source editor');
        
        // Offer to save as new tool
        this.offerSaveAsTool(extracted_code, agentType);
      } else {
        // If no active document, offer to create one
        this.offerCreateDocument(extracted_code);
      }
    } else {
      // No code generated, just an explanation
      addMessageToUI('system', `✅ ${agentType} completed successfully`);
    }
  }

  gatherCurrentContext() {
    const activeDocumentId = window.documentManager?.activeDocumentId;
    let context = {
      has_active_document: false
    };
    
    if (activeDocumentId) {
      const sourceEditor = getElements.sourceEditor;
      
      if (sourceEditor) {
        const currentCode = getTextContentWithLineBreaks(sourceEditor);
        context = {
          has_active_document: true,
          current_source_code: currentCode,
          document_id: activeDocumentId,
          document_type: 'source_code',
          code_length: currentCode.length
        };
        
        // Add variables context if available
        if (window.variablesModule && window.variablesModule.getAllVariables) {
          context.variables = window.variablesModule.getAllVariables();
        }
        
        // Add data sources context if available
        if (window.dataSourcesModule && window.dataSourcesModule.getCurrentDatasets) {
          context.available_datasets = window.dataSourcesModule.getCurrentDatasets();
        }
      }
    }
    
    return context;
  }

  loadCodeIntoEditor(code) {
    const activeDocumentId = window.documentManager?.activeDocumentId;
    
    if (!activeDocumentId) {
      console.log('❌ No active document found');
      return false; // No active document
    }
    
    // First priority: Try to find the embedded tool code editor using document-specific ID
    const embeddedToolCode = getDocumentElement('embedded-tool-code');
    if (embeddedToolCode) {
      console.log('📝 Loading code into embedded tool editor for active document');
      // Convert newlines to <br> for contenteditable div
      const htmlContent = code.replace(/\n/g, '<br>');
      embeddedToolCode.innerHTML = htmlContent;
      embeddedToolCode.focus();
      return true;
    }
    
    // Fallback: Use the regular source editor
    const sourceEditor = getElements.sourceEditor;
    if (!sourceEditor) {
      console.log('❌ No source editor found in active document');
      return false; // No source editor
    }
    
    console.log('📝 Loading code into document source editor');
    // Convert newlines to <br> for contenteditable div
    const htmlContent = code.replace(/\n/g, '<br>');
    sourceEditor.innerHTML = htmlContent;
    
    // Switch to source mode if not already active using document-specific elements
    const sourceModeBtn = getElements.sourceModeBtn;
    if (sourceModeBtn && !sourceModeBtn.classList.contains('active')) {
      sourceModeBtn.click();
    }
    
    // Focus on the editor
    sourceEditor.focus();
    
    return true;
  }

  offerSaveAsTool(code, agentType) {
    // Suggest tool name based on code analysis
    const suggestedName = this.generateToolName(code, agentType);
    
    const suggestion = createDocumentElement('div', `save-tool-suggestion-${Date.now()}`, 'coding-assistant', window.documentManager.getCurrentDocumentId());
    suggestion.className = 'save-tool-suggestion';
    suggestion.innerHTML = `
      <p>💡 Would you like to save this code as a reusable tool?</p>
      <button onclick="window.codingAssistant.saveGeneratedCodeAsTool(\`${this.escapeForAttribute(code)}\`, '${agentType}')" class="btn-primary">
        💾 Save as Tool: "${suggestedName}"
      </button>
    `;
    
    addMessageToUI('system', suggestion.outerHTML);
  }

  saveGeneratedCodeAsTool(code, agentType) {
    console.log('Saving generated code as tool...');
    
    // Generate a good tool name
    const suggestedName = this.generateToolName(code, agentType);
    
    // Open the operators panel and switch to tool editor
    if (window.operatorsModule && window.operatorsModule.showToolEditor) {
      window.operatorsModule.showToolEditor();
      
      // Wait a bit for the UI to update, then pre-fill the form using document-specific elements
      setTimeout(() => {
        const toolNameInput = getDocumentElement('embedded-tool-name');
        const toolDescInput = getDocumentElement('embedded-tool-description');
        const codeEditor = getDocumentElement('embedded-tool-code');
        
        if (toolNameInput && toolDescInput && codeEditor) {
          toolNameInput.value = suggestedName;
          toolDescInput.value = `Generated by ${agentType}`;
          codeEditor.innerHTML = code.replace(/\n/g, '<br>');
          
          addMessageToUI('system', '🛠️ Tool creation dialog opened with generated code');
        } else {
          addMessageToUI('system', '❌ Could not open tool editor - operators panel not found');
        }
      }, 100);
    } else {
      addMessageToUI('system', '❌ Operators module not available - cannot open tool editor');
    }
  }

  generateToolName(code, agentType) {
    // Extract function names or create a descriptive name
    const functionMatch = code.match(/def\s+(\w+)/);
    const classMatch = code.match(/class\s+(\w+)/);
    
    if (functionMatch) {
      return functionMatch[1];
    } else if (classMatch) {
      return classMatch[1];
    } else {
      return `${agentType}_generated_${Date.now()}`;
    }
  }

  offerCreateDocument(code) {
    addMessageToUI('system', '💡 No active document found. Generated code is ready to be placed in a new document.');
    
    // You could auto-create a document here if desired
    // For now, just inform the user
  }

  escapeForAttribute(str) {
    return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }

  // Public method to check if agent commands are available
  isAgentCommandAvailable() {
    return !this.isProcessing;
  }

  // Public method to get available agents
  getAvailableAgents() {
    return [...this.availableAgents];
  }

  // Public method to manually trigger an agent (for external integrations)
  async executeAgent(agentType, prompt, context = null) {
    if (!this.availableAgents.includes(agentType)) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }
    
    const finalContext = context || this.gatherCurrentContext();
    await this.handleAgentCommand(agentType, prompt);
  }
}

// Initialize and export
const codingAssistant = new CodingAssistant();

export async function initCodingAssistant() {
  codingAssistant.init();
  
  // Make globally available for other modules
  window.codingAssistant = codingAssistant;
  
  console.log('✅ Coding Assistant module initialized');
}

export { codingAssistant }; 