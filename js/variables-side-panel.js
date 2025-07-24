// Variables Side Panel Manager
import { variablesManager } from './variables.js';
import { executeCodeForAuthorLocal } from './execute_tool_util.js';
import { variableDependencyExecutor } from './variable-dependency-executor.js';

/**
 * Variables Side Panel Manager
 * Handles the new right-side panel UI for variables
 */
class VariablesSidePanel {
  constructor() {
    this.panel = null;
    this.isOpen = false;
    this.currentView = 'overview'; // 'overview' or 'editor'
    this.editingVariableName = null;
    this.selectedText = null;
    this.selectedRange = null;
    this.currentValueOption = null; // 'manual' or 'code'
    this.initialized = false;
    this.floatingButton = null; // Floating suggest variables button
  }

  /**
   * Initialize the side panel
   */
  init(documentContainer = null) {
    console.log('🚀 Initializing Variables Side Panel...');
    console.log('📋 Document container provided:', !!documentContainer);
    
    // Find the panel - either in the specific document container or globally
    let panel = null;
    if (documentContainer) {
      console.log('🔍 Looking for panel in provided container...');
      panel = documentContainer.querySelector('#variables-side-panel');
      console.log('📍 Panel found in container:', !!panel);
    } else {
      console.log('🔍 Looking for panel globally...');
      // Fallback to current active document or global search
      const activeContainer = document.querySelector('.tab-content.active');
      console.log('📍 Active container found:', !!activeContainer);
      
      if (activeContainer) {
        panel = activeContainer.querySelector('#variables-side-panel');
        console.log('📍 Panel found in active container:', !!panel);
      } else {
        panel = document.getElementById('variables-side-panel');
        console.log('📍 Panel found globally:', !!panel);
      }
    }

    if (!panel) {
      console.error('❌ Variables side panel element not found');
      
      // Let's see what elements are available
      console.log('🔍 Available elements with "variables" in ID:');
      const variableElements = document.querySelectorAll('[id*="variables"]');
      variableElements.forEach(el => {
        console.log('  -', el.id, el.className);
      });
      
      console.log('🔍 Available elements with "panel" in class:');
      const panelElements = document.querySelectorAll('[class*="panel"]');
      panelElements.forEach(el => {
        console.log('  -', el.id, el.className);
      });
      
      return;
    }

    console.log('✅ Variables side panel element found:', panel.id);

    // Store the panel reference
    this.panel = panel;

    // Check initial state
    this.isOpen = !this.panel.classList.contains('panel-collapsed');
    console.log('📊 Panel initial state - isOpen:', this.isOpen);

    console.log('🔧 Setting up event listeners...');
    this.setupEventListeners();
    
    console.log('🔧 Setting up variables button listener...');
    this.setupVariablesButtonListener();
    
    console.log('🔧 Setting up text selection listener...');
    this.setupTextSelectionListener();
    
    console.log('🔧 Creating floating button...');
    this.createFloatingButton();
    
    this.initialized = true;
    
    console.log('✅ Variables side panel initialized successfully');
  }

  /**
   * Handle document changes
   */
  onDocumentChange(documentId) {
    // Hide floating button when document changes
    this.hideFloatingButton();
    
    // Close panel if it's open
    if (this.isOpen) {
      this.close();
    }
    
    // Clear any text selection state
    this.selectedText = null;
    this.selectedRange = null;
    
    // Load variables for the new document if panel is opened later
    // The loadVariablesData method will be called when the panel opens
  }

  /**
   * Set up event listeners for the side panel
   */
  setupEventListeners() {
    if (!this.panel) return;

    // Panel close button
    const closeBtn = this.panel.querySelector('#variables-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Add new variable button
    const addBtn = this.panel.querySelector('#add-new-variable');
    if (addBtn) {
      console.log('✅ Found Add Variable button, attaching event listener');
      addBtn.addEventListener('click', () => {
        console.log('Add Variable button clicked');
        // CRITICAL: Clear all editing state before showing editor
        this.editingVariableName = null;
        this.selectedText = null;
        this.selectedRange = null;
        this.currentValueOption = null;
        this.showEditor(); // This will call resetEditorForm()
      });
    } else {
      console.error('❌ Add Variable button not found');
    }

    // Force execute all variables button
    const forceExecuteBtn = this.panel.querySelector('#force-execute-all-btn');
    if (forceExecuteBtn) {
      console.log('✅ Found Force Execute button, attaching event listener');
      forceExecuteBtn.addEventListener('click', () => {
        console.log('Force Execute button clicked');
        this.forceExecuteAllVariables();
      });
    } else {
      console.error('❌ Force Execute button not found');
    }

    // Back to overview button
    const backBtn = this.panel.querySelector('#back-to-overview');
    backBtn?.addEventListener('click', () => this.showOverview());

    // Variable form handling
    this.setupFormEventListeners();

    // Value options management
    this.setupValueOptionsEventListeners();

    // Value management
    this.setupValueEventListeners();

    // Dependencies management
    this.setupDependencyEventListeners();

    // Code generation
    this.setupCodeGenerationEventListeners();

    // Panel actions
    this.setupActionEventListeners();
  }

  /**
   * Set up form event listeners
   */
  setupFormEventListeners() {
    // Auto-generate variable name from description
    const descInput = this.panel.querySelector('#var-description');
    const nameInput = this.panel.querySelector('#var-name');
    
    descInput?.addEventListener('input', (e) => {
      if (!nameInput.value && e.target.value) {
        // Generate variable name from description
        const suggested = e.target.value
          .toLowerCase()
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 20);
        nameInput.value = suggested;
      }
    });

    // Data source selection
    const dataSourceSelect = this.panel.querySelector('#var-data-source');
    dataSourceSelect?.addEventListener('change', (e) => {
      this.handleDataSourceChange(e.target.value);
    });
  }

  /**
   * Set up value options event listeners
   */
  setupValueOptionsEventListeners() {
    const manualValueBtn = this.panel.querySelector('#choose-manual-value');
    const codeGenerationBtn = this.panel.querySelector('#choose-code-generation');
    
    manualValueBtn?.addEventListener('click', () => {
      this.selectValueOption('manual');
    });
    
    codeGenerationBtn?.addEventListener('click', () => {
      this.selectValueOption('code');
    });
  }

  /**
   * Select value option (manual or code generation)
   */
  selectValueOption(option) {
    const manualValueBtn = this.panel.querySelector('#choose-manual-value');
    const codeGenerationBtn = this.panel.querySelector('#choose-code-generation');
    const manualSection = this.panel.querySelector('#manual-value-section');
    const codeSection = this.panel.querySelector('#code-generation-inline');
    
    // Reset button states
    manualValueBtn?.classList.remove('active');
    codeGenerationBtn?.classList.remove('active');
    
    // Hide both sections
    if (manualSection) manualSection.style.display = 'none';
    if (codeSection) codeSection.style.display = 'none';
    
    // Hide execution result display when switching value options
    this.hideExecutionResult();
    
    if (option === 'manual') {
      manualValueBtn?.classList.add('active');
      if (manualSection) manualSection.style.display = 'block';
      this.currentValueOption = 'manual';
    } else if (option === 'code') {
      codeGenerationBtn?.classList.add('active');
      if (codeSection) codeSection.style.display = 'block';
      this.currentValueOption = 'code';
    }
  }

  /**
   * Set up value management event listeners
   */
  setupValueEventListeners() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const saveBtn = this.panel.querySelector('#save-var-value');
    const cancelBtn = this.panel.querySelector('#cancel-var-value');

    valueDisplay?.addEventListener('click', () => {
      this.startValueEditing();
    });

    saveBtn?.addEventListener('click', () => {
      this.saveValue();
    });

    cancelBtn?.addEventListener('click', () => {
      this.cancelValueEditing();
    });
  }

  /**
   * Set up dependency management event listeners
   */
  setupDependencyEventListeners() {
    const addDepBtn = this.panel.querySelector('#add-var-dependency');
    const confirmDepBtn = this.panel.querySelector('#confirm-var-dependency');
    const cancelDepBtn = this.panel.querySelector('#cancel-var-dependency');

    addDepBtn?.addEventListener('click', () => {
      this.showDependencySelector();
    });

    confirmDepBtn?.addEventListener('click', () => {
      this.addSelectedDependency();
    });

    cancelDepBtn?.addEventListener('click', () => {
      this.hideDependencySelector();
    });

    // Handle remove dependency buttons (event delegation)
    const dependenciesList = this.panel.querySelector('#var-dependencies-list');
    dependenciesList?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-dependency-btn')) {
        const dependencyName = e.target.getAttribute('data-dependency-name');
        this.removeDependency(dependencyName);
      }
    });
  }

  /**
   * Set up code generation event listeners
   */
  setupCodeGenerationEventListeners() {
    const generateBtn = this.panel.querySelector('#generate-var-code');
    const testBtn = this.panel.querySelector('#test-var-code');
    const copyBtn = this.panel.querySelector('#copy-code-btn');
    const resultCloseBtn = this.panel.querySelector('#result-close-btn');

    generateBtn?.addEventListener('click', () => {
      this.generateCode();
    });

    testBtn?.addEventListener('click', () => {
      this.testCode();
    });

    copyBtn?.addEventListener('click', () => {
      this.copyCode();
    });

    // Result close button
    resultCloseBtn?.addEventListener('click', () => {
      this.hideExecutionResult();
    });

    // Set up code editor listeners - simpler approach to avoid cursor issues
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    
    // Save changes on input but don't re-highlight immediately
    codeEditor?.addEventListener('input', () => {
      this.saveCodeEditorChanges();
    });

    // Apply syntax highlighting when user stops editing
    codeEditor?.addEventListener('blur', () => {
      this.applyDeferredSyntaxHighlighting();
    });

    codeEditor?.addEventListener('focus', () => {
      this.prepareEditorForEditing();
    });
  }

  /**
   * Save code editor changes without applying syntax highlighting
   */
  saveCodeEditorChanges() {
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    if (codeEditor) {
      // Get the plain text content (strip HTML)
      const plainText = codeEditor.textContent || '';
      
      // Update the stored code immediately
      codeEditor.setAttribute('data-code', plainText);
    }
  }

  /**
   * Prepare editor for editing - convert to plain text
   */
  prepareEditorForEditing() {
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    if (codeEditor) {
      const currentCode = codeEditor.getAttribute('data-code') || codeEditor.textContent || '';
      
      // If the editor has syntax highlighting, convert to plain text for editing
      if (codeEditor.innerHTML.includes('<span')) {
        codeEditor.textContent = currentCode;
        codeEditor.setAttribute('data-editing', 'true');
      }
    }
  }

  /**
   * Apply syntax highlighting after editing is complete
   */
  applyDeferredSyntaxHighlighting() {
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    if (codeEditor) {
      const currentCode = codeEditor.getAttribute('data-code') || codeEditor.textContent || '';
      
      if (currentCode && codeEditor.getAttribute('data-editing') === 'true') {
        // Apply syntax highlighting
        const highlighted = this.applySyntaxHighlighting(currentCode);
        codeEditor.innerHTML = highlighted;
        codeEditor.setAttribute('data-last-highlighted', currentCode);
        codeEditor.removeAttribute('data-editing');
      }
    }
  }

  /**
   * Copy generated code to clipboard
   */
  async copyCode() {
    const editor = this.panel.querySelector('#generated-code-editor');
    const code = editor?.getAttribute('data-code') || editor?.textContent?.trim();
    
    if (!code) {
      alert('No code to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      
      // Show feedback
      const copyBtn = this.panel.querySelector('#copy-code-btn');
      const originalText = copyBtn?.textContent;
      if (copyBtn) {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy code:', error);
      alert('Failed to copy code to clipboard');
    }
  }

  /**
   * Set up action button event listeners
   */
  setupActionEventListeners() {
    const saveBtn = this.panel.querySelector('#save-variable');
    const cancelBtn = this.panel.querySelector('#cancel-variable');

    saveBtn?.addEventListener('click', () => {
      this.saveVariable();
    });

    cancelBtn?.addEventListener('click', () => {
      if (this.currentView === 'editor') {
        this.showOverview();
      } else {
        this.close();
      }
    });
  }

  /**
   * Set up Variables button listener to open panel
   */
  setupVariablesButtonListener() {
    // Note: Variables panel toggle is now handled by document-manager.js
    // This method is kept for compatibility but does nothing
    console.log('Variables button listener setup (handled by document manager)');
  }

  /**
   * Create floating "Suggest Variables" button
   */
  createFloatingButton() {
    console.log('🔧 Creating floating suggest variables button...');
    
    try {
      this.floatingButton = document.createElement('div');
      this.floatingButton.className = 'floating-suggest-variables-btn';
      this.floatingButton.innerHTML = `
        <button type="button" class="suggest-btn">
          <span class="btn-text">Suggest Variable</span>
        </button>
      `;
      
      // Style the floating button
      this.floatingButton.style.cssText = `
        position: absolute;
        z-index: 10000;
        display: none;
        pointer-events: auto;
      `;
      
      // Style the inner button
      const button = this.floatingButton.querySelector('.suggest-btn');
      if (button) {
        button.style.cssText = `
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: all 0.2s ease;
          white-space: nowrap;
        `;
        
        // Add hover effects
        button.addEventListener('mouseenter', () => {
          button.style.background = '#1976D2';
          button.style.transform = 'translateY(-1px)';
          button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        });
        
        button.addEventListener('mouseleave', () => {
          button.style.background = '#2196F3';
          button.style.transform = 'translateY(0)';
          button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });
        
        // Handle click
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🎯 Floating button clicked!');
          this.handleSuggestVariablesClick();
        });
        
        console.log('✅ Button event listeners attached');
      } else {
        console.error('❌ Could not find suggest button element');
      }
      
      document.body.appendChild(this.floatingButton);
      console.log('✅ Floating button added to document body');
      
      // Note: Click handling is now done in setupTextSelectionListener
      
      console.log('✅ Floating suggest variables button created successfully');
      
    } catch (error) {
      console.error('❌ Error creating floating button:', error);
    }
  }

  /**
   * Set up text selection listener for suggest variables
   */
  setupTextSelectionListener() {
    console.log('🎧 Setting up text selection listener (using proven working approach)...');
    
    // Use the PROVEN working approach from the original variables.js
    document.addEventListener('mouseup', (e) => {
      console.log('🖱️ Mouse up event detected');
      
      // CRITICAL: Skip if the mouseup event is from clicking the floating button itself
      if (e.target && e.target.closest('.floating-suggest-variables-btn')) {
        console.log('⏭️ Mouse up from floating button click, ignoring');
        return;
      }

      // CRITICAL: Skip if clicking on any button or interactive element in the variables panel
      if (e.target && (
        e.target.closest('.variables-panel-dialog') ||
        e.target.closest('.variables-side-panel') ||
        e.target.tagName === 'BUTTON' ||
        e.target.classList.contains('btn') ||
        e.target.classList.contains('btn-primary') ||
        e.target.classList.contains('btn-secondary') ||
        e.target.closest('button')
      )) {
        console.log('⏭️ Mouse up from button/panel interaction, ignoring');
        this.hideFloatingButton();
        return;
      }

      const selection = window.getSelection();
      
      // Early validation (same as original)  
      if (selection.rangeCount === 0) {
        console.log('❌ No selection range, hiding button');
        this.hideFloatingButton();
        return;
      }
      
      const range = selection.getRangeAt(0);
      
      // CRITICAL FIX: Check if selection is collapsed (just a cursor position, not selected text)
      if (range.collapsed) {
        console.log('❌ Selection is collapsed (just cursor position), hiding button');
        this.hideFloatingButton();
        return;
      }
      
      const selectedText = selection.toString().trim();
      const rect = range.getBoundingClientRect();

      console.log('📝 Selected text:', `"${selectedText}"`);
      console.log('📐 Selection dimensions:', { width: rect.width, height: rect.height });
      
      // Enhanced validation: must have actual text content AND visible dimensions
      if (selectedText.length === 0) {
        console.log('❌ No text content selected, hiding button');
        this.hideFloatingButton();
        return;
      }
      
      // Additional check for meaningful selection size
      if (rect.width < 5 || rect.height < 5) {
        console.log('❌ Selection too small to be meaningful text, hiding button');
        this.hideFloatingButton();
        return;
      }
      
      const isInTemplate = this.isInTemplateContentSimple(selection);
      console.log('🎯 Is in template content:', isInTemplate);
      
      if (!isInTemplate) {
        console.log('❌ Selection not in template content, hiding button');
        this.hideFloatingButton();
        return;
      }
      
      // CRITICAL: Use setTimeout like the original (prevents immediate hiding)
      setTimeout(() => {
        this.handleTextSelection(e);
      }, 10);
    });

    // Click listener with proper exclusions (like original)
    document.addEventListener('click', (e) => {
      // Only hide button on clicks outside both the button and the panel
      if (!e.target.closest('.floating-suggest-variables-btn') && 
          !e.target.closest('.variables-panel-dialog') &&
          !e.target.closest('.variables-side-panel')) {
        console.log('🖱️ Click outside floating button and panel, hiding');
        this.hideFloatingButton();
      }
    });
    
    console.log('✅ Text selection listener set up successfully');
  }

  /**
   * Handle text selection events (adapted from original)
   */
  handleTextSelection(e) {
    console.log('🎯 handleTextSelection called');
    
    // Skip processing if no active document
    if (!window.documentManager?.activeDocumentId) {
      console.log('❌ No active document');
      return;
    }
    
    const selection = window.getSelection();
    
    // Early return if no selection range
    if (selection.rangeCount === 0) {
      console.log('❌ No selection range in handler');
      this.hideFloatingButton();
      return;
    }
    
    const range = selection.getRangeAt(0);
    
    // CRITICAL FIX: Double-check that selection is not collapsed
    if (range.collapsed) {
      console.log('❌ Selection is collapsed in handler, hiding button');
      this.hideFloatingButton();
      return;
    }
    
    const selectedText = selection.toString().trim();
    const rect = range.getBoundingClientRect();
    
    // Enhanced final validation
    if (selectedText.length > 0 && rect.width >= 5 && rect.height >= 5) {
      const isInTemplate = this.isInTemplateContentSimple(selection);
      
      if (isInTemplate) {
        console.log('✅ Valid selection, storing data and showing button');
        this.selectedText = selectedText;
        this.selectedRange = range.cloneRange();
        
        // Always show the button for valid text selections in template content
        this.showFloatingButtonFromEvent(e, rect);
      } else {
        this.hideFloatingButton();
      }
    } else {
      this.hideFloatingButton();
    }
  }

  /**
   * Simplified template content detection
   */
  isInTemplateContentSimple(selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    let elementToCheck = container;
    if (container.nodeType === Node.TEXT_NODE) {
      elementToCheck = container.parentElement;
    }
    
    if (!elementToCheck) return false;
    
    // Simple check for common template containers
    return !!(
      elementToCheck.closest('.template-editor') ||
      elementToCheck.closest('.preview-content') ||
      elementToCheck.closest('.tab-content') ||
      elementToCheck.closest('.document-content')
    );
  }

  // Note: Replaced with isInTemplateContentSimple() method above

  /**
   * Show floating button from mouse event (like original)
   */
  showFloatingButtonFromEvent(mouseEvent, rect) {
    console.log('📌 showFloatingButtonFromEvent called');
    
    if (!this.floatingButton) {
      console.error('❌ No floating button element found!');
      return;
    }
    
    // Use mouse position with offset (like original approach)
    const x = mouseEvent.clientX;
    const y = mouseEvent.clientY;
    
    console.log('📍 Mouse position:', { x, y });
    console.log('📍 Window dimensions:', { width: window.innerWidth, height: window.innerHeight });
    
    // Position with offset from mouse (like original)
    let left = x + 10;
    let top = y - 40;
    
    // Ensure button stays within viewport
    const buttonWidth = 120;
    const buttonHeight = 32;
    
    if (left + buttonWidth > window.innerWidth) {
      left = x - buttonWidth - 10;
    }
    
    if (top < 10) {
      top = y + 10;
    }
    
    left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - buttonHeight - 10));
    
    console.log('📍 Final position:', { left, top });
    
    this.floatingButton.style.left = `${left}px`;
    this.floatingButton.style.top = `${top}px`;
    this.floatingButton.style.display = 'block';
    
    console.log('✅ Floating button positioned and made visible from event');
  }

  /**
   * Show floating button near text selection (fallback method)
   */
  showFloatingButton(selectionRect) {
    console.log('📌 showFloatingButton called with rect:', selectionRect);
    
    if (!this.floatingButton) {
      console.error('❌ No floating button element found!');
      return;
    }
    
    console.log('✅ Floating button element exists');
    
    // Position the button near the selection
    const buttonWidth = 120; // Approximate button width
    const buttonHeight = 32; // Approximate button height
    const offset = 8; // Space between selection and button
    
    // Calculate position - try to show below and to the right of selection
    let left = selectionRect.right + offset;
    let top = selectionRect.bottom + offset;
    
    console.log('📍 Initial position calculation:', { left, top });
    console.log('📍 Window dimensions:', { width: window.innerWidth, height: window.innerHeight });
    
    // Adjust if button would go off screen
    if (left + buttonWidth > window.innerWidth) {
      left = selectionRect.left - buttonWidth - offset; // Show to the left
      console.log('📍 Adjusted left position (off screen):', left);
    }
    
    if (top + buttonHeight > window.innerHeight) {
      top = selectionRect.top - buttonHeight - offset; // Show above
      console.log('📍 Adjusted top position (off screen):', top);
    }
    
    // Ensure button stays within viewport
    left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - buttonHeight - 10));
    
    console.log('📍 Final position:', { left, top });
    
    this.floatingButton.style.left = `${left}px`;
    this.floatingButton.style.top = `${top}px`;
    this.floatingButton.style.display = 'block';
    
    console.log('✅ Floating button positioned and made visible');
    console.log('📌 Button styles applied:', {
      left: this.floatingButton.style.left,
      top: this.floatingButton.style.top,
      display: this.floatingButton.style.display,
      zIndex: this.floatingButton.style.zIndex
    });
  }

  /**
   * Hide floating button
   */
  hideFloatingButton() {
    console.log('🫥 hideFloatingButton called');
    if (this.floatingButton) {
      this.floatingButton.style.display = 'none';
      console.log('✅ Floating button hidden');
    } else {
      console.log('❌ No floating button to hide');
    }
  }

  /**
   * Handle floating button click to suggest variables
   */
  handleSuggestVariablesClick() {
    console.log('✨ Suggest Variables button clicked');
    console.log('📝 Selected text for suggestion:', this.selectedText);
    
    // CRITICAL: Hide the floating button first
    this.hideFloatingButton();
    
    // CRITICAL: Don't clear text selection - we need it for suggestions
    // Only clear internal state that might interfere
    this.editingVariableName = null;
    this.currentValueOption = null;
    
    // Verify we have selected text
    if (!this.selectedText) {
      console.warn('❌ No selected text available for variable suggestion');
      // Try to get current selection as fallback
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        this.selectedText = selection.toString().trim();
        this.selectedRange = selection.getRangeAt(0).cloneRange();
        console.log('🔄 Recovered selected text:', this.selectedText);
      } else {
        alert('Please select text first to suggest a variable');
        return;
      }
    }
    
    // Open the panel and show editor with text selection
    if (this.panel) {
      this.panel.classList.remove('panel-collapsed');
      this.isOpen = true;
      
      // Load variables data first
      this.loadVariablesData();
      
      // Show editor with text selection flag
      this.showEditor(true); // true = from text selection
      
      console.log('✅ Variables panel opened with selected text for suggestion');
    } else {
      console.error('❌ Variables panel not found');
    }
  }

  /**
   * Open the side panel
   */
  open() {
    if (!this.panel) {
      console.error('Panel element not found!');
      return;
    }
    
    if (this.isOpen) {
      return;
    }

    // Hide floating button when panel opens
    this.hideFloatingButton();

    // CRITICAL: Clear all state when opening panel for fresh start
    console.log('🧹 Clearing all state when opening variables panel');
    this.clearAllVariableState();

    this.panel.classList.remove('panel-collapsed');
    this.isOpen = true;
    
    // Load current variables and show overview
    this.loadVariablesData();
    this.showOverview();
    
    // Clear any existing modal dialogs
    this.clearFloatingDialogs();
  }

  /**
   * Close the side panel
   */
  close() {
    if (!this.panel) return;

    this.panel.classList.add('panel-collapsed');
    this.isOpen = false;
    this.currentView = 'overview';
    
    // Hide floating button when panel closes
    this.hideFloatingButton();
    
    // CRITICAL: Clear all state when panel is closed
    console.log('🧹 Clearing all state when closing variables panel');
    this.clearAllVariableState();
  }

  /**
   * Clear any floating dialogs from the old system
   */
  clearFloatingDialogs() {
    // Hide variable dialog if it exists
    if (variablesManager.variableDialog) {
      variablesManager.variableDialog.style.display = 'none';
    }
    
    // Hide variables panel if it exists
    if (variablesManager.variablesPanel) {
      variablesManager.variablesPanel.style.display = 'none';
    }
    
    // Hide floating button if it exists
    if (variablesManager.floatingButton) {
      variablesManager.floatingButton.style.display = 'none';
    }
  }

  /**
   * Show overview section
   */
  showOverview() {
    const overview = this.panel.querySelector('.variables-overview');
    const editor = this.panel.querySelector('.variable-editor');
    
    if (overview && editor) {
      overview.style.display = 'block';
      editor.style.display = 'none';
      this.currentView = 'overview';
    }
    
    this.updateVariablesList();
  }

  /**
   * Show editor section
   */
  showEditor(fromTextSelection = false) {
    const overview = this.panel.querySelector('.variables-overview');
    const editor = this.panel.querySelector('.variable-editor');
    
    if (overview && editor) {
      overview.style.display = 'none';
      editor.style.display = 'block';
      this.currentView = 'editor';
    }

    if (fromTextSelection && this.selectedText) {
      this.populateFromTextSelection();
    } else {
      this.resetEditorForm();
    }
  }

  /**
   * Populate editor from text selection
   */
  populateFromTextSelection() {
    if (!this.selectedText) {
      console.warn('No text selected for variable suggestion');
      return;
    }

    console.log('📝 Populating form from text selection:', this.selectedText);

    // CRITICAL: Preserve selected text and range before resetting form
    const preservedText = this.selectedText;
    const preservedRange = this.selectedRange;

    // Reset form first to clear any previous variable data
    this.resetEditorForm();

    // CRITICAL: Restore the preserved text after form reset
    this.selectedText = preservedText;
    this.selectedRange = preservedRange;

    // Show selected text preview
    const preview = this.panel.querySelector('#selected-text-preview');
    const display = this.panel.querySelector('#selected-text-display');
    
    if (preview && display) {
      display.textContent = `"${this.selectedText}"`;
      preview.style.display = 'block';
      console.log('✅ Selected text preview shown:', this.selectedText);
    } else {
      console.warn('❌ Selected text preview elements not found');
    }

    // Get AI suggestions for the variable - this will populate name, description, type, etc.
    console.log('🤖 Getting AI suggestions for selected text:', this.selectedText);
    this.getVariableSuggestions(this.selectedText);
  }

  /**
   * Get AI suggestions for variable creation
   */
  async getVariableSuggestions(text) {
    console.log('🤖 Getting AI suggestions for text:', text);
    
    try {
      // Show loading state
      const nameInput = this.panel.querySelector('#var-name');
      const descInput = this.panel.querySelector('#var-description');
      const typeSelect = this.panel.querySelector('#var-type');
      const formatInput = this.panel.querySelector('#var-format');
      
      if (nameInput && descInput) {
        nameInput.value = 'Generating suggestions...';
        descInput.value = 'AI is analyzing your selection...';
        nameInput.disabled = true;
        descInput.disabled = true;
        if (typeSelect) typeSelect.disabled = true;
        if (formatInput) formatInput.disabled = true;
        console.log('🔄 Loading state shown');
      }

      // Use the existing LLM suggestion method from variables manager
      const templateContent = this.getTemplateContent();
      
      const requestData = {
        template_content: templateContent,
        selected_text: text,
        existing_variables: variablesManager.getVariables(),
        document_id: window.documentManager?.activeDocumentId || 'default'
      };

      console.log('📤 Sending request to LLM API:', requestData);

      const response = await fetch('http://127.0.0.1:5001/api/suggest-variable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      console.log('📥 LLM API response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('📋 LLM API result:', result);
        
        if (result.success && result.suggestion) {
          console.log('✅ Got AI suggestions, filling form');
          this.fillFormWithSuggestions(result.suggestion);
        } else {
          console.warn('⚠️ LLM API returned no suggestions, using basic fallback');
          this.fillFormWithBasicSuggestions(text);
        }
      } else {
        console.warn('⚠️ LLM API request failed, using basic fallback');
        this.fillFormWithBasicSuggestions(text);
      }
    } catch (error) {
      console.error('❌ Error getting AI suggestions:', error);
      this.fillFormWithBasicSuggestions(text);
    } finally {
      // Re-enable form inputs
      const nameInput = this.panel.querySelector('#var-name');
      const descInput = this.panel.querySelector('#var-description');
      const typeSelect = this.panel.querySelector('#var-type');
      const formatInput = this.panel.querySelector('#var-format');
      
      if (nameInput && descInput) {
        nameInput.disabled = false;
        descInput.disabled = false;
        if (typeSelect) typeSelect.disabled = false;
        if (formatInput) formatInput.disabled = false;
        console.log('✅ Form inputs re-enabled');
      }
    }
  }

  /**
   * Get current template content
   */
  getTemplateContent() {
    const activeDocument = document.querySelector('.tab-content.active');
    let templateEditor = null;
    
    if (activeDocument) {
      templateEditor = activeDocument.querySelector('.template-editor');
    }
    
    if (!templateEditor) {
      templateEditor = document.querySelector('.template-editor');
    }
    
    return templateEditor ? (templateEditor.textContent || templateEditor.innerText || '') : '';
  }

  /**
   * Fill form with AI suggestions
   */
  fillFormWithSuggestions(suggestions) {
    console.log('📝 Filling form with AI suggestions:', suggestions);
    
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');

    // CRITICAL: Only populate if suggestions exist and form elements are found
    if (suggestions) {
      if (nameInput) {
        nameInput.value = suggestions.name || '';
        console.log('✅ Set variable name:', suggestions.name);
      }
      if (descInput) {
        descInput.value = suggestions.description || '';
        console.log('✅ Set variable description:', suggestions.description);
      }
      if (typeSelect) {
        typeSelect.value = suggestions.type || 'text';
        console.log('✅ Set variable type:', suggestions.type);
      }
      if (formatInput) {
        formatInput.value = suggestions.format || '';
        console.log('✅ Set variable format:', suggestions.format);
      }
      
      // CRITICAL: Make sure required checkbox is reset to default state
      if (requiredCheck) {
        requiredCheck.checked = true;
        console.log('✅ Set required checkbox to true');
      }
      
      console.log('✅ Form populated successfully with AI suggestions');
    } else {
      console.warn('❌ No suggestions provided to fill form');
      
      // Clear form if no suggestions
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (typeSelect) typeSelect.value = 'text';
      if (formatInput) formatInput.value = '';
      if (requiredCheck) requiredCheck.checked = true;
    }
  }

  /**
   * Fill form with basic suggestions
   */
  fillFormWithBasicSuggestions(text) {
    const suggestions = this.generateBasicSuggestions(text);
    this.fillFormWithSuggestions(suggestions);
  }

  /**
   * Generate basic variable suggestions
   */
  generateBasicSuggestions(text) {
    const suggestions = {
      name: '',
      description: '',
      type: 'text',
      format: ''
    };

    if (text.match(/\$[\d,]+\.?\d*/)) {
      suggestions.type = 'currency';
      suggestions.format = '$#,##0';
      suggestions.name = this.generateVariableName('revenue');
      suggestions.description = 'Revenue Amount';
    } else if (text.match(/\d+\.?\d*%/)) {
      suggestions.type = 'percentage';
      suggestions.format = '0.0%';
      suggestions.name = this.generateVariableName('rate');
      suggestions.description = 'Percentage Rate';
    } else if (text.match(/^\d{1,3}(,\d{3})*\.?\d*$/)) {
      suggestions.type = 'number';
      suggestions.format = '#,##0';
      suggestions.name = this.generateVariableName('count');
      suggestions.description = 'Numeric Value';
    } else {
      suggestions.type = 'text';
      suggestions.name = this.generateVariableName('text');
      suggestions.description = 'Text Content';
    }

    return suggestions;
  }

  /**
   * Generate unique variable name
   */
  generateVariableName(base) {
    const existingVariables = variablesManager.getVariables();
    let counter = 1;
    let name = base;
    
    while (existingVariables[name]) {
      name = `${base}_${counter}`;
      counter++;
    }
    
    return name;
  }

  /**
   * Reset editor form
   */
  resetEditorForm() {
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');
    const preview = this.panel.querySelector('#selected-text-preview');
    const editorTitle = this.panel.querySelector('#editor-title');

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (typeSelect) typeSelect.value = 'text';
    if (formatInput) formatInput.value = '';
    if (requiredCheck) requiredCheck.checked = true;
    if (preview) preview.style.display = 'none';
    if (editorTitle) editorTitle.textContent = 'Create Variable';

    // CRITICAL: Clear all state variables that might persist from previous edits
    this.editingVariableName = null;
    this.selectedText = null;
    this.selectedRange = null;
    this.currentValueOption = null;

    // Reset value options
    this.resetValueOptions();
    
    // Reset other sections
    this.resetValueDisplay();
    this.resetDependencies();
    
    // Clear any data source selection
    const dataSourceSelect = this.panel.querySelector('#var-data-source');
    if (dataSourceSelect) dataSourceSelect.value = '';
    
    // Clear execution result display to prevent showing results from previous variable
    this.hideExecutionResult();
    
    // Force clear any cached execution results for variables that might have been temporarily created during testing
    if (window.variableDependencyExecutor) {
      // Clear any temporary variables that might have been created during code testing
      const tempVariablePattern = /^(text|revenue|rate|count)(_\d+)?$/;
      const allVariables = Array.from(window.variableDependencyExecutor.variables.keys());
      allVariables.forEach(varName => {
        if (tempVariablePattern.test(varName) && !variablesManager.variables.has(varName)) {
          window.variableDependencyExecutor.removeVariable(varName);
        }
      });
    }
  }

  /**
   * Load variables data from variables manager
   */
  async loadVariablesData() {
    // Ensure variables manager is loaded for current document
    if (variablesManager && variablesManager.loadVariables) {
      await variablesManager.loadVariables();
    }
    
    // Only initialize dependency executor once to preserve old values for change detection
    if (!variableDependencyExecutor.isInitialized) {
      const variables = variablesManager.getVariables();
      console.log(`🚀 First-time initialization: Loading ${Object.keys(variables).length} variables into dependency executor...`);
      
      for (const [name, variable] of Object.entries(variables)) {
        console.log(`➕ Initially loading variable ${name} with value: ${variable.value}`);
        await variableDependencyExecutor.addVariable(name, variable, true); // isInitialLoad = true
      }
      
      variableDependencyExecutor.isInitialized = true;
      console.log(`🔧 Dependency executor initialized with ${variableDependencyExecutor.variables.size} variables`);
    } else {
      console.log(`⚪ Dependency executor already initialized, skipping reload to preserve old values`);
    }
    
    // Update the variables list
    this.updateVariablesList();
  }

  /**
   * Execute all variables for template substitution
   */
  async executeAllVariablesForTemplate() {
    try {
      console.log('🚀 Executing all variables for template substitution...');
      
      // First, ensure all invalidated variables are re-executed
      console.log('🔍 Checking for invalidated variables before template execution...');
      const invalidatedResults = await variableDependencyExecutor.executeInvalidatedVariables(true);
      
      if (Object.keys(invalidatedResults).length > 0) {
        console.log(`🔄 Re-executed ${Object.keys(invalidatedResults).length} invalidated variables before template execution`);
      }
      
      // Then execute all variables in dependency order (this will use cached results where appropriate)
      const results = await variableDependencyExecutor.executeVariables();
      
      console.log('✅ All variables executed successfully for template:', results);
      
      // Update variables manager with execution results
      for (const [varName, result] of Object.entries(results)) {
        const variable = variablesManager.variables.get(varName);
        if (variable) {
          variable.value = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        }
      }
      
      await variablesManager.saveVariables();
      return results;
      
    } catch (error) {
      console.error('❌ Error executing variables for template:', error);
      throw new Error(`Failed to execute variables: ${error.message}`);
    }
  }

  /**
   * Get all variable values for template substitution
   */
  async getAllVariableValuesForTemplate() {
    // Ensure all invalidated variables are re-executed before getting values
    await variableDependencyExecutor.executeInvalidatedVariables(true);
    return variableDependencyExecutor.getAllVariableValues();
  }

  /**
   * Force re-execution of all variables
   */
  async forceExecuteAllVariables() {
    try {
      console.log('🚀 Force executing all variables...');
      
      // Show loading state
      const button = document.querySelector('#force-execute-all-btn');
      if (button) {
        button.disabled = true;
        button.textContent = '⏳ Executing All Variables...';
      }
      
      // Execute all variables with force flag
      const results = await variableDependencyExecutor.forceExecuteAllVariables();
      
      console.log('✅ Force execution completed:', results);
      
      // Update variables manager with execution results
      for (const [varName, result] of Object.entries(results)) {
        const variable = variablesManager.variables.get(varName);
        if (variable) {
          variable.value = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        }
      }
      
      await variablesManager.saveVariables();
      
      // Show success message using floating window
      const varCount = Object.keys(results).length;
      if (window.variableDependencyExecutor) {
        window.variableDependencyExecutor.showSimpleCompletionNotification(`All ${varCount} variables executed`);
      }
      
    } catch (error) {
      console.error('❌ Error during force execution:', error);
      alert(`❌ Error executing variables:\n\n${error.message}`);
    } finally {
      // Reset button state
      const button = document.querySelector('#force-execute-all-btn');
      if (button) {
        button.disabled = false;
        button.textContent = '🔄 Re-execute All Variables';
      }
    }
  }

  /**
   * Update variables list in overview (redesigned)
   */
  updateVariablesList() {
    const listContainer = this.panel.querySelector('#variables-quick-list');
    if (!listContainer) {
      console.error('Variables list container not found!');
      return;
    }

    const variables = variablesManager.getVariables();
    listContainer.innerHTML = '';

    if (Object.keys(variables).length === 0) {
      listContainer.innerHTML = '<div class="no-variables-message">No variables defined yet.</div>';
      return;
    }

    console.log(`Displaying ${Object.keys(variables).length} variables in variables panel`);

    // Sort variables: parameters first, then generated variables
    const sortedVariables = Object.entries(variables).sort(([nameA, varA], [nameB, varB]) => {
      const isParameterA = varA.valueOption === 'manual';
      const isParameterB = varB.valueOption === 'manual';
      
      if (isParameterA && !isParameterB) return -1; // A is parameter, B is generated - A comes first
      if (!isParameterA && isParameterB) return 1;  // A is generated, B is parameter - B comes first
      return nameA.localeCompare(nameB); // Same type, sort alphabetically
    });

    sortedVariables.forEach(([name, variable]) => {
      const item = document.createElement('div');
      
      // Determine if this is a parameter (manual) or generated (code) variable
      const isParameter = variable.valueOption === 'manual';
      const variableTypeLabel = isParameter ? 'Parameter' : 'Generated';
      const variableTypeClass = isParameter ? 'parameter' : 'generated';
      
      // Set CSS class based on variable type
      item.className = `variable-expanded-item ${isParameter ? 'parameter-item' : 'generated-item'}`;
      
      // Get current value (could be from execution results or stored value)
      const currentValue = this.getCurrentVariableValue(name, variable);
      const displayValue = this.formatValueForDisplay(currentValue);
      
      item.innerHTML = `
        <div class="variable-header">
          <div class="variable-main">
            <span class="variable-name">${variable.name}</span>
            <span class="variable-type-badge ${variableTypeClass}">${variableTypeLabel}</span>
          </div>
          <div class="variable-actions">
            <button class="edit-variable-btn" data-variable-name="${name}" title="Edit Variable">✏️</button>
            <button class="delete-variable-btn" data-variable-name="${name}" title="Delete Variable">🗑️</button>
          </div>
        </div>
        
        ${isParameter ? `
          <div class="variable-value-section parameter-section">
            <div class="value-display-row">
              <span class="value-label">Value:</span>
              <div class="inline-value-container">
                <div class="inline-value-display" id="inline-value-${name}">
                  ${displayValue}
                </div>
                <div class="inline-value-input-container" id="inline-input-${name}" style="display: none;">
                  <input type="text" class="inline-value-input" value="${currentValue || ''}" placeholder="Enter value...">
                  <div class="inline-actions">
                    <button class="inline-save-btn" data-variable-name="${name}">Save</button>
                    <button class="inline-cancel-btn" data-variable-name="${name}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      `;
      
      // Add event listeners
      this.addVariableItemEventListeners(item, name, variable, isParameter);
      
      listContainer.appendChild(item);
    });
  }

  /**
   * Get current variable value from execution results or stored value
   */
  getCurrentVariableValue(name, variable) {
    // First try to get from execution results
    const executionValue = variableDependencyExecutor.getVariableValue(name);
    if (executionValue !== undefined && executionValue !== null) {
      return executionValue;
    }
    
    // Fall back to stored value
    return variable.value || '';
  }

  /**
   * Format value for display in the UI
   */
  formatValueForDisplay(value) {
    if (value === null || value === undefined) {
      return '<em>No value set</em>';
    }
    
    const stringValue = String(value);
    if (stringValue.length > 50) {
      return stringValue.substring(0, 50) + '...';
    }
    
    return stringValue || '<em>Empty</em>';
  }

  /**
   * Add event listeners to variable list items
   */
  addVariableItemEventListeners(item, name, variable, isParameter) {
    // Edit button click handler
    const editBtn = item.querySelector('.edit-variable-btn');
    editBtn.addEventListener('click', () => {
      this.editVariable(name);
    });
    
    // Delete button click handler
    const deleteBtn = item.querySelector('.delete-variable-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteVariable(name);
    });
    
    // For parameter variables, add inline editing functionality
    if (isParameter) {
      this.addInlineEditingListeners(item, name);
    }
  }

  /**
   * Add inline editing event listeners for parameter variables
   */
  addInlineEditingListeners(item, variableName) {
    const valueDisplay = item.querySelector(`#inline-value-${variableName}`);
    const inputContainer = item.querySelector(`#inline-input-${variableName}`);
    const input = inputContainer?.querySelector('.inline-value-input');
    const saveBtn = item.querySelector('.inline-save-btn');
    const cancelBtn = item.querySelector('.inline-cancel-btn');
    
    // Click on value display to start editing
    valueDisplay?.addEventListener('click', () => {
      this.startInlineEditing(variableName);
    });
    
    // Save button click handler
    saveBtn?.addEventListener('click', () => {
      this.saveInlineValue(variableName);
    });
    
    // Cancel button click handler  
    cancelBtn?.addEventListener('click', () => {
      this.cancelInlineEditing(variableName);
    });
    
    // Enter key to save
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveInlineValue(variableName);
      }
    });
    
    // Escape key to cancel
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelInlineEditing(variableName);
      }
    });
  }

  /**
   * Start inline editing for a parameter variable
   */
  startInlineEditing(variableName) {
    const valueDisplay = document.querySelector(`#inline-value-${variableName}`);
    const inputContainer = document.querySelector(`#inline-input-${variableName}`);
    const input = inputContainer?.querySelector('.inline-value-input');
    
    if (valueDisplay && inputContainer && input) {
      valueDisplay.style.display = 'none';
      inputContainer.style.display = 'block';
      input.focus();
      input.select(); // Select all text for easy replacement
    }
  }

  /**
   * Cancel inline editing and restore display
   */
  cancelInlineEditing(variableName) {
    const valueDisplay = document.querySelector(`#inline-value-${variableName}`);
    const inputContainer = document.querySelector(`#inline-input-${variableName}`);
    
    if (valueDisplay && inputContainer) {
      valueDisplay.style.display = 'block';
      inputContainer.style.display = 'none';
    }
  }

  /**
   * Save inline value change
   */
  async saveInlineValue(variableName) {
    const inputContainer = document.querySelector(`#inline-input-${variableName}`);
    const input = inputContainer?.querySelector('.inline-value-input');
    
    if (!input) {
      console.error(`Input not found for variable ${variableName}`);
      return;
    }
    
    const newValue = input.value.trim();
    
    // Hide the input and show display
    this.cancelInlineEditing(variableName);
    
    try {       
      // Get the current variable data from variables manager
      const existingVariable = variablesManager.variables.get(variableName);
      if (!existingVariable) {
        console.error(`❌ Variable ${variableName} not found in variables manager`);
        alert('Error: Variable not found. Please try again.');
        return;
      }

      // Get old value for comparison
      const oldValue = this.getCurrentVariableValue(variableName, existingVariable);
      
      console.log(`💾 Saving inline value change for ${variableName}: "${oldValue}" → "${newValue}"`);
      
      // Only proceed if value actually changed
      if (String(oldValue) !== newValue) {
        // Create updated variable with new value
        const updatedVariable = {
          ...existingVariable,
          value: newValue
        };
        
        // Update in dependency executor FIRST (this will trigger automatic re-execution)
        await variableDependencyExecutor.addVariable(variableName, updatedVariable);
        
        // Get all execution results from dependency executor and update variables manager
        await this.syncExecutionResultsToVariablesManager();
        
        // Save variables to persist all changes
        await variablesManager.saveVariables();
        
        // Refresh the variables list to show updated values
        this.updateVariablesList();
        
        console.log(`✅ Inline value saved and dependencies updated for ${variableName}`);
        
        // Show success notification
        if (window.variableDependencyExecutor) {
          window.variableDependencyExecutor.showSimpleCompletionNotification('Variable value updated');
        }
      } else {
        console.log(`ℹ️ Value unchanged for ${variableName}, skipping update`);
      }
    } catch (error) {
      console.error('❌ Error saving inline value:', error);
      alert(`Error saving value: ${error.message}`);
      
      // Refresh the list to restore original state
      this.updateVariablesList();
    }
  }

  /**
   * Edit an existing variable
   */
  editVariable(variableName) {
    this.editingVariableName = variableName;
    const variables = variablesManager.getVariables();
    const variable = variables[variableName];
    
    if (!variable) return;

    this.showEditor();
    
    // Populate form with variable data
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');
    const editorTitle = this.panel.querySelector('#editor-title');

    if (nameInput) nameInput.value = variable.name || '';
    if (descInput) descInput.value = variable.description || '';
    if (typeSelect) typeSelect.value = variable.type || 'text';
    if (formatInput) formatInput.value = variable.format || '';
    if (requiredCheck) requiredCheck.checked = variable.required !== false;
    if (editorTitle) editorTitle.textContent = 'Edit Variable';

    // Show selected text if available
    if (variable.originalText) {
      const preview = this.panel.querySelector('#selected-text-preview');
      const display = this.panel.querySelector('#selected-text-display');
      
      if (preview && display) {
        display.textContent = `"${variable.originalText}"`;
        preview.style.display = 'block';
      }
    }

    // Update value display and value options
    this.updateValueDisplay(variable.value);
    
    // Set the value option based on what was saved
    if (variable.valueOption) {
      this.selectValueOption(variable.valueOption);
      
      // If it was code generation, show the generated code
      if (variable.valueOption === 'code' && variable.generatedCode) {
        this.showGeneratedCode(variable.generatedCode);
      }
    }
    
    // Update dependencies
    this.updateDependenciesDisplay(variable.dependencies || []);
  }

  /**
   * Delete a variable
   */
  deleteVariable(variableName) {
    if (!variablesManager || typeof variablesManager.removeVariable !== 'function') {
      console.error('Variables manager not available or removeVariable method not found');
      alert('Error: Unable to delete variable');
      return;
    }

    // Remove from variables manager
    variablesManager.removeVariable(variableName);
    
    // Remove from dependency executor
    variableDependencyExecutor.removeVariable(variableName);
    
    // Refresh the variables list
    this.updateVariablesList();
    
    // If we're currently editing this variable, go back to overview
    if (this.editingVariableName === variableName) {
      this.showOverview();
      this.editingVariableName = null;
    }
    
    console.log(`✅ Deleted variable ${variableName} from dependency system`);
  }

  /**
   * Save variable
   */
  async saveVariable() {
    const formData = this.getFormData();
    
    if (!this.validateForm(formData)) {
      return;
    }

    try {
      if (this.editingVariableName) {
        // Update existing variable
        await this.updateVariable(formData);
      } else {
        // Create new variable
        await this.createVariable(formData);
      }
      
      // CRITICAL: Completely clear all state after successful save
      console.log('🧹 Clearing all state after successful variable save');
      this.clearAllVariableState();
      
      // Show success and return to overview
      this.showOverview();
      
    } catch (error) {
      console.error('Error saving variable:', error);
      alert('Error saving variable: ' + error.message);
    }
  }

  /**
   * Debug method to test floating button (for console debugging)
   */
  debugTestFloatingButton() {
    console.log('🧪 Testing floating button...');
    console.log('🧪 Is initialized:', this.initialized);
    console.log('🧪 Has panel:', !!this.panel);
    console.log('🧪 Has floating button:', !!this.floatingButton);
    
    if (this.floatingButton) {
      console.log('🧪 Button in DOM:', document.body.contains(this.floatingButton));
      console.log('🧪 Button display:', this.floatingButton.style.display);
    }
    
    // Test showing the button at a fixed position
    if (this.floatingButton) {
      const testRect = { 
        right: 300, 
        bottom: 200, 
        left: 200, 
        top: 150, 
        width: 100, 
        height: 50 
      };
      console.log('🧪 Testing show at position:', testRect);
      this.showFloatingButton(testRect);
    }
  }

  /**
   * Clear all variable creation state
   * @param {boolean} preserveTextSelection - If true, don't clear the browser's text selection
   */
  clearAllVariableState(preserveTextSelection = false) {
    // Clear editing state
    this.editingVariableName = null;
    this.selectedText = null;
    this.selectedRange = null;
    this.currentValueOption = null;
    
    // Clear text selection only if we're not preserving it
    if (!preserveTextSelection && window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    
    // Clear any temporary variables from dependency executor that might have been created during testing
    if (window.variableDependencyExecutor) {
      const tempVarPattern = /^(text|revenue|rate|count|temp_var|patient_data|age)(_\d+)?$/;
      const allVars = Array.from(window.variableDependencyExecutor.variables.keys());
      allVars.forEach(varName => {
        // Only remove if it's a temp variable pattern AND not in the official variables manager
        if (tempVarPattern.test(varName) && !variablesManager.variables.has(varName)) {
          console.log(`🗑️ Clearing temporary variable: ${varName}`);
          window.variableDependencyExecutor.removeVariable(varName);
        }
      });
    }
    
    // Clear any cached form data or DOM state
    if (this.panel) {
      // Clear any data attributes that might store previous values
      const formElements = this.panel.querySelectorAll('input, select, textarea');
      formElements.forEach(element => {
        if (element.hasAttribute('data-previous-value')) {
          element.removeAttribute('data-previous-value');
        }
      });
      
      // Clear any execution result displays
      const resultContainer = this.panel.querySelector('#code-execution-result');
      if (resultContainer) {
        resultContainer.style.display = 'none';
        const resultContent = this.panel.querySelector('#code-result-content');
        if (resultContent) resultContent.innerHTML = '';
      }
    }
    
    // Force a form reset to ensure clean state for next variable
    this.resetEditorForm();
    
    console.log('✅ All variable state cleared successfully');
  }

  /**
   * Get form data
   */
  getFormData() {
    const nameInput = this.panel.querySelector('#var-name');
    const descInput = this.panel.querySelector('#var-description');
    const typeSelect = this.panel.querySelector('#var-type');
    const formatInput = this.panel.querySelector('#var-format');
    const requiredCheck = this.panel.querySelector('#var-required');

    // Get current value based on the selected value option
    let currentValue = '';
    
    if (this.currentValueOption === 'manual') {
      // Get value from manual input
      const valueDisplay = this.panel.querySelector('#var-value-display');
      currentValue = valueDisplay?.textContent !== 'Click to set value' ? valueDisplay?.textContent : '';
    } else if (this.currentValueOption === 'code') {
      // For code generation, first try to get from execution results
      const varName = nameInput?.value?.trim() || '';
      if (varName && variableDependencyExecutor) {
        const executionResult = variableDependencyExecutor.getVariableValue(varName);
        if (executionResult !== undefined && executionResult !== null) {
          currentValue = executionResult;
          console.log('🔧 Getting code execution result from dependency executor:', currentValue);
        } else {
          // Fall back to value display if no execution result found
          const valueDisplay = this.panel.querySelector('#var-value-display');
          currentValue = valueDisplay?.textContent !== 'Click to set value' ? valueDisplay?.textContent : '';
          console.log('🔧 Getting code execution result from UI display:', currentValue);
        }
      } else {
        // Fall back to value display
        const valueDisplay = this.panel.querySelector('#var-value-display');
        currentValue = valueDisplay?.textContent !== 'Click to set value' ? valueDisplay?.textContent : '';
        console.log('🔧 Getting code execution result from UI display (fallback):', currentValue);
      }
    }

    // Get generated code if using code option
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    const generatedCode = codeEditor?.getAttribute('data-code') || codeEditor?.textContent || '';

    return {
      name: nameInput?.value?.trim() || '',
      description: descInput?.value?.trim() || '',
      type: typeSelect?.value || 'text',
      format: formatInput?.value?.trim() || '',
      required: requiredCheck?.checked || false,
      dependencies: this.getCurrentDependencies(),
      valueOption: this.currentValueOption,
      value: currentValue,
      generatedCode: generatedCode
    };
  }

  /**
   * Validate form data
   */
  validateForm(formData) {
    if (!formData.name) {
      alert('Variable name is required');
      return false;
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formData.name)) {
      alert('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return false;
    }
    
    if (!formData.description) {
      alert('Variable description is required');
      return false;
    }
    
    const existingVariables = variablesManager.getVariables();
    if (!this.editingVariableName && existingVariables[formData.name]) {
      // Automatically overwrite existing variable - set as editing mode to trigger update instead of create
      this.editingVariableName = formData.name;
      console.log(`📝 Overwriting existing variable: ${formData.name}`);
    }
    
    if (this.editingVariableName && formData.name !== this.editingVariableName && existingVariables[formData.name]) {
      // Automatically overwrite existing variable when renaming
      console.log(`📝 Overwriting existing variable during rename: ${formData.name}`);
    }

    // Validate that either manual value or code generation is selected
    if (!formData.valueOption) {
      alert('Please choose how to set the variable value: either set it manually or generate it with code');
      return false;
    }

    // If manual value is selected, check that a value is provided
    if (formData.valueOption === 'manual' && !formData.value) {
      alert('Please set a value for the variable using the "Set Value Manually" option');
      return false;
    }

    // If code generation is selected, check that code exists and has been executed
    if (formData.valueOption === 'code') {
      if (!formData.generatedCode) {
        alert('Please generate code for the variable using the "Generate Python Code" button');
        return false;
      }
      
      // Check if variable has been executed by looking at execution results
      const varName = formData.name;
      const hasExecutionResult = variableDependencyExecutor && 
                                variableDependencyExecutor.getVariableValue(varName) !== undefined;
      const hasValueInForm = formData.value && formData.value !== '';
      
      if (!hasExecutionResult && !hasValueInForm) {
        alert('Please execute the generated code first by clicking the "Execute" button to get the variable value');
        return false;
      }
      
      // If we have execution result but no form value, that's okay - we'll use the execution result
      if (hasExecutionResult && !hasValueInForm) {
        console.log('✅ Variable has execution result, proceeding with save');
      }
    }
    
    return true;
  }

  /**
   * Create new variable
   */
  async createVariable(formData) {
    // For code variables, use execution result if form value is empty
    let finalValue = formData.value;
    if (formData.valueOption === 'code' && (!finalValue || finalValue === '')) {
      const executionResult = variableDependencyExecutor?.getVariableValue(formData.name);
      if (executionResult !== undefined) {
        finalValue = executionResult;
        console.log('✅ Using execution result for new variable value:', finalValue);
      }
    }
    
    const variable = {
      id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      required: formData.required,
      dependencies: formData.dependencies,
      originalText: this.selectedText,
      placeholder: `{{${formData.name}}}`,
      createdAt: new Date().toISOString(),
      valueOption: formData.valueOption,
      value: finalValue,
      generatedCode: formData.generatedCode
    };

    // Add to variables manager
    variablesManager.variables.set(variable.name, variable);
    
    // Add to dependency executor (this will handle automatic re-execution if needed)
    console.log(`💾 Saving new variable ${variable.name} with value: ${variable.value}`);
    await variableDependencyExecutor.addVariable(variable.name, variable);
    
    // Replace selected text with placeholder if available
    if (this.selectedRange && this.selectedText) {
      this.replaceSelectedTextWithPlaceholder(variable);
    }
    
    await variablesManager.saveVariables();
    variablesManager.updateVariablesUI();
    
    console.log(`✅ Created variable ${variable.name} in dependency system`);
  }

  /**
   * Update existing variable
   */
  async updateVariable(formData) {
    const originalVariable = variablesManager.variables.get(this.editingVariableName);
    if (!originalVariable) {
      throw new Error('Original variable not found');
    }

    // For code variables, use execution result if form value is empty
    let finalValue = formData.value;
    if (formData.valueOption === 'code' && (!finalValue || finalValue === '')) {
      const executionResult = variableDependencyExecutor?.getVariableValue(formData.name);
      if (executionResult !== undefined) {
        finalValue = executionResult;
        console.log('✅ Using execution result for updated variable value:', finalValue);
      }
    }

    const updatedVariable = {
      ...originalVariable,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      required: formData.required,
      dependencies: formData.dependencies,
      placeholder: `{{${formData.name}}}`,
      valueOption: formData.valueOption,
      value: finalValue,
      generatedCode: formData.generatedCode
    };

    // Handle variable name change in variables manager
    if (formData.name !== this.editingVariableName) {
      console.log(`🔄 Variable name changed from ${this.editingVariableName} to ${formData.name}`);
      
      // Handle name change in dependency executor FIRST
      variableDependencyExecutor.removeVariable(this.editingVariableName);
      await variableDependencyExecutor.addVariable(formData.name, updatedVariable);
      
      // Sync all execution results back to variables manager
      await this.syncExecutionResultsToVariablesManager();
    } else {
      // CRITICAL: Get the old value from dependency executor BEFORE any updates
      const oldVariableInExecutor = variableDependencyExecutor.variables.get(this.editingVariableName);
      const oldValue = oldVariableInExecutor ? oldVariableInExecutor.value : null;
      
      console.log(`💾 Updating existing variable ${formData.name}: "${oldValue}" → "${formData.value}"`);
      
      // Update in dependency executor FIRST (this will handle automatic re-execution if needed)
      await variableDependencyExecutor.addVariable(formData.name, updatedVariable);
      
      // Sync all execution results back to variables manager
      await this.syncExecutionResultsToVariablesManager();
    }

    await variablesManager.saveVariables();
    
    console.log(`✅ Updated variable ${formData.name} in dependency system`);
  }

  /**
   * Replace selected text with variable placeholder
   */
  replaceSelectedTextWithPlaceholder(variable) {
    if (!this.selectedRange) return;
    
    try {
      const placeholder = document.createTextNode(variable.placeholder);
      this.selectedRange.deleteContents();
      this.selectedRange.insertNode(placeholder);
      window.getSelection().removeAllRanges();
      
      // Trigger change detection for document auto-save
      if (window.documentManager) {
        window.documentManager.onContentChange();
      }
    } catch (error) {
      console.error('Error replacing text with placeholder:', error);
    }
  }

  // Additional methods for value management, dependencies, and code generation will be implemented
  // in the next phase of development...

  /**
   * Sync execution results from dependency executor back to variables manager
   * This ensures that template preview shows the updated values after automatic re-execution
   */
  async syncExecutionResultsToVariablesManager() {
    console.log('🔄 Syncing execution results from dependency executor to variables manager...');
    
    // Get all execution results from dependency executor
    const executionResults = variableDependencyExecutor.getAllVariableValues();
    
    for (const [variableName, executedValue] of Object.entries(executionResults)) {
      // Get the variable from variables manager
      const variable = variablesManager.variables.get(variableName);
      if (variable) {
        // Convert result to string for display if needed
        let displayValue = executedValue;
        if (typeof executedValue === 'object' && executedValue !== null) {
          displayValue = JSON.stringify(executedValue, null, 2);
        } else if (executedValue !== null && executedValue !== undefined) {
          displayValue = String(executedValue);
        }
        
        // Update the variable's value in variables manager
        variable.value = displayValue;
        variablesManager.variables.set(variableName, variable);
        
        console.log(`🔄 Synced ${variableName}: ${displayValue}`);
      }
    }
    
    // Update the UI to reflect changes
    variablesManager.updateVariablesUI();
    this.updateVariablesList();
    
    console.log('✅ Execution results synced to variables manager');
  }

  /**
   * Value Management Methods
   */
  startValueEditing() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const inputContainer = this.panel.querySelector('#value-input-container');
    const valueInput = this.panel.querySelector('#var-value-input');
    
    if (valueDisplay && inputContainer && valueInput) {
      valueDisplay.style.display = 'none';
      inputContainer.style.display = 'block';
      valueInput.focus();
    }
  }

  async saveValue() {
    const valueInput = this.panel.querySelector('#var-value-input');
    const value = valueInput?.value?.trim() || '';
    
    this.updateValueDisplay(value);
    this.cancelValueEditing();
    
    // For new variables, we don't need to save immediately - just update the display
    // The value will be saved when the user clicks "Save Variable"
    if (!this.editingVariableName) {
      console.log('✅ Value set for new variable, will be saved when variable is created');
      return;
    }
    
    // CRITICAL: Get the old value from dependency executor BEFORE any updates
    const oldVariableInExecutor = variableDependencyExecutor.variables.get(this.editingVariableName);
    const oldValue = oldVariableInExecutor ? oldVariableInExecutor.value : null;
    
    // Get the current variable data from variables manager
    const existingVariable = variablesManager.variables.get(this.editingVariableName);
    if (!existingVariable) {
      console.error(`❌ Variable ${this.editingVariableName} not found in variables manager`);
      alert('Error: Variable not found. Please try again.');
      return;
    }

    // Create updated variable with new value
    const updatedVariable = {
      ...existingVariable,
      value: value
    };
    
    console.log(`💾 Saving value change for ${this.editingVariableName}: "${oldValue}" → "${value}"`);
    
    // Only proceed if value actually changed
    if (oldValue !== value) {
      try {
        // Update in dependency executor FIRST (this will trigger automatic re-execution)
        await variableDependencyExecutor.addVariable(this.editingVariableName, updatedVariable);
        
        // Get all execution results from dependency executor and update variables manager
        await this.syncExecutionResultsToVariablesManager();
        
        // Save variables to persist all changes
        await variablesManager.saveVariables();
        
        console.log(`✅ Value saved and dependencies updated for ${this.editingVariableName}`);
      } catch (error) {
        console.error('❌ Error saving value:', error);
        alert(`Error saving value: ${error.message}`);
      }
    } else {
      console.log(`ℹ️ Value unchanged for ${this.editingVariableName}, skipping update`);
    }
  }

  cancelValueEditing() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    const inputContainer = this.panel.querySelector('#value-input-container');
    
    if (valueDisplay && inputContainer) {
      valueDisplay.style.display = 'block';
      inputContainer.style.display = 'none';
    }
  }

  updateValueDisplay(value) {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    if (valueDisplay) {
      if (!value) {
        valueDisplay.textContent = 'Click to set value';
        valueDisplay.className = 'value-display no-value';
      } else {
        // Check if value contains HTML content (particularly table content)
        if (typeof value === 'string' && 
            (value.includes('<table') || 
             value.includes('<div class="billing-table-container"') || 
             value.includes('<div class="annotations-table-container"') || 
             value.includes('<img'))) {
          // For HTML content, use innerHTML but ensure we don't duplicate content
          valueDisplay.innerHTML = '';  // Clear first to prevent duplication
          valueDisplay.innerHTML = value;
        } else {
          // For plain text, use textContent
          valueDisplay.textContent = value;
        }
        valueDisplay.className = 'value-display has-value';
      }
    }
  }

  resetValueDisplay() {
    const valueDisplay = this.panel.querySelector('#var-value-display');
    if (valueDisplay) {
      valueDisplay.innerHTML = '';  // Clear any HTML content first
      valueDisplay.textContent = 'Click to set value';
      valueDisplay.className = 'value-display no-value';
    }
    
    // Also clear the input field
    const valueInput = this.panel.querySelector('#var-value-input');
    if (valueInput) {
      valueInput.value = '';
    }
    
    // Make sure input container is hidden
    const inputContainer = this.panel.querySelector('#value-input-container');
    if (inputContainer) {
      inputContainer.style.display = 'none';
    }
  }

  handleDataSourceChange(selectedValue) {
    // This method is deprecated in the new UI
    // Data source selection is now handled through the value options UI
  }

  /**
   * Dependencies Management Methods
   */
  showDependencySelector() {
    const selector = this.panel.querySelector('#var-dependency-selector');
    const addBtn = this.panel.querySelector('#add-var-dependency');
    
    if (selector && addBtn) {
      this.populateDependencySelector();
      selector.style.display = 'block';
      addBtn.style.display = 'none';
    }
  }

  hideDependencySelector() {
    const selector = this.panel.querySelector('#var-dependency-selector');
    const addBtn = this.panel.querySelector('#add-var-dependency');
    const select = this.panel.querySelector('#var-dependency-select');
    
    if (selector && addBtn) {
      selector.style.display = 'none';
      addBtn.style.display = 'block';
      if (select) select.value = '';
    }
  }

  populateDependencySelector() {
    const select = this.panel.querySelector('#var-dependency-select');
    if (!select) return;

    // Clear options except default
    const options = select.querySelectorAll('option[data-variable]');
    options.forEach(option => option.remove());

    const variables = variablesManager.getVariables();
    const currentDeps = this.getCurrentDependencies();
    const currentName = this.editingVariableName || this.panel.querySelector('#var-name')?.value?.trim();

    Object.entries(variables).forEach(([name, variable]) => {
      if (name !== currentName && !currentDeps.includes(name)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${variable.type}) - ${variable.description}`;
        option.setAttribute('data-variable', 'true');
        select.appendChild(option);
      }
    });
  }

  addSelectedDependency() {
    const select = this.panel.querySelector('#var-dependency-select');
    const selectedName = select?.value;
    
    if (!selectedName) {
      alert('Please select a variable to add as dependency');
      return;
    }

    const currentDeps = this.getCurrentDependencies();
    if (currentDeps.includes(selectedName)) {
      alert('This variable is already a dependency');
      return;
    }

    this.addDependencyToList(selectedName);
    this.hideDependencySelector();
  }

  addDependencyToList(dependencyName) {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (!list) return;

    // Remove no dependencies message
    const noDepMsg = list.querySelector('.no-dependencies-message');
    if (noDepMsg) noDepMsg.remove();

    const variables = variablesManager.getVariables();
    const variable = variables[dependencyName] || { name: dependencyName, type: 'text', description: '' };

    const item = document.createElement('div');
    item.className = 'dependency-item';
    item.setAttribute('data-dependency-name', dependencyName);
    item.innerHTML = `
      <span class="dependency-name">${variable.name}</span>
      <span class="dependency-type">(${variable.type})</span>
      <span class="dependency-description">${variable.description}</span>
      <button type="button" class="remove-dependency-btn" data-dependency-name="${dependencyName}">×</button>
    `;

    list.appendChild(item);
  }

  removeDependency(dependencyName) {
    const list = this.panel.querySelector('#var-dependencies-list');
    const item = list?.querySelector(`[data-dependency-name="${dependencyName}"]`);
    
    if (item) {
      item.remove();
      
      // Check if no dependencies left
      const remaining = list.querySelectorAll('.dependency-item');
      if (remaining.length === 0) {
        list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      }
    }
  }

  getCurrentDependencies() {
    const list = this.panel.querySelector('#var-dependencies-list');
    const items = list?.querySelectorAll('.dependency-item') || [];
    return Array.from(items).map(item => item.getAttribute('data-dependency-name'));
  }

  updateDependenciesDisplay(dependencies) {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (!list) return;

    list.innerHTML = '';
    
    if (dependencies.length === 0) {
      list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
      return;
    }

    dependencies.forEach(depName => {
      this.addDependencyToList(depName);
    });
  }

  resetDependencies() {
    const list = this.panel.querySelector('#var-dependencies-list');
    if (list) {
      list.innerHTML = '<div class="no-dependencies-message">No dependencies selected</div>';
    }
  }

  /**
   * Reset value options UI
   */
  resetValueOptions() {
    const manualValueBtn = this.panel.querySelector('#choose-manual-value');
    const codeGenerationBtn = this.panel.querySelector('#choose-code-generation');
    const manualSection = this.panel.querySelector('#manual-value-section');
    const codeSection = this.panel.querySelector('#code-generation-inline');
    const codeContainer = this.panel.querySelector('#generated-code-container');
    const codeEditor = this.panel.querySelector('#generated-code-editor');
    
    // Reset button states
    manualValueBtn?.classList.remove('active');
    codeGenerationBtn?.classList.remove('active');
    
    // Hide both sections
    if (manualSection) manualSection.style.display = 'none';
    if (codeSection) codeSection.style.display = 'none';
    if (codeContainer) codeContainer.style.display = 'none';
    
    // Clear generated code completely
    if (codeEditor) {
      codeEditor.innerHTML = '';
      codeEditor.textContent = '';
      codeEditor.removeAttribute('data-code');
      codeEditor.removeAttribute('data-last-highlighted');
      codeEditor.removeAttribute('data-editing');
    }
    
    // Clear any code generation inputs
    const codeInstructions = this.panel.querySelector('#code-instructions');
    if (codeInstructions) codeInstructions.value = '';
    
    // Reset generation buttons to default state
    const generateBtn = this.panel.querySelector('#generate-var-code');
    const testBtn = this.panel.querySelector('#test-var-code');
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = '🤖 Generate Python Code';
    }
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = '▶️ Execute';
    }
    
    // Hide execution result display
    this.hideExecutionResult();
    
    // Reset current option
    this.currentValueOption = null;
  }

  /**
   * Code Generation Methods
   */
  toggleCodeGeneration() {
    // This method is deprecated - use selectValueOption('code') instead
    this.selectValueOption('code');
  }

  /**
   * Populate data source options for code generation
   */
  populateCodeGenDataSources() {
    // For now, use the same data source as the main form
    const mainDataSourceSelect = this.panel.querySelector('#var-data-source');
    const selectedValue = mainDataSourceSelect?.value || '';
    
    if (selectedValue && selectedValue !== 'manual') {
      // Auto-populate from main data source selection
      const instructions = this.panel.querySelector('#code-instructions');
      if (instructions && !instructions.value) {
        const formData = this.getFormData();
        instructions.value = `Calculate ${formData.description || formData.name} using the selected data source.`;
      }
    }
  }

  async generateCode() {
    const formData = this.getFormData();
    
    if (!formData.name) {
      alert('Please enter a variable name first');
      return;
    }

    if (!formData.description) {
      alert('Please enter a variable description first');
      return;
    }

    console.log('Generating code for variable:', formData.name);
    
    // Show loading state
    this.showCodeGenerationLoading(true);

    try {
      // Get current dependency values
      const dependencies = this.getCurrentDependencies();
      const dependencyValues = await this.getDependencyValues(dependencies);
      
      // Prepare request payload
      const payload = {
        variable_name: formData.name,
        variable_type: formData.type,
        variable_description: formData.description,
        dependencies: dependencies,
        dependency_values: dependencyValues,
        document_id: window.documentManager?.activeDocumentId || 'default'
      };

      let response = null;
      let result = null;

      // Try primary endpoint first
      try {
        response = await fetch('http://127.0.0.1:5001/api/generate-variable-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          result = await response.json();
          this.showGeneratedCode(result.code);
        } else {
          throw new Error('Primary endpoint failed');
        }
      } catch (primaryError) {
        console.warn('Primary code generation endpoint failed, trying fallback...');
        
        // Try fallback endpoint
        try {
          const prompt = `Generate Python code to calculate a variable named "${formData.name}" (type: ${formData.type}) with description: "${formData.description}". ${dependencies.length > 0 ? `The variable depends on: ${dependencies.join(', ')}.` : ''} Return clean, executable Python code.`;
          
          response = await fetch('http://127.0.0.1:5001/api/generate-code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt: prompt,
              context: dependencies.length > 0 ? `Dependencies: ${dependencies.join(', ')}` : ''
            })
          });

          if (response.ok) {
            result = await response.json();
            this.showGeneratedCode(result.code || result.generated_code);
          } else {
            throw new Error('Both endpoints failed');
          }
        } catch (fallbackError) {
          console.error('Both code generation endpoints failed:', fallbackError);
          throw new Error('Code generation service unavailable');
        }
      }

    } catch (error) {
      console.error('Error generating code:', error);
      alert('Error generating code: ' + error.message);
    } finally {
      this.showCodeGenerationLoading(false);
    }
  }

  /**
   * Show generated code in the editor
   */
  showGeneratedCode(code) {
    const container = this.panel.querySelector('#generated-code-container');
    const editor = this.panel.querySelector('#generated-code-editor');

    if (container && editor) {
      container.style.display = 'block';
      
      // Store the original code
      editor.setAttribute('data-code', code);
      
      // Apply syntax highlighting
      const highlightedCode = this.applySyntaxHighlighting(code);
      editor.innerHTML = highlightedCode;
      editor.setAttribute('data-last-highlighted', code);
      
      // Hide any previous execution result since new code has been generated
      this.hideExecutionResult();
    }
  }

  /**
   * Show execution result in HTML format below code editor
   */
  showExecutionResult(result) {
    const resultContainer = this.panel.querySelector('#code-execution-result');
    const resultContent = this.panel.querySelector('#code-result-content');
    
    if (!resultContainer || !resultContent) {
      console.error('Result display elements not found');
      return;
    }
    
    // Convert result to HTML format for display
    let htmlContent = '';
    
    if (result === null || result === undefined) {
      htmlContent = '<em style="color: #666;">No result</em>';
    } else if (typeof result === 'string') {
      // Check if the string contains HTML (for images, tables, etc.)
      if (result.includes('<') && (result.includes('<table') || result.includes('<img') || result.includes('<div'))) {
        // Raw HTML content - display as-is
        htmlContent = result;
      } else {
        // Plain text - wrap in pre tag to preserve formatting
        htmlContent = `<pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.escapeHtml(result)}</pre>`;
      }
    } else if (typeof result === 'object') {
      try {
        // Format JSON objects nicely
        const jsonString = JSON.stringify(result, null, 2);
        htmlContent = `<pre style="margin: 0; white-space: pre-wrap; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; background: #f5f5f5; padding: 8px; border-radius: 4px; font-size: 12px;">${this.escapeHtml(jsonString)}</pre>`;
      } catch (e) {
        htmlContent = `<pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.escapeHtml(String(result))}</pre>`;
      }
    } else {
      // Numbers, booleans, etc.
      htmlContent = `<span style="font-weight: 500; color: #2196F3;">${this.escapeHtml(String(result))}</span>`;
    }
    
    // Set the HTML content
    resultContent.innerHTML = htmlContent;
    
    // Show the result container
    resultContainer.style.display = 'block';
  }
  
  /**
   * Hide execution result display
   */
  hideExecutionResult() {
    const resultContainer = this.panel.querySelector('#code-execution-result');
    if (resultContainer) {
      resultContainer.style.display = 'none';
    }
  }
  
  /**
   * Escape HTML characters for safe display
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Apply basic Python syntax highlighting
   */
  applySyntaxHighlighting(code) {
    if (!code) return '';
    
    // Escape HTML entities first
    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Split into lines to handle comments properly
    const lines = highlighted.split('\n');
    const processedLines = lines.map(line => {
      let processedLine = line;
      
      // Handle comments (but not in strings)
      const commentMatch = processedLine.match(/^([^#"']*(?:"[^"]*"[^#"']*|'[^']*'[^#"']*)*)(.*)$/);
      if (commentMatch) {
        const beforeComment = commentMatch[1];
        const afterComment = commentMatch[2];
        
        // Check if there's a # that's not in a string
        const hashIndex = afterComment.indexOf('#');
        if (hashIndex !== -1) {
          const commentPart = afterComment.substring(hashIndex);
          const beforeHash = afterComment.substring(0, hashIndex);
          processedLine = beforeComment + beforeHash + '<span class="comment">' + commentPart + '</span>';
        }
      }
      
      return processedLine;
    });
    
    highlighted = processedLines.join('\n');
    
    // Strings (triple quotes first, then regular quotes)
    // Handle multiline strings carefully
    highlighted = highlighted.replace(/("""[\s\S]*?""")/g, '<span class="string">$1</span>');
    highlighted = highlighted.replace(/('''[\s\S]*?''')/g, '<span class="string">$1</span>');
    
    // Single line strings (avoid already highlighted content)
    highlighted = highlighted.replace(/("(?:[^"\\]|\\.)*")(?![^<]*<\/span>)/g, '<span class="string">$1</span>');
    highlighted = highlighted.replace(/('(?:[^'\\]|\\.)*')(?![^<]*<\/span>)/g, '<span class="string">$1</span>');
    
    // Numbers (avoid those in strings)
    highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*<\/span>)/g, '<span class="number">$1</span>');
    
    // Python keywords (avoid matching parts of words or inside strings/comments)
    const keywords = ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None'];
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b(?![^<]*<\/span>)`, 'g');
      highlighted = highlighted.replace(regex, '<span class="keyword">$1</span>');
    });
    
    // Function calls (but not if already highlighted)
    highlighted = highlighted.replace(/\b(\w+)(?=\s*\()(?![^<]*<\/span>)/g, '<span class="function">$1</span>');
    
    return highlighted;
  }

  /**
   * Show/hide code generation loading state
   */
  showCodeGenerationLoading(show) {
    const generateBtn = this.panel.querySelector('#generate-var-code');
    if (generateBtn) {
      generateBtn.disabled = show;
      generateBtn.textContent = show ? '🤖 Generating...' : '🤖 Generate Python Code';
    }
  }

  /**
   * Show/hide code execution loading state
   */
  showCodeExecutionLoading(show) {
    const testBtn = this.panel.querySelector('#test-var-code');
    if (testBtn) {
      testBtn.disabled = show;
      testBtn.textContent = show ? '⏳ Executing...' : '▶️ Execute';
    }
  }

  /**
   * Get dependency values for code generation
   */
  async getDependencyValues(dependencies) {
    const dependencyValues = {};
    
    if (!dependencies || dependencies.length === 0) {
      return dependencyValues;
    }

    // Get variables from variables manager
    const variables = variablesManager.getVariables();
    
    for (const depName of dependencies) {
      const variable = variables[depName];
      if (variable && variable.value !== undefined) {
        dependencyValues[depName] = {
          name: variable.name,
          type: variable.type || 'text',
          description: variable.description || '',
          value: variable.value,
          format: variable.format || ''
        };
      } else {
        console.warn(`Dependency ${depName} has no value`);
      }
    }
    
    return dependencyValues;
  }

  async testCode() {
    const formData = this.getFormData();
    
    if (!formData.name) {
      alert('Please enter a variable name first');
      return;
    }

    if (!formData.generatedCode) {
      alert('No code to execute. Please generate code first.');
      return;
    }

    console.log('🧪 Testing code for variable:', formData.name);
    console.log('🔍 Generated code to execute:', formData.generatedCode);

    // Show loading state
    this.showCodeExecutionLoading(true);

    try {
      // Create temporary variable for testing
      const tempVariable = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        dependencies: formData.dependencies,
        valueOption: 'code',
        generatedCode: formData.generatedCode,
        value: null
      };

      // Add to dependency executor temporarily (don't trigger change detection)
      await variableDependencyExecutor.addVariable(formData.name, tempVariable, true);

      // Execute this variable (and its dependencies if needed)
      const result = await variableDependencyExecutor.executeVariable(formData.name);
      
      console.log('🎯 Variable execution result:', result, 'Type:', typeof result);
      
      // Handle different types of results
      let displayResult = null;
      let success = false;
      
      if (result !== null && result !== undefined) {
        // Convert result to string for display
        if (typeof result === 'object') {
          try {
            displayResult = JSON.stringify(result, null, 2);
          } catch (e) {
            displayResult = String(result);
          }
        } else {
          displayResult = String(result);
        }
        
        // Check if we have meaningful content
        if (displayResult && displayResult.trim() !== '' && displayResult !== '{}' && displayResult !== 'null' && displayResult !== 'undefined') {
          success = true;
        } else {
          console.log('Result is empty or meaningless:', displayResult);
          success = false;
        }
      } else {
        console.log('Variable execution returned null/undefined');
        displayResult = 'No result returned';
        success = false;
      }
      
      if (success && displayResult) {
        // Update the variable value display
        this.updateValueDisplay(displayResult);
        
        // Show the execution result in HTML format below the code editor
        this.showExecutionResult(result);
        
        // Show success message using floating window
        if (window.variableDependencyExecutor) {
          window.variableDependencyExecutor.showSimpleCompletionNotification('Variable value set and ready to save');
        }
      } else {
        console.warn('Code execution returned no usable result');
        alert(`⚠️ Code executed but returned no result.\n\nThe code ran without errors, but didn't return a value that can be used as the variable value.\n\nTip: Make sure your code returns the final result.`);
      }

    } catch (error) {
      console.error('❌ Error executing variable:', error);
      
      let errorMessage = '❌ Error executing code:\n\n' + error.message;
      
      // Add helpful suggestions
      if (error.message.includes('not been executed')) {
        errorMessage += '\n\n💡 Make sure all dependency variables have been created and executed first.';
      } else if (error.message.includes('Circular dependency')) {
        errorMessage += '\n\n💡 Fix the circular dependency between variables.';
      } else if (error.message.includes('syntax')) {
        errorMessage += '\n\n💡 Check your Python syntax and indentation.';
      }
      
      alert(errorMessage);
    } finally {
      // Reset button state
      this.showCodeExecutionLoading(false);
    }
  }

  /**
   * Execute generated code with dependencies and data source
   */
  async executeGeneratedCode(code, dataSource, dependencyValues) {
    console.log('🔧 Executing code with dependencies:', dependencyValues);
    
    // Convert dependency values to proper parameter format for backend
    const parameters = this.convertDependencyValuesToParameters(dependencyValues);
    console.log('🔄 Converted parameters for backend:', parameters);
    
    // Use direct API call with proper parameter format
    try {
      const payload = {
        code: code,
        parameters: parameters,
        document_id: window.documentManager?.activeDocumentId || 'default'
      };
      console.log('📤 Sending execution request with payload:', payload);

      const response = await fetch('http://127.0.0.1:5001/api/execute-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('📥 Execution response status:', response.status);
      
      if (response.ok) {
        const apiResult = await response.json();
        console.log('📋 Full API response:', apiResult);
        
        let extractedResult = null;
        
        if (apiResult.success && apiResult.output !== undefined && apiResult.output !== null) {
          extractedResult = apiResult.output;
          console.log('✅ Found successful result in output:', extractedResult);
          
          // Log stdout if available for debugging
          if (apiResult.stdout) {
            console.log('📝 Execution stdout:', apiResult.stdout);
          }
        } else if (apiResult.success && apiResult.stdout) {
          // If output is null but we have stdout, try to parse it
          console.log('📝 Trying to extract result from stdout:', apiResult.stdout);
          extractedResult = apiResult.stdout;
        } else if (apiResult.result !== undefined) {
          extractedResult = apiResult.result;
          console.log('✅ Found result in result field:', extractedResult);
        } else if (apiResult.success && (apiResult.output === null || apiResult.output === undefined)) {
          // Special case: execution was "successful" but returned null/undefined
          console.warn('⚠️ Code executed successfully but returned null/undefined result');
          console.log('📝 This usually means the function executed but the final expression/return was null');
          console.log('💡 Check that your code has a final expression or return statement that produces a value');
          throw new Error('Code executed successfully but returned no value. Make sure your function returns a result and is called properly.');
        } else if (!apiResult.success && apiResult.error) {
          console.error('❌ Backend returned error:', apiResult.error);
          throw new Error(typeof apiResult.error === 'object' ? JSON.stringify(apiResult.error) : apiResult.error);
        } else {
          console.warn('⚠️ Unexpected API response format:', apiResult);
          throw new Error('Unexpected response format from backend');
        }
        
        console.log('🎯 Final extracted result:', extractedResult, 'Type:', typeof extractedResult);
        return extractedResult;
      } else {
        const errorText = await response.text();
        console.error('❌ API execution failed:', response.status, errorText);
        throw new Error(`Code execution API failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error executing code via API:', error);
      throw error;
    }
  }

  /**
   * Convert dependency values object to backend parameters format
   */
  convertDependencyValuesToParameters(dependencyValues) {
    const parameters = {};
    
    if (!dependencyValues || typeof dependencyValues !== 'object') {
      console.log('🔧 No dependency values to convert');
      return parameters;
    }
    
    for (const [paramName, depInfo] of Object.entries(dependencyValues)) {
      if (depInfo && typeof depInfo === 'object' && depInfo.value !== undefined) {
        // Extract the actual value from the dependency info object
        let paramValue = depInfo.value;
        
        // Check if the value is a JSON string that should be parsed into an object
        if (typeof paramValue === 'string') {
          try {
            // Try to parse as JSON if it looks like JSON (starts with { or [)
            const trimmedValue = paramValue.trim();
            if ((trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) || 
                (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))) {
              const parsedValue = JSON.parse(trimmedValue);
              parameters[paramName] = parsedValue;
              console.log(`🔗 Mapped JSON parameter: ${paramName} = [parsed object] (from ${depInfo.name})`);
            } else {
              // Regular string value
              parameters[paramName] = paramValue;
              console.log(`🔗 Mapped string parameter: ${paramName} = ${paramValue} (from ${depInfo.name})`);
            }
          } catch (error) {
            // If JSON parsing fails, use the string value as-is
            parameters[paramName] = paramValue;
            console.log(`🔗 Mapped parameter (JSON parse failed): ${paramName} = ${paramValue} (from ${depInfo.name})`);
          }
        } else {
          // Non-string value, use as-is
          parameters[paramName] = paramValue;
          console.log(`🔗 Mapped parameter: ${paramName} = ${paramValue} (from ${depInfo.name})`);
        }
      } else {
        // Fallback: use the value directly if it's not in the expected format
        parameters[paramName] = depInfo;
        console.log(`🔗 Direct parameter: ${paramName} = ${depInfo}`);
      }
    }
    
    return parameters;
  }

}

// Create and export singleton instance
export const variablesSidePanel = new VariablesSidePanel();
export default variablesSidePanel;

// Also make it available globally for debugging
window.variablesSidePanel = variablesSidePanel;