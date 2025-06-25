// Task Manager Module - Handles task management in the sidebar
import { state, getElements } from './state.js';
import { escapeHtml, formatTimestamp } from './utils.js';
import { getCurrentUser } from './auth.js';

// Task management for sidebar
export class TaskManager {
  constructor() {
    this.tasksList = null;
    this.isInitialized = false;
    this.currentDocumentId = null;
    this.tasks = [];
    this.apiBaseUrl = 'http://127.0.0.1:5000';
  }

  // Initialize the task manager system
  init(container) {
    if (this.isInitialized) return;
    
    this.tasksList = container.querySelector('#sidebar-tasks-list');
    if (!this.tasksList) {
      console.warn('Sidebar tasks list not found');
      return;
    }

    this.isInitialized = true;
    this.setupEventListeners();
    this.renderTasks();
    
    console.log('✅ Task Manager initialized');
  }

  // Set the current document ID for task filtering
  setCurrentDocument(documentId) {
    this.currentDocumentId = documentId;
    this.loadTasksForDocument();
  }

  // Setup event listeners for task management
  setupEventListeners() {
    // Listen for task creation button clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('create-task-btn')) {
        this.showCreateTaskForm();
      }
      
      if (e.target.classList.contains('close-create-task-form')) {
        this.hideCreateTaskForm();
      }
      
      if (e.target.classList.contains('submit-create-task')) {
        this.createTask();
      }
    });
  }

  // Load tasks for the current document
  async loadTasksForDocument() {
    if (!this.currentDocumentId) return;

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks?document_id=${this.currentDocumentId}`);
      const result = await response.json();
      
      if (result.success) {
        this.tasks = result.tasks;
        this.renderTasks();
      } else {
        console.error('Failed to load tasks:', result.error);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  // Render all tasks in the sidebar
  renderTasks() {
    if (!this.tasksList) return;

    if (this.tasks.length === 0) {
      this.tasksList.innerHTML = `
        <div class="sidebar-tasks-empty">
          <p class="sidebar-placeholder">No tasks yet.</p>
          <button class="create-task-btn btn-primary">➕ Create Task</button>
        </div>
      `;
      return;
    }

    // Sort tasks by priority and creation date
    const sortedTasks = [...this.tasks].sort((a, b) => {
      const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    this.tasksList.innerHTML = `
      <div class="sidebar-tasks-header">
        <button class="create-task-btn btn-primary">➕ Create Task</button>
      </div>
      <div class="sidebar-tasks-list">
        ${sortedTasks.map(task => this.createTaskElement(task)).join('')}
      </div>
    `;

    // Add event listeners to task elements
    this.addTaskEventListeners();
  }

  // Create a single task element for the sidebar
  createTaskElement(task) {
    const priorityColors = {
      'urgent': '#ff4444',
      'high': '#ff8800',
      'medium': '#ffaa00',
      'low': '#44aa44'
    };

    const statusColors = {
      'pending': '#888888',
      'in_progress': '#0088ff',
      'completed': '#44aa44',
      'blocked': '#ff4444'
    };

    const priorityColor = priorityColors[task.priority] || '#888888';
    const statusColor = statusColors[task.status] || '#888888';

    const subtasksCompleted = task.subtasks ? task.subtasks.filter(st => st.completed).length : 0;
    const subtasksTotal = task.subtasks ? task.subtasks.length : 0;
    const subtaskProgress = subtasksTotal > 0 ? `${subtasksCompleted}/${subtasksTotal}` : '';

    const commentsCount = task.comments ? task.comments.length : 0;

    return `
      <div class="sidebar-task" data-task-id="${task.id}">
        <div class="task-header">
          <div class="task-priority" style="background-color: ${priorityColor}"></div>
          <div class="task-status" style="background-color: ${statusColor}"></div>
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-actions">
            <button class="edit-task-btn" title="Edit task">✏️</button>
            <button class="delete-task-btn" title="Delete task">🗑️</button>
          </div>
        </div>
        
        <div class="task-content">
          <div class="task-description">${escapeHtml(task.description)}</div>
          
          ${task.assignee ? `
            <div class="task-assignee">
              <span class="assignee-label">Assigned to:</span>
              <span class="assignee-name">${escapeHtml(task.assignee)}</span>
            </div>
          ` : ''}
          
          ${task.tags && task.tags.length > 0 ? `
            <div class="task-tags">
              ${task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          
          ${subtaskProgress ? `
            <div class="task-subtasks">
              <span class="subtasks-progress">${subtaskProgress} subtasks</span>
            </div>
          ` : ''}
          
          ${commentsCount > 0 ? `
            <div class="task-comments">
              <span class="comments-count">${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="task-footer">
          <span class="task-time">${formatTimestamp(task.created_at)}</span>
          <div class="task-status-actions">
            <button class="status-btn pending-btn" data-status="pending" title="Mark as pending">⏳</button>
            <button class="status-btn progress-btn" data-status="in_progress" title="Mark as in_progress">🔄</button>
            <button class="status-btn completed-btn" data-status="completed" title="Mark as completed">✅</button>
            <button class="status-btn blocked-btn" data-status="blocked" title="Mark as blocked">🚫</button>
          </div>
        </div>
        
        <div class="task-details" style="display: none;">
          <div class="task-subtasks-section">
            <h4>Subtasks</h4>
            <div class="subtasks-list">
              ${task.subtasks ? task.subtasks.map(subtask => `
                <div class="subtask-item" data-subtask-id="${subtask.id}">
                  <input type="checkbox" class="subtask-checkbox" ${subtask.completed ? 'checked' : ''}>
                  <span class="subtask-title">${escapeHtml(subtask.title)}</span>
                  <button class="delete-subtask-btn" title="Delete subtask">🗑️</button>
                </div>
              `).join('') : '<p>No subtasks</p>'}
            </div>
            <div class="add-subtask-form">
              <input type="text" class="subtask-input" placeholder="Add subtask...">
              <button class="add-subtask-btn">Add</button>
            </div>
          </div>
          
          <div class="task-comments-section">
            <h4>Comments</h4>
            <div class="comments-list">
              ${task.comments ? task.comments.map(comment => `
                <div class="comment-item">
                  <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author)}</span>
                    <span class="comment-time">${formatTimestamp(comment.created_at)}</span>
                  </div>
                  <div class="comment-content">${escapeHtml(comment.content)}</div>
                </div>
              `).join('') : '<p>No comments</p>'}
            </div>
            <div class="add-comment-form">
              <textarea class="comment-input" placeholder="Add comment..."></textarea>
              <button class="add-comment-btn">Add</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Add event listeners to task elements
  addTaskEventListeners() {
    const taskElements = this.tasksList.querySelectorAll('.sidebar-task');
    
    taskElements.forEach(taskElement => {
      const taskId = taskElement.dataset.taskId;
      
      // Edit task
      const editBtn = taskElement.querySelector('.edit-task-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          this.showEditTaskForm(taskId);
        });
      }

      // Delete task
      const deleteBtn = taskElement.querySelector('.delete-task-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          this.deleteTask(taskId);
        });
      }

      // Status buttons
      const statusBtns = taskElement.querySelectorAll('.status-btn');
      statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const status = btn.dataset.status;
          this.updateTaskStatus(taskId, status);
        });
      });

      // Toggle task details
      taskElement.addEventListener('click', (e) => {
        if (!e.target.closest('.task-actions') && !e.target.closest('.task-status-actions')) {
          this.toggleTaskDetails(taskElement);
        }
      });

      // Subtask management
      this.setupSubtaskListeners(taskElement, taskId);
      
      // Comment management
      this.setupCommentListeners(taskElement, taskId);
    });
  }

  // Setup subtask event listeners
  setupSubtaskListeners(taskElement, taskId) {
    const subtaskCheckboxes = taskElement.querySelectorAll('.subtask-checkbox');
    const addSubtaskBtn = taskElement.querySelector('.add-subtask-btn');
    const subtaskInput = taskElement.querySelector('.subtask-input');

    // Subtask completion
    subtaskCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const subtaskId = checkbox.closest('.subtask-item').dataset.subtaskId;
        this.updateSubtask(taskId, subtaskId, checkbox.checked);
      });
    });

    // Add subtask
    if (addSubtaskBtn && subtaskInput) {
      addSubtaskBtn.addEventListener('click', () => {
        const title = subtaskInput.value.trim();
        if (title) {
          this.addSubtask(taskId, title);
          subtaskInput.value = '';
        }
      });

      subtaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const title = subtaskInput.value.trim();
          if (title) {
            this.addSubtask(taskId, title);
            subtaskInput.value = '';
          }
        }
      });
    }

    // Delete subtask
    const deleteSubtaskBtns = taskElement.querySelectorAll('.delete-subtask-btn');
    deleteSubtaskBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const subtaskId = btn.closest('.subtask-item').dataset.subtaskId;
        this.deleteSubtask(taskId, subtaskId);
      });
    });
  }

  // Setup comment event listeners
  setupCommentListeners(taskElement, taskId) {
    const addCommentBtn = taskElement.querySelector('.add-comment-btn');
    const commentInput = taskElement.querySelector('.comment-input');

    if (addCommentBtn && commentInput) {
      addCommentBtn.addEventListener('click', () => {
        const content = commentInput.value.trim();
        if (content) {
          this.addComment(taskId, content);
          commentInput.value = '';
        }
      });

      commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const content = commentInput.value.trim();
          if (content) {
            this.addComment(taskId, content);
            commentInput.value = '';
          }
        }
      });
    }
  }

  // Toggle task details visibility
  toggleTaskDetails(taskElement) {
    const details = taskElement.querySelector('.task-details');
    if (details) {
      details.style.display = details.style.display === 'none' ? 'block' : 'none';
    }
  }

  // Show create task form
  showCreateTaskForm() {
    const formHtml = `
      <div class="create-task-form">
        <h4>Create New Task</h4>
        <div class="form-group">
          <label>Title:</label>
          <input type="text" class="task-title-input" placeholder="Enter task title...">
        </div>
        <div class="form-group">
          <label>Description:</label>
          <textarea class="task-description-input" placeholder="Enter task description..."></textarea>
        </div>
        <div class="form-group">
          <label>Priority:</label>
          <select class="task-priority-input">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="form-group">
          <label>Assignee:</label>
          <input type="text" class="task-assignee-input" placeholder="Enter assignee...">
        </div>
        <div class="form-group">
          <label>Tags:</label>
          <input type="text" class="task-tags-input" placeholder="Enter tags (comma separated)...">
        </div>
        <div class="form-actions">
          <button class="submit-create-task btn-primary">Create Task</button>
          <button class="close-create-task-form btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    this.tasksList.innerHTML = formHtml;
  }

  // Hide create task form
  hideCreateTaskForm() {
    this.renderTasks();
  }

  // Create a new task
  async createTask() {
    const titleInput = this.tasksList.querySelector('.task-title-input');
    const descriptionInput = this.tasksList.querySelector('.task-description-input');
    const priorityInput = this.tasksList.querySelector('.task-priority-input');
    const assigneeInput = this.tasksList.querySelector('.task-assignee-input');
    const tagsInput = this.tasksList.querySelector('.task-tags-input');

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const priority = priorityInput.value;
    const assignee = assigneeInput.value.trim();
    const tags = tagsInput.value.trim().split(',').map(tag => tag.trim()).filter(tag => tag);

    if (!title || !description) {
      alert('Title and description are required');
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: this.currentDocumentId,
          title,
          description,
          priority,
          assignee: assignee || undefined,
          tags: tags.length > 0 ? tags : undefined,
          created_by: getCurrentUser() || 'default_user'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.tasks.push(result.task);
        this.renderTasks();
      } else {
        alert('Failed to create task: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Error creating task');
    }
  }

  // Update task status
  async updateTaskStatus(taskId, status) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.tasks[taskIndex] = result.task;
          this.renderTasks();
        }
      } else {
        alert('Failed to update task: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Error updating task');
    }
  }

  // Delete task
  async deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        this.renderTasks();
      } else {
        alert('Failed to delete task: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Error deleting task');
    }
  }

  // Add subtask
  async addSubtask(taskId, title) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title })
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.tasks[taskIndex].subtasks.push(result.subtask);
          this.renderTasks();
        }
      } else {
        alert('Failed to add subtask: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding subtask:', error);
      alert('Error adding subtask');
    }
  }

  // Update subtask
  async updateSubtask(taskId, subtaskId, completed) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed })
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          const subtaskIndex = this.tasks[taskIndex].subtasks.findIndex(st => st.id === subtaskId);
          if (subtaskIndex !== -1) {
            this.tasks[taskIndex].subtasks[subtaskIndex] = result.subtask;
            this.renderTasks();
          }
        }
      } else {
        alert('Failed to update subtask: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating subtask:', error);
      alert('Error updating subtask');
    }
  }

  // Delete subtask
  async deleteSubtask(taskId, subtaskId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.tasks[taskIndex].subtasks = this.tasks[taskIndex].subtasks.filter(st => st.id !== subtaskId);
          this.renderTasks();
        }
      } else {
        alert('Failed to delete subtask: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting subtask:', error);
      alert('Error deleting subtask');
    }
  }

  // Add comment
  async addComment(taskId, content) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content,
          author: getCurrentUser() || 'default_user'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.tasks[taskIndex].comments.push(result.comment);
          this.renderTasks();
        }
      } else {
        alert('Failed to add comment: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Error adding comment');
    }
  }

  // Show edit task form
  showEditTaskForm(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Create edit form HTML
    const editFormHtml = `
      <div class="task-edit-form">
        <h4>Edit Task</h4>
        <form id="edit-task-form-${taskId}">
          <div class="form-group">
            <label for="edit-title-${taskId}">Title:</label>
            <input type="text" id="edit-title-${taskId}" value="${task.title}" required>
          </div>
          <div class="form-group">
            <label for="edit-description-${taskId}">Description:</label>
            <textarea id="edit-description-${taskId}" rows="3">${task.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label for="edit-priority-${taskId}">Priority:</label>
            <select id="edit-priority-${taskId}">
              <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-assignee-${taskId}">Assignee:</label>
            <input type="text" id="edit-assignee-${taskId}" value="${task.assignee || ''}" placeholder="Enter assignee name">
          </div>
          <div class="form-group">
            <label for="edit-tags-${taskId}">Tags:</label>
            <input type="text" id="edit-tags-${taskId}" value="${(task.tags || []).join(', ')}" placeholder="Enter tags separated by commas">
          </div>
          <div class="form-group">
            <label for="edit-status-${taskId}">Status:</label>
            <select id="edit-status-${taskId}">
              <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>pending</option>
              <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>in_progress</option>
              <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>completed</option>
              <option value="blocked" ${task.status === 'blocked' ? 'selected' : ''}>blocked</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Update Task</button>
            <button type="button" class="btn btn-secondary" onclick="this.closest('.task-edit-form').remove()">Cancel</button>
          </div>
        </form>
      </div>
    `;

    // Find the task element and replace its content with the edit form
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskElement) {
      const taskContent = taskElement.querySelector('.task-content');
      if (taskContent) {
        taskContent.innerHTML = editFormHtml;
        
        // Add event listener for form submission
        const form = document.getElementById(`edit-task-form-${taskId}`);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.updateTask(taskId);
        });
      }
    }
  }

  // Update task
  async updateTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const title = document.getElementById(`edit-title-${taskId}`).value.trim();
    const description = document.getElementById(`edit-description-${taskId}`).value.trim();
    const priority = document.getElementById(`edit-priority-${taskId}`).value;
    const assignee = document.getElementById(`edit-assignee-${taskId}`).value.trim();
    const tags = document.getElementById(`edit-tags-${taskId}`).value.trim().split(',').map(t => t.trim()).filter(t => t);
    const status = document.getElementById(`edit-status-${taskId}`).value;

    if (!title) {
      alert('Title is required');
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description || undefined,
          priority,
          assignee: assignee || undefined,
          tags: tags.length > 0 ? tags : undefined,
          status
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.tasks[taskIndex] = result.task;
          this.renderTasks();
        }
      } else {
        alert('Failed to update task: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Error updating task');
    }
  }
} 