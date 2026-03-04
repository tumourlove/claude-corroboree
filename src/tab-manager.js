import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Dashboard } from './dashboard';

export class TabManager {
  constructor(containerEl, tabBarEl) {
    this.container = containerEl;
    this.tabBar = tabBarEl;
    this.tabs = new Map(); // id -> { term?, fitAddon?, termEl, tabEl, label, type, dashboard? }
    this.activeTabId = null;
    this.nextId = 1;
  }

  createTab(label = 'Session', options = {}) {
    const id = options.id || `tab-${this.nextId++}`;
    const type = options.type || 'terminal';

    // Pane element
    const termEl = document.createElement('div');
    termEl.className = type === 'dashboard' ? 'dashboard-pane' : 'terminal-pane';
    termEl.style.display = 'none';
    this.container.appendChild(termEl);

    // Tab bar button
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = id;
    tabEl.innerHTML = `
      <span class="tab-status${type === 'dashboard' ? ' status-dashboard' : ''}"></span>
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

    const addBtn = this.tabBar.querySelector('.tab-add');
    this.tabBar.insertBefore(tabEl, addBtn);

    if (type === 'dashboard') {
      const dashboard = new Dashboard(termEl);
      this.tabs.set(id, { termEl, tabEl, label, type, dashboard });
      this.activateTab(id);
      return id;
    }

    // Terminal tab
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

    term.onData((data) => window.nexus.terminalWrite(id, data));
    window.nexus.onTerminalData(id, (data) => term.write(data));

    this.tabs.set(id, { term, fitAddon, termEl, tabEl, label, type });
    this.activateTab(id);

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

    for (const [tid, t] of this.tabs) {
      t.termEl.style.display = tid === id ? 'block' : 'none';
      t.tabEl.classList.toggle('active', tid === id);
    }

    this.activeTabId = id;

    if (tab.type === 'terminal' && tab.fitAddon) {
      tab.fitAddon.fit();
      tab.term.focus();
      window.nexus.resizeTerminal(id, tab.term.cols, tab.term.rows);
    }
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (tab.type === 'dashboard' && tab.dashboard) {
      tab.dashboard.dispose();
    } else if (tab.term) {
      tab.term.dispose();
    }
    tab.termEl.remove();
    tab.tabEl.remove();
    this.tabs.delete(id);

    if (tab.type === 'terminal') {
      window.nexus.closeSession(id);
    }

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
      if (tab && tab.type === 'terminal' && tab.fitAddon) {
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

  getDashboard() {
    for (const [, tab] of this.tabs) {
      if (tab.type === 'dashboard') return tab.dashboard;
    }
    return null;
  }
}
