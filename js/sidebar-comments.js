import { state } from './state.js';
import { escapeHtml, formatTimestamp } from './utils.js';
import { getCurrentUser } from './auth.js';

// Sidebar comment management
export class SidebarComments {
  constructor() {
    this.commentsList = null;
    this.isInitialized = false;
  }

  // Initialize the sidebar comments system
  init(container) {
    if (this.isInitialized) return;
    
    this.commentsList = container.querySelector('#sidebar-comments-list');
    if (!this.commentsList) {
      console.warn('Sidebar comments list not found');
      return;
    }

    this.isInitialized = true;
    this.renderComments();
    
    // Listen for comment state changes
    this.setupStateListener();
  }

  // Setup listener for comment state changes
  setupStateListener() {
    // Create a custom event system to listen for comment changes
    const originalComments = { ...state.comments };
    
    // Check for changes periodically
    setInterval(() => {
      if (JSON.stringify(state.comments) !== JSON.stringify(originalComments)) {
        Object.assign(originalComments, state.comments);
        this.renderComments();
      }
    }, 1000);
  }

  // Render all comments in the sidebar
  renderComments() {
    if (!this.commentsList) return;

    const currentMode = state.currentMode;
    const comments = Object.values(state.comments).filter(comment => 
      comment.mode === currentMode
    );

    if (comments.length === 0) {
      this.commentsList.innerHTML = '<p class="sidebar-placeholder">No comments yet.</p>';
      return;
    }

    // Sort comments by creation date (newest first)
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    this.commentsList.innerHTML = '';
    
    comments.forEach(comment => {
      const commentElement = this.createCommentElement(comment);
      this.commentsList.appendChild(commentElement);
    });
  }

  // Create a single comment element for the sidebar
  createCommentElement(comment) {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'sidebar-comment';
    commentDiv.dataset.commentId = comment.id;
    
    if (comment.isResolved) {
      commentDiv.classList.add('resolved');
    }

    const selectedTextPreview = comment.selectedText.length > 50 
      ? comment.selectedText.substring(0, 50) + '...' 
      : comment.selectedText;

    const messageCount = comment.messages ? comment.messages.length : 0;
    const hasReplies = messageCount > 0;

    commentDiv.innerHTML = `
      <div class="sidebar-comment-header">
        <div class="comment-author">
          <span class="author-emoji">${comment.authorEmoji}</span>
          <span class="author-name">${escapeHtml(comment.authorName)}</span>
        </div>
        <div class="comment-actions">
          ${comment.isResolved ? 
            '<span class="resolved-badge">✓ Resolved</span>' : 
            '<button class="resolve-comment-btn" title="Mark as resolved">✓</button>'
          }
          <button class="delete-comment-btn" title="Delete comment">🗑️</button>
        </div>
      </div>
      
      <div class="sidebar-comment-content">
        <div class="comment-text">${escapeHtml(comment.commentMessage)}</div>
        <div class="selected-text-preview">
          <span class="preview-label">On:</span>
          <span class="preview-text">"${escapeHtml(selectedTextPreview)}"</span>
        </div>
        ${hasReplies ? `
          <div class="comment-replies">
            <span class="replies-count">${messageCount} ${messageCount === 1 ? 'reply' : 'replies'}</span>
          </div>
        ` : ''}
      </div>
      
      <div class="sidebar-comment-footer">
        <span class="comment-time">${formatTimestamp(comment.createdAt)}</span>
        <button class="reply-to-comment-btn" title="Reply to comment">💬 Reply</button>
      </div>
      
      ${hasReplies ? `
        <div class="sidebar-comment-replies">
          ${comment.messages.map(message => `
            <div class="sidebar-reply">
              <div class="reply-header">
                <span class="reply-author">
                  <span class="author-emoji">${message.authorEmoji}</span>
                  <span class="author-name">${escapeHtml(message.authorName)}</span>
                </span>
                <span class="reply-time">${formatTimestamp(message.timestamp)}</span>
              </div>
              <div class="reply-content">${escapeHtml(message.content)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="sidebar-comment-reply-form" style="display: none;">
        <textarea class="reply-input" placeholder="Add a reply..." rows="2"></textarea>
        <div class="reply-actions">
          <button class="send-reply-btn">Send</button>
          <button class="cancel-reply-btn">Cancel</button>
        </div>
      </div>
    `;

    // Add event listeners
    this.addCommentEventListeners(commentDiv, comment);

    return commentDiv;
  }

  // Add event listeners to a comment element
  addCommentEventListeners(commentElement, comment) {
    const commentId = comment.id;

    // Resolve comment
    const resolveBtn = commentElement.querySelector('.resolve-comment-btn');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', () => {
        this.resolveComment(commentId);
      });
    }

    // Delete comment
    const deleteBtn = commentElement.querySelector('.delete-comment-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteComment(commentId);
      });
    }

    // Reply to comment
    const replyBtn = commentElement.querySelector('.reply-to-comment-btn');
    const replyForm = commentElement.querySelector('.sidebar-comment-reply-form');
    const replyInput = commentElement.querySelector('.reply-input');
    const sendReplyBtn = commentElement.querySelector('.send-reply-btn');
    const cancelReplyBtn = commentElement.querySelector('.cancel-reply-btn');

    if (replyBtn && replyForm && replyInput && sendReplyBtn && cancelReplyBtn) {
      replyBtn.addEventListener('click', () => {
        replyForm.style.display = 'block';
        replyInput.focus();
      });

      sendReplyBtn.addEventListener('click', () => {
        const replyText = replyInput.value.trim();
        if (replyText) {
          this.addReplyToComment(commentId, replyText);
          replyInput.value = '';
          replyForm.style.display = 'none';
        }
      });

      cancelReplyBtn.addEventListener('click', () => {
        replyInput.value = '';
        replyForm.style.display = 'none';
      });

      // Allow Enter to send reply
      replyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendReplyBtn.click();
        }
      });
    }

    // Click on selected text preview to highlight in editor
    const previewText = commentElement.querySelector('.preview-text');
    if (previewText) {
      previewText.addEventListener('click', () => {
        this.highlightTextInEditor(comment.selectedText);
      });
    }
  }

  // Resolve a comment
  resolveComment(commentId) {
    if (state.comments[commentId]) {
      state.comments[commentId].isResolved = true;
      
      // Hide floating annotation if it exists
      const floatingAnnotation = document.getElementById(commentId);
      if (floatingAnnotation) {
        floatingAnnotation.style.display = 'none';
      }
      
      // Update UI
      this.renderComments();
      
      // Trigger save
      if (window.documentManager) {
        window.documentManager.onContentChange();
      }
    }
  }

  // Delete a comment
  deleteComment(commentId) {
    if (confirm('Are you sure you want to delete this comment?')) {
      // Remove highlights
      const highlights = document.querySelectorAll(`.text-comment-highlight[data-comment-id="${commentId}"]`);
      highlights.forEach(highlight => {
        highlight.replaceWith(document.createTextNode(highlight.textContent));
      });
      
      // Remove floating annotation if it exists
      const floatingAnnotation = document.getElementById(commentId);
      if (floatingAnnotation) {
        floatingAnnotation.remove();
      }
      
      // Remove from state
      delete state.comments[commentId];
      
      // Update UI
      this.renderComments();
      
      // Trigger save
      if (window.documentManager) {
        window.documentManager.onContentChange();
      }
    }
  }

  // Add a reply to a comment
  addReplyToComment(commentId, replyText) {
    if (!state.comments[commentId]) return;

    const currentUser = getCurrentUser();
    const reply = {
      id: `reply-${Date.now()}`,
      content: replyText,
      author: currentUser ? currentUser.id : 'anonymous',
      authorName: currentUser ? currentUser.name : 'Anonymous',
      authorEmoji: currentUser ? currentUser.emoji : '👤',
      authorColor: currentUser ? currentUser.color : '#666666',
      timestamp: new Date().toISOString()
    };

    if (!state.comments[commentId].messages) {
      state.comments[commentId].messages = [];
    }
    
    state.comments[commentId].messages.push(reply);
    
    // Update UI
    this.renderComments();
    
    // Update floating annotation if it exists
    const floatingAnnotation = document.getElementById(commentId);
    if (floatingAnnotation) {
      import('./annotations.js').then(({ updateAnnotationMessagesUI }) => {
        updateAnnotationMessagesUI(commentId);
      }).catch(error => {
        console.warn('Could not update floating annotation:', error);
      });
    }
    
    // Trigger save
    if (window.documentManager) {
      window.documentManager.onContentChange();
    }
  }

  // Highlight text in the editor
  highlightTextInEditor(selectedText) {
    // Find the text in the current editor and highlight it
    const templateEditor = document.querySelector('.template-editor');
    if (templateEditor && selectedText) {
      // Simple text search and highlight
      const textContent = templateEditor.textContent;
      const index = textContent.indexOf(selectedText);
      
      if (index !== -1) {
        // Create a temporary highlight
        const range = document.createRange();
        const textNodes = this.getTextNodes(templateEditor);
        
        let currentIndex = 0;
        for (const node of textNodes) {
          const nodeLength = node.textContent.length;
          if (currentIndex + nodeLength > index) {
            const startOffset = index - currentIndex;
            const endOffset = Math.min(startOffset + selectedText.length, nodeLength);
            
            range.setStart(node, startOffset);
            range.setEnd(node, endOffset);
            
            // Scroll to the highlighted text
            range.getBoundingClientRect();
            templateEditor.scrollTop = templateEditor.scrollTop + range.getBoundingClientRect().top - 100;
            
            // Clear any existing selection
            window.getSelection().removeAllRanges();
            
            // Select the text
            window.getSelection().addRange(range);
            
            break;
          }
          currentIndex += nodeLength;
        }
      }
    }
  }

  // Helper to get all text nodes in an element
  getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    
    return textNodes;
  }

  // Add a new comment to the sidebar
  addComment(commentData) {
    // The comment should already be in state.comments
    // Just re-render to show the new comment
    this.renderComments();
    
    // Show the sidebar if it's collapsed
    const sidebar = document.querySelector('#integrated-sidebar');
    if (sidebar && sidebar.classList.contains('sidebar-collapsed')) {
      sidebar.classList.remove('sidebar-collapsed');
    }
  }

  // Update comment visibility based on mode
  updateVisibility() {
    this.renderComments();
  }
}

// Export singleton instance
export const sidebarComments = new SidebarComments(); 