// Chat System Module
import { state, getElements, windowId } from './state.js';
import { getTextContentWithLineBreaks } from './utils.js';
import { 
  createDocumentElement, 
  createDocumentElementId, 
  getDocumentElement, 
  registerElement 
} from './element-id-manager.js';

// Create window-specific storage for initialization flags and handlers
const CHAT_KEY = `chat_${windowId}`;
if (!window[CHAT_KEY]) {
  window[CHAT_KEY] = {
    chatInitialized: false,
    sendMessageHandler: null,
    keyPressHandler: null,
    clearChatHandler: null,
    currentSendButton: null,
    currentMessageInput: null,
    currentClearChatBtn: null
  };
}

const chatData = window[CHAT_KEY];

let waitingMessageElement = null;

// Markdown renderer for chat messages using marked.js
function renderMarkdownForChat(text) {
  if (!text) return '';
  
  // Use marked.js if available, otherwise fall back to simple formatting
  if (typeof marked !== 'undefined') {
    try {
      // Configure marked for chat messages
      marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
        silent: true
      });
      
      return marked.parse(text);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      // Fall through to simple formatting
    }
  }
  
  // Simple fallback formatting when marked.js is not available
  return text
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}

// Extract content from LLM response (for preview mode)
function extractContentFromResponse(responseText) {
  if (!responseText) return null;
  
  // Try to extract markdown code blocks first
  const codeBlockMatch = responseText.match(/```(?:html|markdown|md)?\s*\n([\s\S]*?)\n```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // Try to extract content between specific markers
  const contentMatch = responseText.match(/(?:content|output|result):\s*\n([\s\S]*?)(?:\n\n|$)/i);
  if (contentMatch) {
    return contentMatch[1].trim();
  }
  
  // If response is mostly HTML, return it as-is
  if (responseText.includes('<') && responseText.includes('>')) {
    return responseText;
  }
  
  return null;
}

// Display extracted content in preview panel
function displayContentInPreview(content) {
  const previewContent = getElements.previewContent;
  if (!previewContent || !content) return;
  
  // Render markdown if it looks like markdown
  if (content.includes('#') || content.includes('*') || content.includes('`')) {
    previewContent.innerHTML = renderMarkdownForChat(content);
  } else {
    previewContent.innerHTML = content;
  }
}

export function addMessageToUI(sender, text) {
  const messageElement = createDocumentElement('div', `chat-message-${Date.now()}`, 'chat');
  messageElement.classList.add('chat-message');
  messageElement.classList.add(sender === 'user' ? 'user-message' : 'system-message');
  
  // Add icon for messages
  const icon = sender === 'user' ? '👤' : '🤖';
  
  // Render markdown for the message content
  const renderedContent = renderMarkdownForChat(text);
  
  messageElement.innerHTML = `
    <div class="message-header">
      <span class="message-icon">${icon}</span>
      <span class="message-sender">${sender === 'user' ? 'You' : 'AI Assistant'}</span>
    </div>
    <div class="message-content">${renderedContent}</div>
  `;
  
  // Get the chat messages container using clean getElements
  const chatMessages = getElements.chatMessages;
  if (chatMessages) {
    chatMessages.appendChild(messageElement);
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function addWaitingIndicator() {
  waitingMessageElement = createDocumentElement('div', `waiting-message-${Date.now()}`, 'chat');
  waitingMessageElement.classList.add('chat-message', 'system-message', 'waiting-message');
  waitingMessageElement.innerHTML = `
    <div class="message-header">
      <span class="message-icon">🤖</span>
      <span class="message-sender">AI Assistant</span>
    </div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="typing-text">Thinking...</span>
      </div>
    </div>
  `;
  
  // Get the chat messages container using clean getElements
  const chatMessages = getElements.chatMessages;
  if (chatMessages) {
    chatMessages.appendChild(waitingMessageElement);
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function removeWaitingIndicator() {
  if (waitingMessageElement) {
    waitingMessageElement.remove();
    waitingMessageElement = null;
  }
}

async function sendMessage() {
  const messageInput = getElements.messageInput;
  const message = messageInput ? messageInput.value.trim() : '';
  if (!message) return;
  
  // Check if this is an agent command first
  if (window.codingAssistant) {
    const agentCommand = window.codingAssistant.detectAgentCommand(message);
    if (agentCommand.isAgentCommand) {
      // Clear input
      if (messageInput) messageInput.value = '';
      // Handle through coding assistant
      await window.codingAssistant.handleAgentCommand(agentCommand.agentType, agentCommand.prompt);
      return;
    }
  }
  
  // Add user message to UI
  addMessageToUI('user', message);
  
  // Clear input
  if (messageInput) messageInput.value = '';
  
  // Show waiting indicator
  addWaitingIndicator();
  
  // Send to backend and get response
  try {
    // Call the chatToLLM function and wait for it to complete
    await chatToLLM(message, false);
  } catch (error) {
    console.error('Error in chatToLLM:', error);
    addMessageToUI('system', 'Error: Failed to get response from server. Please try again.');
  } finally {
    // Always remove the waiting indicator when done (after LLM response)
    removeWaitingIndicator();
  }
}

// Function to clear chat history
export function clearChatHistory() {
  // Get the chat messages container using clean getElements
  const chatMessages = getElements.chatMessages;
  
  // Clear the UI
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
  
  // Clear backend conversation history if backend is available
  clearBackendChatHistory();
  
  // Add a confirmation message
  addMessageToUI('system', '🧹 Chat history cleared');
}

async function chatToLLM(message, suggestTemplate = false) {
  try {
    // Get all document content for complete context using clean getElements
    const templateEditor = getElements.templateEditor;
    const previewContent = getElements.previewContent;
    
    const currentTemplateContent = templateEditor ? templateEditor.innerHTML : '';
    const currentPreviewContent = previewContent ? previewContent.innerHTML : '';
    
    const response = await fetch('http://127.0.0.1:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_message: message,
        session_id: state.sessionId,
        current_template: currentTemplateContent,
        current_preview: currentPreviewContent,
        current_mode: state.currentMode,
        suggest_template: suggestTemplate
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    // Wait for the response to be parsed
    const data = await response.json();

    const responseText = data;
    
    // Add the raw response to chat
    addMessageToUI('system', responseText);
    
    // If in preview mode, try to extract and display content smartly
    if (state.currentMode === 'preview') {
      const extractedContent = extractContentFromResponse(responseText);
      if (extractedContent && extractedContent !== responseText) {
        // Display extracted content in preview
        displayContentInPreview(extractedContent);
        // Add a note to chat that content was extracted
        addMessageToUI('system', 'Content extracted and displayed in preview');
      }
    }
    
    // Response is fully processed at this point
    
  } catch (error) {
    console.error('Error sending message:', error);
    addMessageToUI('system', 'Error: Failed to get response from server. Make sure the Python backend is running.');
    // Re-throw to let the caller handle it
    throw error;
  }
}

async function clearBackendChatHistory() {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/chat/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        session_id: state.sessionId
      })
    });

    if (!response.ok) {
      console.warn('Backend not available or failed to clear chat history');
    }
  } catch (error) {
    console.warn('Backend not available for clearing chat history:', error);
  }
}

// Simple function for users to chat with LLM including document context
export async function sendChatMessage(userMessage) {
  if (!userMessage || !userMessage.trim()) {
    console.warn('Empty message provided to sendChatMessage');
    return;
  }
  
  // Add user message to UI
  addMessageToUI('user', userMessage.trim());
  
  // Show waiting indicator
  addWaitingIndicator();
  
  try {
    // Send message with full document context and wait for completion
    await chatToLLM(userMessage.trim(), false);
  } catch (error) {
    console.error('Error in sendChatMessage:', error);
    addMessageToUI('system', 'Error: Failed to get response from AI assistant. Please try again.');
  } finally {
    // Always remove the waiting indicator after LLM response is processed
    removeWaitingIndicator();
  }
}

export function initChat() {
  // Get elements using clean getElements
  const sendButton = getElements.sendButton;
  const messageInput = getElements.messageInput;
  const chatMessages = getElements.chatMessages;
  const clearChatBtn = getElements.clearChatBtn;
  
  // Check if chat elements exist
  if (!sendButton || !messageInput || !chatMessages || !clearChatBtn) {
    console.error(`[${windowId}] Chat elements not found!`, {
      sendButton: !!sendButton,
      messageInput: !!messageInput,
      chatMessages: !!chatMessages,
      clearChatBtn: !!clearChatBtn
    });
    return;
  }
  
  // Remove existing event listeners from previous elements if they exist
  if (chatData.sendMessageHandler && chatData.currentSendButton) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous send button`);
    chatData.currentSendButton.removeEventListener('click', chatData.sendMessageHandler);
  }
  if (chatData.keyPressHandler && chatData.currentMessageInput) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous message input`);
    chatData.currentMessageInput.removeEventListener('keypress', chatData.keyPressHandler);
  }
  if (chatData.clearChatHandler && chatData.currentClearChatBtn) {
    console.log(`[${windowId}] 🧹 Removing event listener from previous clear chat button`);
    chatData.currentClearChatBtn.removeEventListener('click', chatData.clearChatHandler);
  }
  
  // Create new event handlers
  chatData.sendMessageHandler = sendMessage;
  chatData.keyPressHandler = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  chatData.clearChatHandler = clearChatHistory;
  
  // Send button click handler
  sendButton.addEventListener('click', chatData.sendMessageHandler);
  chatData.currentSendButton = sendButton;
  
  // Enter key handler for message input
  messageInput.addEventListener('keypress', chatData.keyPressHandler);
  chatData.currentMessageInput = messageInput;
  
  // Clear chat button handler
  clearChatBtn.addEventListener('click', chatData.clearChatHandler);
  chatData.currentClearChatBtn = clearChatBtn;
  
  console.log(`[${windowId}] Chat initialized`);
  
  // Mark as initialized
  chatData.chatInitialized = true;
  window[CHAT_KEY] = chatData;
}

// Ask LLM functionality for floating comments
export function initAskLLMButton() {
  // Get element using clean getElements
  const askLLMBtn = getElements.askLLMBtn;
  
  // Check if Ask LLM elements exist
  if (!askLLMBtn) {
    console.error('Ask LLM elements not found!', {
      askLLMBtn: !!askLLMBtn
    });
    return;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Function to reset initialization flag (for DocumentManager)
export function resetChatInitialization() {
  // Clean up existing event listeners before resetting
  if (chatData.sendMessageHandler && chatData.currentSendButton) {
    console.log(`[${windowId}] 🧹 Cleaning up send message event listener during reset`);
    chatData.currentSendButton.removeEventListener('click', chatData.sendMessageHandler);
  }
  if (chatData.keyPressHandler && chatData.currentMessageInput) {
    console.log(`[${windowId}] 🧹 Cleaning up key press event listener during reset`);
    chatData.currentMessageInput.removeEventListener('keypress', chatData.keyPressHandler);
  }
  if (chatData.clearChatHandler && chatData.currentClearChatBtn) {
    console.log(`[${windowId}] 🧹 Cleaning up clear chat event listener during reset`);
    chatData.currentClearChatBtn.removeEventListener('click', chatData.clearChatHandler);
  }
  
  chatData.chatInitialized = false;
  chatData.sendMessageHandler = null;
  chatData.keyPressHandler = null;
  chatData.clearChatHandler = null;
  chatData.currentSendButton = null;
  chatData.currentMessageInput = null;
  chatData.currentClearChatBtn = null;
  window[CHAT_KEY] = chatData;
} 