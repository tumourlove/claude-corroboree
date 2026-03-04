import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export class TabManager {
  constructor(containerEl, tabBarEl) {
    this.container = containerEl;
    this.tabBar = tabBarEl;
    this.tabs = new Map(); // id -> { term, fitAddon, termEl, tabEl, label }
    this.activeTabId = null;
    this.nextId = 1;
  }

  createTab(label = 'Session', options = {}) {
    const id = options.id || `tab-${this.nextId++}`;

    // Terminal element
    const termEl = document.createElement('div');
    termEl.className = 'terminal-pane';
    termEl.style.display = 'none';
    this.container.appendChild(termEl);

    // xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#e94560',
        selectionBackground: '#e9456040',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termEl);

    // Tab bar button
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = id;
    tabEl.innerHTML = `
      <span class="tab-status"></span>
      <span class="tab-label">${label}</span>
      <span class="tab-close">&times;</span>
    `;
    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        this.closeTab(id);
      } else {
        this.activateTab(id);
      }
    });

    // Insert before the + button
    const addBtn = this.tabBar.querySelector('.tab-add');
    this.tabBar.insertBefore(tabEl, addBtn);

    // Wire up terminal I/O
    term.onData((data) => window.nexus.terminalWrite(id, data));
    window.nexus.onTerminalData(id, (data) => term.write(data));

    this.tabs.set(id, { term, fitAddon, termEl, tabEl, label });
    this.activateTab(id);

    // Tell main process to spawn PTY
    window.nexus.createSession(id, label, {
      cwd: options.cwd,
      initialPrompt: options.initialPrompt,
      template: options.template,
      isLead: options.isLead,
    });

    return id;
  }

  activateTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Hide all terminals, show selected
    for (const [tid, t] of this.tabs) {
      t.termEl.style.display = tid === id ? 'block' : 'none';
      t.tabEl.classList.toggle('active', tid === id);
    }

    this.activeTabId = id;
    tab.fitAddon.fit();
    tab.term.focus();
    window.nexus.resizeTerminal(id, tab.term.cols, tab.term.rows);
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    tab.term.dispose();
    tab.termEl.remove();
    tab.tabEl.remove();
    this.tabs.delete(id);

    window.nexus.closeSession(id);

    // Activate another tab if this was active
    if (this.activeTabId === id) {
      const remaining = [...this.tabs.keys()];
      if (remaining.length > 0) {
        this.activateTab(remaining[remaining.length - 1]);
      }
    }
  }

  handleResize() {
    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId);
      if (tab) {
        tab.fitAddon.fit();
        window.nexus.resizeTerminal(this.activeTabId, tab.term.cols, tab.term.rows);
      }
    }
  }

  updateTabStatus(id, status) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const statusEl = tab.tabEl.querySelector('.tab-status');
    statusEl.className = `tab-status status-${status}`;
  }

  updateTabLabel(id, label) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.label = label;
    tab.tabEl.querySelector('.tab-label').textContent = label;
  }
}
