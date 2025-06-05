// Chat System Module
import { state, elements, windowId } from './state.js';
import { sendToBackend } from './template-execution.js';

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

export function addMessageToUI(sender, text) {
  const messageElement = document.createElement('div');
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
  
  elements.chatMessages.appendChild(messageElement);
  
  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

export function addWaitingIndicator() {
  waitingMessageElement = document.createElement('div');
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
  
  elements.chatMessages.appendChild(waitingMessageElement);
  
  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

export function removeWaitingIndicator() {
  if (waitingMessageElement) {
    waitingMessageElement.remove();
    waitingMessageElement = null;
  }
}

function sendMessage() {
  const message = elements.messageInput.value.trim();
  if (!message) return;
  
  // Add user message to UI
  addMessageToUI('user', message);
  
  // Clear input
  elements.messageInput.value = '';
  
  // Show waiting indicator
  addWaitingIndicator();
  
  // Send to backend and get response
  sendToBackendWithLoading(message);
}

async function sendToBackendWithLoading(message) {
  try {
    // Call the original sendToBackend function without template suggestion flag
    await sendToBackend(message, false);
  } catch (error) {
    console.error('Error in sendToBackendWithLoading:', error);
    addMessageToUI('system', 'Error: Failed to get response from server. Please try again.');
  } finally {
    // Always remove the waiting indicator when done
    removeWaitingIndicator();
  }
}

// Function to clear chat history
export function clearChatHistory() {
  // Clear the UI
  elements.chatMessages.innerHTML = '';
  
  // Clear backend conversation history if backend is available
  clearBackendChatHistory();
  
  // Add a confirmation message
  addMessageToUI('system', '🧹 Chat history cleared');
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

export function initChat() {
  // Check if chat elements exist
  if (!elements.sendButton || !elements.messageInput || !elements.chatMessages || !elements.clearChatBtn) {
    console.error(`[${windowId}] Chat elements not found!`, {
      sendButton: !!elements.sendButton,
      messageInput: !!elements.messageInput,
      chatMessages: !!elements.chatMessages,
      clearChatBtn: !!elements.clearChatBtn
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
  elements.sendButton.addEventListener('click', chatData.sendMessageHandler);
  chatData.currentSendButton = elements.sendButton;
  
  // Enter key handler for message input
  elements.messageInput.addEventListener('keypress', chatData.keyPressHandler);
  chatData.currentMessageInput = elements.messageInput;
  
  // Clear chat button handler
  elements.clearChatBtn.addEventListener('click', chatData.clearChatHandler);
  chatData.currentClearChatBtn = elements.clearChatBtn;
  
  console.log(`[${windowId}] Chat initialized`);
  
  // Mark as initialized
  chatData.chatInitialized = true;
  window[CHAT_KEY] = chatData;
}

// Ask LLM functionality for floating comments
export function initAskLLMButton() {
  // Check if Ask LLM elements exist
  if (!elements.askLLMBtn) {
    console.error('Ask LLM elements not found!', {
      askLLMBtn: !!elements.askLLMBtn
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