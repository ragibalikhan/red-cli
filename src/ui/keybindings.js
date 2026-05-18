import readline from 'readline';

export class Keybindings {
  constructor() {
    this.handlers = new Map();
    this.enabled = true;
  }

  // Global keybindings (always active)
  static GLOBAL = {
    CANCEL: 'ctrl-c',     // Cancel current operation / exit if nothing running
    EXIT: 'ctrl-d',       // Exit Red CLI
    CLEAR: 'ctrl-l',      // Clear screen (keep history)
    HISTORY_SEARCH: 'ctrl-r', // Reverse history search
    UNDO: 'ctrl-z',       // Undo last change
    UP: 'up',             // Navigate input history
    DOWN: 'down',         // Navigate input history
    TAB: 'tab'            // Autocomplete path or command
  };

  // Slash menu keybindings
  static MENU = {
    OPEN: '/',            // Open command menu
    UP: 'up',             // Navigate menu items
    DOWN: 'down',         // Navigate menu items
    ENTER: 'return',      // Execute selected command
    TAB: 'tab',           // Autocomplete command name
    ESCAPE: 'escape',     // Close menu
    DETAIL: 'f1',         // Show detail panel
    DETAIL_ALT: '?',      // Show detail panel (alt)
    SEARCH: 'ctrl-f',     // Focus search in menu
    PAGE_UP: 'pageup',    // Scroll up
    PAGE_DOWN: 'pagedown' // Scroll down
  };

  // Agent execution keybindings
  static AGENT = {
    INTERRUPT: 'ctrl-c',   // Interrupt current tool call
    ESCAPE: 'escape'      // Same as Ctrl+C during execution
  };

  register(keyCombo, handler) {
    this.handlers.set(keyCombo, handler);
  }

  unregister(keyCombo) {
    this.handlers.delete(keyCombo);
  }

  handle(key, meta = {}) {
    if (!this.enabled) return false;

    const combo = this.getCombo(key, meta);
    const handler = this.handlers.get(combo);

    if (handler) {
      handler(key, meta);
      return true;
    }

    return false;
  }

  getCombo(key, meta) {
    let combo = key.name;

    if (meta.ctrl) combo = 'ctrl-' + combo;
    if (meta.shift) combo = 'shift-' + combo;
    if (meta.alt) combo = 'alt-' + combo;
    if (meta.meta) combo = 'meta-' + combo;

    return combo;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }
}

export const GLOBAL_KEYS = {
  isCancelKey: (key) => key.name === 'c' && key.ctrl,
  isExitKey: (key) => key.name === 'd' && key.ctrl,
  isClearKey: (key) => key.name === 'l' && key.ctrl,
  isHistorySearch: (key) => key.name === 'r' && key.ctrl,
  isUndoKey: (key) => key.name === 'z' && key.ctrl,
  isUpKey: (key) => key.name === 'up',
  isDownKey: (key) => key.name === 'down',
  isTabKey: (key) => key.name === 'tab'
};

export default new Keybindings();