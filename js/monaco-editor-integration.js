/**
 * Monaco Editor Integration Module
 * Replaces contenteditable divs with Monaco Editor instances for better code editing experience
 */

// We'll load Monaco Editor dynamically for better compatibility with Electron
let monaco = null;

class MonacoEditorIntegration {
  constructor() {
    this.editors = new Map(); // Store editor instances by element ID
    this.isInitialized = false;
  }

  /**
   * Initialize Monaco Editor environment
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Load Monaco Editor dynamically
      if (!monaco) {
        console.log('Loading Monaco Editor...');
        
        // Set up the Monaco environment before loading
        window.MonacoEnvironment = {
          getWorkerUrl: () => {
            // For simplicity in Electron, we'll use a data URL approach
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
              self.MonacoEnvironment = { baseUrl: './node_modules/monaco-editor/min/' };
              importScripts('./node_modules/monaco-editor/min/vs/base/worker/workerMain.js');
            `)}`;
          }
        };

        // Import Monaco Editor dynamically
        const monacoModule = await import('../node_modules/monaco-editor/esm/vs/editor/editor.main.js');
        monaco = monacoModule;
        console.log('✅ Monaco Editor loaded successfully');
      }

      this.isInitialized = true;
      console.log('✅ Monaco Editor initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Monaco Editor:', error);
      console.log('📝 Falling back to contenteditable editors');
      // Don't throw the error, just continue without Monaco Editor
      this.isInitialized = false;
    }
  }

  /**
   * Create a Monaco Editor instance for a given element
   * @param {string} elementId - The ID of the element to replace with Monaco Editor
   * @param {Object} options - Configuration options for the editor
   */
  createEditor(elementId, options = {}) {
    if (!monaco) {
      console.warn(`⚠️ Monaco Editor not available, skipping editor creation for '${elementId}'`);
      return null;
    }

    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`❌ Element with ID '${elementId}' not found`);
      return null;
    }

    // Default options for Python code editing
    const defaultOptions = {
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      selectOnLineNumbers: true,
      roundedSelection: false,
      readOnly: false,
      cursorStyle: 'line',
      wordWrap: 'on',
      folding: true,
      foldingHighlight: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      matchBrackets: 'always',
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      snippetSuggestions: 'top',
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false
      }
    };

    const editorOptions = { ...defaultOptions, ...options };

    // Get existing content from the element
    let initialValue = '';
    if (element.innerHTML) {
      // Convert HTML content back to plain text
      initialValue = element.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    } else if (element.textContent) {
      initialValue = element.textContent;
    }

    // Clear the element content
    element.innerHTML = '';
    element.style.height = options.height || '300px';
    element.style.border = '1px solid #d0d0d0';
    element.style.borderRadius = '4px';

    try {
      // Create Monaco Editor instance
      const editor = monaco.editor.create(element, {
        ...editorOptions,
        value: initialValue
      });

      // Store the editor instance
      this.editors.set(elementId, editor);

      // Add change listener to sync with original element behavior
      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        // Store the current value as a data attribute for easy access
        element.setAttribute('data-editor-value', value);
        
        // Trigger a custom event for other parts of the application
        element.dispatchEvent(new CustomEvent('monaco-editor-change', {
          detail: { value, editor }
        }));
      });

      console.log(`✅ Monaco Editor created for element '${elementId}'`);
      return editor;
    } catch (error) {
      console.error(`❌ Failed to create Monaco Editor for '${elementId}':`, error);
      return null;
    }
  }

  /**
   * Get editor instance by element ID
   * @param {string} elementId - The ID of the element
   * @returns {Object|null} - Monaco Editor instance or null
   */
  getEditor(elementId) {
    return this.editors.get(elementId) || null;
  }

  /**
   * Set content of a Monaco Editor
   * @param {string} elementId - The ID of the element
   * @param {string} content - The content to set
   */
  setContent(elementId, content) {
    if (!monaco) {
      console.warn(`⚠️ Monaco Editor not available for setContent('${elementId}')`);
      return false;
    }

    const editor = this.getEditor(elementId);
    if (editor) {
      editor.setValue(content);
      return true;
    }
    return false;
  }

  /**
   * Get content from a Monaco Editor
   * @param {string} elementId - The ID of the element
   * @returns {string} - The current content
   */
  getContent(elementId) {
    const editor = this.getEditor(elementId);
    if (editor) {
      return editor.getValue();
    }
    
    // Fallback to data attribute
    const element = document.getElementById(elementId);
    if (element) {
      return element.getAttribute('data-editor-value') || '';
    }
    
    return '';
  }

  /**
   * Dispose of a Monaco Editor instance
   * @param {string} elementId - The ID of the element
   */
  disposeEditor(elementId) {
    const editor = this.editors.get(elementId);
    if (editor) {
      editor.dispose();
      this.editors.delete(elementId);
      console.log(`🗑️ Monaco Editor disposed for element '${elementId}'`);
    }
  }

  /**
   * Dispose of all Monaco Editor instances
   */
  disposeAll() {
    for (const [elementId, editor] of this.editors) {
      editor.dispose();
      console.log(`🗑️ Monaco Editor disposed for element '${elementId}'`);
    }
    this.editors.clear();
  }

  /**
   * Replace a contenteditable element with Monaco Editor
   * @param {string} elementId - The ID of the contenteditable element
   * @param {Object} options - Configuration options
   */
  replaceContentEditable(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`❌ Element with ID '${elementId}' not found`);
      return null;
    }

    // Store original attributes for potential restoration
    const originalContentEditable = element.getAttribute('contenteditable');
    const originalSpellCheck = element.getAttribute('spellcheck');
    const originalClasses = element.className;

    try {
      // Try to create Monaco Editor first
      const editor = this.createEditor(elementId, options);
      
      if (editor) {
        // Only remove contenteditable if Monaco Editor was successfully created
        element.removeAttribute('contenteditable');
        element.removeAttribute('spellcheck');
        element.classList.remove('source-editor', 'code-editor');
        element.classList.add('monaco-editor-container');
        console.log(`✅ Successfully replaced contenteditable with Monaco Editor for '${elementId}'`);
        return editor;
      } else {
        // Monaco Editor creation failed, keep element as contenteditable
        console.log(`⚠️ Monaco Editor creation failed for '${elementId}', keeping as contenteditable`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error replacing contenteditable for '${elementId}':`, error);
      
      // Restore original attributes if something went wrong
      if (originalContentEditable) {
        element.setAttribute('contenteditable', originalContentEditable);
      }
      if (originalSpellCheck) {
        element.setAttribute('spellcheck', originalSpellCheck);
      }
      element.className = originalClasses;
      
      return null;
    }
  }

  /**
   * Ensure an element is editable (either as Monaco Editor or contenteditable)
   * @param {string} elementId - The ID of the element to make editable
   * @param {Object} options - Configuration options
   */
  ensureEditable(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`⚠️ Element with ID '${elementId}' not found for ensureEditable`);
      return false;
    }

    // If we already have a Monaco Editor for this element, it's editable
    if (this.editors.has(elementId)) {
      console.log(`✅ Element '${elementId}' already has Monaco Editor`);
      return true;
    }

    // Try to create Monaco Editor if available
    if (this.isInitialized && monaco) {
      const editor = this.replaceContentEditable(elementId, options);
      if (editor) {
        console.log(`✅ Created Monaco Editor for '${elementId}'`);
        return true;
      }
    }

    // Fallback: ensure contenteditable is enabled
    if (!element.hasAttribute('contenteditable') || element.getAttribute('contenteditable') !== 'true') {
      element.setAttribute('contenteditable', 'true');
      console.log(`✅ Ensured '${elementId}' is contenteditable`);
    }

    return true;
  }

  /**
   * Auto-detect and replace common code editor elements
   */
  autoReplaceCodeEditors() {
    // Only proceed if Monaco Editor is properly initialized
    if (!this.isInitialized || !monaco) {
      console.log(`ℹ️ Monaco Editor not available, skipping auto-replacement. Elements will remain contenteditable.`);
      return 0;
    }

    const codeEditorSelectors = [
      '#embedded-tool-code',
      '#generated-code-editor',
      '.source-editor[contenteditable="true"]',
      '.code-editor[contenteditable="true"]'
    ];

    let replacedCount = 0;
    let attemptedCount = 0;
    
    codeEditorSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.id && !this.editors.has(element.id)) {
          attemptedCount++;
          const options = {};
          
          // Customize options based on element
          if (element.id === 'generated-code-editor') {
            options.theme = 'vs-dark';
            options.readOnly = false;
          }
          
          // Ensure the element remains editable if Monaco replacement fails
          if (!element.hasAttribute('contenteditable')) {
            element.setAttribute('contenteditable', 'true');
          }
          
          if (this.replaceContentEditable(element.id, options)) {
            replacedCount++;
          }
        }
      });
    });

    if (attemptedCount > 0) {
      console.log(`📊 Auto-replacement results: ${replacedCount}/${attemptedCount} elements successfully upgraded to Monaco Editor`);
      if (replacedCount < attemptedCount) {
        console.log(`ℹ️ ${attemptedCount - replacedCount} elements remain as contenteditable (fallback)`);
      }
    }
    
    return replacedCount;
  }
}

// Create singleton instance
const monacoEditorIntegration = new MonacoEditorIntegration();

// Initialize and export
export async function initMonacoEditor() {
  try {
    await monacoEditorIntegration.init();
    
    // Make globally available
    window.monacoEditorIntegration = monacoEditorIntegration;
    
    if (monacoEditorIntegration.isInitialized) {
      console.log('✅ Monaco Editor Integration module initialized successfully');
      
      // Auto-replace existing code editors only if Monaco is working
      setTimeout(() => {
        monacoEditorIntegration.autoReplaceCodeEditors();
      }, 100);
    } else {
      console.log('⚠️ Monaco Editor Integration initialized but Monaco Editor not available - using contenteditable fallback');
      
      // Ensure all code editors remain contenteditable
      setTimeout(() => {
        const codeEditorSelectors = [
          '#embedded-tool-code',
          '#generated-code-editor',
          '.source-editor',
          '.code-editor'
        ];
        
        codeEditorSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            if (!element.hasAttribute('contenteditable')) {
              element.setAttribute('contenteditable', 'true');
              console.log(`✅ Ensured '${element.id || selector}' remains contenteditable`);
            }
          });
        });
      }, 100);
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize Monaco Editor Integration:', error);
    console.log('📝 All code editors will use contenteditable fallback');
  }
}

export { monacoEditorIntegration };