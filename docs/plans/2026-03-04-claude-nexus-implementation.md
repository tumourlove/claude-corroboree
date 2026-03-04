# Claude Nexus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tabbed Electron terminal app with an embedded MCP server that enables multiple Claude Code sessions to communicate, coordinate, and orchestrate work in parallel.

**Architecture:** Electron app with node-pty spawning Claude CLI processes per tab, xterm.js rendering terminals, and an embedded MCP server (stdio transport per session) acting as a message bus. Each session gets MCP tools for inter-session communication, shared scratchpad, context management, and session lifecycle control.

**Tech Stack:** Electron, xterm.js, xterm-addon-fit, xterm-addon-webgl, node-pty, @modelcontextprotocol/sdk, zod

---

## Phase 1: Project Scaffolding & Basic Terminal

### Task 1: Initialize Electron project

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron-builder.yml`

**Step 1: Initialize npm project**

Run:
```bash
cd C:/Projects/claude-nexus
npm init -y
```

**Step 2: Install dependencies**

Run:
```bash
npm install electron xterm xterm-addon-fit xterm-addon-webgl node-pty @modelcontextprotocol/sdk zod
npm install --save-dev @electron/rebuild electron-builder
```

**Step 3: Configure package.json**

Set `"main": "main.js"` and add scripts:
```json
{
  "name": "claude-nexus",
  "version": "0.1.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "rebuild": "electron-rebuild",
    "build": "electron-builder",
    "postinstall": "electron-rebuild"
  }
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.log
.env
```

**Step 5: Create electron-builder.yml**

```yaml
appId: com.claude-nexus.app
productName: Claude Nexus
directories:
  output: dist
win:
  target: [nsis, portable]
nsis:
  oneClick: false
  allowToCurrentUser: true
```

**Step 6: Rebuild native modules for Electron**

Run: `npx electron-rebuild`

**Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore electron-builder.yml
git commit -m "feat: initialize Electron project with dependencies"
```

---

### Task 2: Basic Electron window with single xterm.js terminal

**Files:**
- Create: `main.js`
- Create: `preload.js`
- Create: `index.html`
- Create: `src/renderer.js`
- Create: `src/styles.css`

**Step 1: Create main.js — Electron main process with single PTY**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const pty = require('node-pty');
const path = require('path');

let mainWindow;
let ptyProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const cwd = process.argv[2] || process.env.USERPROFILE || process.env.HOME;

  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd,
    env: process.env,
    useConpty: true,
  });

  ptyProcess.onData((data) => {
    mainWindow.webContents.send('terminal:data', data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.error(`PTY exited: ${exitCode}`);
  });
}

ipcMain.on('terminal:write', (_event, data) => {
  ptyProcess.write(data);
});

ipcMain.on('terminal:resize', (_event, { cols, rows }) => {
  try { ptyProcess.resize(cols, rows); } catch (e) { /* ignore resize errors */ }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (ptyProcess) ptyProcess.kill();
  app.quit();
});
```

**Step 2: Create preload.js — secure IPC bridge**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminal', {
  write: (data) => ipcRenderer.send('terminal:write', data),
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
  onData: (callback) => ipcRenderer.on('terminal:data', (_e, data) => callback(data)),
});
```

**Step 3: Create index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claude Nexus</title>
  <link rel="stylesheet" href="node_modules/xterm/css/xterm.css">
  <link rel="stylesheet" href="src/styles.css">
</head>
<body>
  <div id="terminal-container"></div>
  <script src="src/renderer.js"></script>
</body>
</html>
```

**Step 4: Create src/styles.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: #1a1a2e; overflow: hidden; }
#terminal-container { width: 100%; height: 100%; }
```

**Step 5: Create src/renderer.js**

```javascript
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');

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
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

term.onData((data) => window.terminal.write(data));
window.terminal.onData((data) => term.write(data));

const ro = new ResizeObserver(() => {
  fitAddon.fit();
  window.terminal.resize(term.cols, term.rows);
});
ro.observe(document.getElementById('terminal-container'));
```

**Step 6: Run and verify**

Run: `npm start`
Expected: Electron window opens with a working PowerShell terminal.

**Step 7: Commit**

```bash
git add main.js preload.js index.html src/
git commit -m "feat: basic Electron window with xterm.js terminal"
```

---

### Task 3: Tab system — multiple terminals with tab bar

**Files:**
- Create: `src/tab-manager.js`
- Modify: `main.js` — multi-PTY session management
- Modify: `preload.js` — tab-aware IPC
- Modify: `index.html` — tab bar HTML
- Modify: `src/renderer.js` — tab UI logic
- Modify: `src/styles.css` — tab bar styling

**Step 1: Create src/tab-manager.js — renderer-side tab management**

This manages the tab bar UI and xterm instances per tab.

```javascript
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');

class TabManager {
  constructor(containerEl, tabBarEl) {
    this.container = containerEl;
    this.tabBar = tabBarEl;
    this.tabs = new Map(); // id -> { term, fitAddon, termEl, tabEl, label }
    this.activeTabId = null;
    this.nextId = 1;
  }

  createTab(label = 'Session') {
    const id = `tab-${this.nextId++}`;

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
    window.nexus.createSession(id, label);

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

module.exports = { TabManager };
```

**Step 2: Update main.js — multi-session PTY management**

Replace single-PTY code with a SessionManager that tracks multiple PTYs:

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const pty = require('node-pty');
const path = require('path');

let mainWindow;
const sessions = new Map(); // id -> { pty, cwd }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
}

function spawnSession(id, cwd) {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const resolvedCwd = cwd || process.argv[2] || process.env.USERPROFILE || process.env.HOME;

  const ptyProc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: resolvedCwd,
    env: process.env,
    useConpty: true,
  });

  ptyProc.onData((data) => {
    mainWindow.webContents.send(`terminal:data:${id}`, data);
  });

  ptyProc.onExit(({ exitCode }) => {
    mainWindow.webContents.send('session:exited', { id, exitCode });
    sessions.delete(id);
  });

  sessions.set(id, { pty: ptyProc, cwd: resolvedCwd });
}

ipcMain.on('session:create', (_event, { id, label, cwd }) => {
  spawnSession(id, cwd);
});

ipcMain.on('session:close', (_event, { id }) => {
  const session = sessions.get(id);
  if (session) {
    session.pty.kill();
    sessions.delete(id);
  }
});

ipcMain.on('terminal:write', (_event, { id, data }) => {
  const session = sessions.get(id);
  if (session) session.pty.write(data);
});

ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
  const session = sessions.get(id);
  if (session) {
    try { session.pty.resize(cols, rows); } catch (e) { /* ignore */ }
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  for (const [, session] of sessions) session.pty.kill();
  app.quit();
});
```

**Step 3: Update preload.js — tab-aware IPC**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  createSession: (id, label, cwd) => ipcRenderer.send('session:create', { id, label, cwd }),
  closeSession: (id) => ipcRenderer.send('session:close', { id }),
  terminalWrite: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (id, callback) => ipcRenderer.on(`terminal:data:${id}`, (_e, data) => callback(data)),
  onSessionExited: (callback) => ipcRenderer.on('session:exited', (_e, data) => callback(data)),
});
```

**Step 4: Update index.html — add tab bar**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claude Nexus</title>
  <link rel="stylesheet" href="node_modules/xterm/css/xterm.css">
  <link rel="stylesheet" href="src/styles.css">
</head>
<body>
  <div id="tab-bar">
    <div class="tab-add" title="New tab (Ctrl+T)">+</div>
  </div>
  <div id="terminal-container"></div>
  <div id="status-bar">
    <span id="session-count">0 sessions</span>
  </div>
  <script src="src/renderer.js"></script>
</body>
</html>
```

**Step 5: Update src/renderer.js — use TabManager**

```javascript
const { TabManager } = require('./tab-manager');

const container = document.getElementById('terminal-container');
const tabBar = document.getElementById('tab-bar');
const tabManager = new TabManager(container, tabBar);

// New tab button
document.querySelector('.tab-add').addEventListener('click', () => {
  tabManager.createTab('Session');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    tabManager.createTab('Session');
  }
  if (e.ctrlKey && e.key === 'w') {
    e.preventDefault();
    if (tabManager.activeTabId) tabManager.closeTab(tabManager.activeTabId);
  }
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const ids = [...tabManager.tabs.keys()];
    const idx = ids.indexOf(tabManager.activeTabId);
    const next = e.shiftKey
      ? (idx - 1 + ids.length) % ids.length
      : (idx + 1) % ids.length;
    tabManager.activateTab(ids[next]);
  }
  // Ctrl+1-9 jump to tab
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const ids = [...tabManager.tabs.keys()];
    const idx = parseInt(e.key) - 1;
    if (idx < ids.length) tabManager.activateTab(ids[idx]);
  }
});

// Handle resize
const ro = new ResizeObserver(() => tabManager.handleResize());
ro.observe(container);

// Handle session exit
window.nexus.onSessionExited(({ id, exitCode }) => {
  tabManager.updateTabStatus(id, 'exited');
});

// Create first tab
tabManager.createTab('Lead');

// Update session count
function updateStatusBar() {
  const count = tabManager.tabs.size;
  document.getElementById('session-count').textContent = `${count} session${count !== 1 ? 's' : ''}`;
}
setInterval(updateStatusBar, 1000);
```

**Step 6: Update src/styles.css — tab bar and status bar styling**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: #1a1a2e; overflow: hidden; font-family: 'Segoe UI', sans-serif; }

/* Tab Bar */
#tab-bar {
  display: flex;
  align-items: center;
  background: #16213e;
  height: 36px;
  padding: 0 4px;
  -webkit-app-region: drag;
  overflow-x: auto;
  overflow-y: hidden;
}

#tab-bar::-webkit-scrollbar { height: 2px; }
#tab-bar::-webkit-scrollbar-thumb { background: #e94560; border-radius: 1px; }

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 28px;
  background: #1a1a2e;
  border-radius: 6px 6px 0 0;
  color: #8888aa;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  -webkit-app-region: no-drag;
  transition: background 0.15s, color 0.15s;
  margin-right: 2px;
}

.tab:hover { background: #0f3460; color: #e0e0e0; }
.tab.active { background: #1a1a2e; color: #e94560; border-top: 2px solid #e94560; }

.tab-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
}
.tab-status.status-idle { background: #888; }
.tab-status.status-working { background: #4fc3f7; animation: pulse 1.5s infinite; }
.tab-status.status-done { background: #66bb6a; }
.tab-status.status-error { background: #ef5350; }
.tab-status.status-explorer { background: #ab47bc; }
.tab-status.status-exited { background: #555; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.tab-close {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
}
.tab:hover .tab-close { opacity: 0.6; }
.tab-close:hover { opacity: 1 !important; color: #ef5350; }

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #8888aa;
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  -webkit-app-region: no-drag;
  transition: background 0.15s, color 0.15s;
}
.tab-add:hover { background: #0f3460; color: #e94560; }

/* Terminal Container */
#terminal-container {
  width: 100%;
  height: calc(100% - 36px - 24px); /* minus tab bar and status bar */
  position: relative;
}

.terminal-pane {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

/* Status Bar */
#status-bar {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 24px;
  background: #16213e;
  color: #8888aa;
  font-size: 11px;
  border-top: 1px solid #0f3460;
}
```

**Step 7: Run and verify**

Run: `npm start`
Expected: Tab bar with "Lead" tab, working terminal, Ctrl+T creates new tabs, Ctrl+W closes tabs, tab switching works.

**Step 8: Commit**

```bash
git add main.js preload.js index.html src/
git commit -m "feat: tabbed terminal with multiple PTY sessions"
```

---

## Phase 2: Claude Code Integration

### Task 4: Spawn Claude Code sessions instead of raw shells

**Files:**
- Create: `src/session-manager.js` (main process)
- Modify: `main.js` — use SessionManager
- Modify: `preload.js` — add session config options

**Step 1: Create src/session-manager.js**

This module manages Claude Code processes with proper MCP config injection.

```javascript
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SessionManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.sessions = new Map();
    this.configDir = path.join(os.homedir(), '.claude-nexus', 'configs');
    fs.mkdirSync(this.configDir, { recursive: true });
  }

  createSession(id, { label, cwd, initialPrompt, template, isLead = false }) {
    const resolvedCwd = cwd || process.env.USERPROFILE || process.env.HOME;

    // Write temporary MCP config for this session
    const mcpConfigPath = path.join(this.configDir, `mcp-${id}.json`);
    const mcpConfig = this._buildMcpConfig(id);
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

    // Build claude CLI args
    const args = ['--mcp-config', mcpConfigPath];
    if (initialPrompt) {
      args.push('--', initialPrompt);
    }

    const ptyProc = pty.spawn('claude', args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: resolvedCwd,
      env: { ...process.env },
      useConpty: true,
    });

    const session = {
      id,
      pty: ptyProc,
      label,
      cwd: resolvedCwd,
      template: template || (isLead ? 'lead' : 'implementer'),
      status: 'idle',
      isLead,
      mcpConfigPath,
      createdAt: Date.now(),
    };

    ptyProc.onData((data) => {
      this.mainWindow.webContents.send(`terminal:data:${id}`, data);
    });

    ptyProc.onExit(({ exitCode }) => {
      this.mainWindow.webContents.send('session:exited', { id, exitCode });
      this._cleanup(id);
    });

    this.sessions.set(id, session);
    this.mainWindow.webContents.send('session:created', {
      id, label, template: session.template, isLead,
    });

    return session;
  }

  closeSession(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.kill();
      this._cleanup(id);
    }
  }

  writeToSession(id, data) {
    const session = this.sessions.get(id);
    if (session) session.pty.write(data);
  }

  resizeSession(id, cols, rows) {
    const session = this.sessions.get(id);
    if (session) {
      try { session.pty.resize(cols, rows); } catch (e) { /* ignore */ }
    }
  }

  getSessionInfo(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    return {
      id: session.id,
      label: session.label,
      cwd: session.cwd,
      template: session.template,
      status: session.status,
      isLead: session.isLead,
      createdAt: session.createdAt,
    };
  }

  listSessions() {
    return [...this.sessions.values()].map(s => this.getSessionInfo(s.id));
  }

  updateStatus(id, status) {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      this.mainWindow.webContents.send('session:status', { id, status });
    }
  }

  _buildMcpConfig(sessionId) {
    // Point to the nexus MCP server script
    const serverScript = path.join(__dirname, '..', 'mcp-server', 'index.js');
    return {
      mcpServers: {
        [`nexus-${sessionId}`]: {
          type: 'stdio',
          command: 'node',
          args: [serverScript, '--session-id', sessionId],
          env: {
            NEXUS_SESSION_ID: sessionId,
            NEXUS_IPC_PATH: this._getIpcPath(),
          },
        },
      },
    };
  }

  _getIpcPath() {
    // Named pipe on Windows, Unix socket elsewhere
    if (os.platform() === 'win32') {
      return '\\\\.\\pipe\\claude-nexus-ipc';
    }
    return path.join(os.tmpdir(), 'claude-nexus-ipc.sock');
  }

  _cleanup(id) {
    const session = this.sessions.get(id);
    if (session) {
      // Remove temp MCP config
      try { fs.unlinkSync(session.mcpConfigPath); } catch (e) { /* ignore */ }
      this.sessions.delete(id);
    }
  }

  destroy() {
    for (const [id] of this.sessions) {
      this.closeSession(id);
    }
  }
}

module.exports = { SessionManager };
```

**Step 2: Update main.js to use SessionManager**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SessionManager } = require('./src/session-manager');

let mainWindow;
let sessionManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
  sessionManager = new SessionManager(mainWindow);
}

ipcMain.on('session:create', (_event, { id, label, cwd, initialPrompt, template, isLead }) => {
  sessionManager.createSession(id, { label, cwd, initialPrompt, template, isLead });
});

ipcMain.on('session:close', (_event, { id }) => {
  sessionManager.closeSession(id);
});

ipcMain.on('terminal:write', (_event, { id, data }) => {
  sessionManager.writeToSession(id, data);
});

ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
  sessionManager.resizeSession(id, cols, rows);
});

ipcMain.handle('session:list', () => {
  return sessionManager.listSessions();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (sessionManager) sessionManager.destroy();
  app.quit();
});
```

**Step 3: Update preload.js — add session config**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  createSession: (id, label, options = {}) =>
    ipcRenderer.send('session:create', { id, label, ...options }),
  closeSession: (id) => ipcRenderer.send('session:close', { id }),
  terminalWrite: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (id, callback) => ipcRenderer.on(`terminal:data:${id}`, (_e, data) => callback(data)),
  onSessionExited: (callback) => ipcRenderer.on('session:exited', (_e, data) => callback(data)),
  onSessionCreated: (callback) => ipcRenderer.on('session:created', (_e, data) => callback(data)),
  onSessionStatus: (callback) => ipcRenderer.on('session:status', (_e, data) => callback(data)),
  listSessions: () => ipcRenderer.invoke('session:list'),
});
```

**Step 4: Run and verify**

Run: `npm start`
Expected: First tab spawns `claude` CLI with MCP config flag. Claude Code starts and connects to the nexus MCP server (will fail gracefully until we build the MCP server in Phase 3).

**Step 5: Commit**

```bash
git add src/session-manager.js main.js preload.js
git commit -m "feat: SessionManager spawns Claude Code with MCP config injection"
```

---

## Phase 3: MCP Server — Inter-Session Communication

### Task 5: Core MCP server with message bus

**Files:**
- Create: `mcp-server/index.js`
- Create: `mcp-server/message-bus.js`
- Create: `mcp-server/session-registry.js`

**Step 1: Create mcp-server/session-registry.js**

```javascript
class SessionRegistry {
  constructor() {
    this.sessions = new Map();
  }

  register(sessionId, metadata = {}) {
    this.sessions.set(sessionId, {
      id: sessionId,
      status: 'idle',
      label: metadata.label || sessionId,
      template: metadata.template || 'implementer',
      registeredAt: Date.now(),
      ...metadata,
    });
  }

  unregister(sessionId) {
    this.sessions.delete(sessionId);
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  list() {
    return [...this.sessions.values()];
  }

  updateStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (session) session.status = status;
  }
}

module.exports = { SessionRegistry };
```

**Step 2: Create mcp-server/message-bus.js**

```javascript
class MessageBus {
  constructor() {
    this.messages = new Map(); // sessionId -> message[]
    this.results = new Map();  // sessionId -> result
    this.nextMsgId = 1;
  }

  send(fromId, toId, message, priority = 'normal') {
    const msg = {
      id: this.nextMsgId++,
      from: fromId,
      to: toId,
      message,
      priority,
      timestamp: Date.now(),
      read: false,
    };

    if (!this.messages.has(toId)) {
      this.messages.set(toId, []);
    }
    this.messages.get(toId).push(msg);
    return msg;
  }

  broadcast(fromId, message, allSessionIds) {
    const sent = [];
    for (const targetId of allSessionIds) {
      if (targetId !== fromId) {
        sent.push(this.send(fromId, targetId, message, 'normal'));
      }
    }
    return sent;
  }

  read(sessionId, { sinceTimestamp, limit = 50 } = {}) {
    const inbox = this.messages.get(sessionId) || [];
    let filtered = inbox;

    if (sinceTimestamp) {
      filtered = filtered.filter(m => m.timestamp > sinceTimestamp);
    }

    const result = filtered.slice(-limit);
    // Mark as read
    result.forEach(m => { m.read = true; });
    return result;
  }

  getUnreadCount(sessionId) {
    const inbox = this.messages.get(sessionId) || [];
    return inbox.filter(m => !m.read).length;
  }

  reportResult(sessionId, result, status) {
    this.results.set(sessionId, { result, status, timestamp: Date.now() });
  }

  getResult(sessionId) {
    return this.results.get(sessionId) || null;
  }
}

module.exports = { MessageBus };
```

**Step 3: Create mcp-server/index.js — MCP server entry point**

```javascript
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const net = require('net');
const { MessageBus } = require('./message-bus');
const { SessionRegistry } = require('./session-registry');

// Parse CLI args
const args = process.argv.slice(2);
const sessionIdIdx = args.indexOf('--session-id');
const SESSION_ID = sessionIdIdx !== -1 ? args[sessionIdIdx + 1] : 'unknown';
const IPC_PATH = process.env.NEXUS_IPC_PATH || '\\\\.\\pipe\\claude-nexus-ipc';

// Shared state (connected to main process via IPC)
const messageBus = new MessageBus();
const registry = new SessionRegistry();

// Connect to main Electron process for shared state
let ipcClient;

function connectToMainProcess() {
  ipcClient = net.createConnection(IPC_PATH, () => {
    // Register this session
    sendIpc({ type: 'register', sessionId: SESSION_ID });
  });

  ipcClient.on('data', (data) => {
    try {
      const messages = data.toString().split('\n').filter(Boolean);
      for (const msg of messages) {
        const parsed = JSON.parse(msg);
        handleIpcMessage(parsed);
      }
    } catch (e) {
      process.stderr.write(`IPC parse error: ${e.message}\n`);
    }
  });

  ipcClient.on('error', (err) => {
    process.stderr.write(`IPC connection error: ${err.message}\n`);
  });
}

function sendIpc(data) {
  if (ipcClient && !ipcClient.destroyed) {
    ipcClient.write(JSON.stringify(data) + '\n');
  }
}

function handleIpcMessage(msg) {
  // Handle responses from main process
  if (msg.type === 'sessions') {
    // Update local registry from main process
    msg.sessions.forEach(s => registry.register(s.id, s));
  }
  if (msg.type === 'message') {
    messageBus.send(msg.from, SESSION_ID, msg.message, msg.priority);
  }
}

// Create MCP server
const server = new McpServer({
  name: 'claude-nexus',
  version: '0.1.0',
});

// --- Core Communication Tools ---

server.tool(
  'list_sessions',
  'List all active Claude Code sessions in the Nexus terminal',
  {},
  async () => {
    sendIpc({ type: 'list_sessions' });
    // Wait briefly for response
    await new Promise(r => setTimeout(r, 100));
    const sessions = registry.list();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(sessions, null, 2),
      }],
    };
  }
);

server.tool(
  'send_message',
  'Send a message to another Claude session',
  {
    target_session_id: z.string().describe('ID of the target session'),
    message: z.string().describe('Message content'),
    priority: z.enum(['normal', 'urgent']).default('normal').describe('Message priority'),
  },
  async ({ target_session_id, message, priority }) => {
    sendIpc({
      type: 'send_message',
      from: SESSION_ID,
      to: target_session_id,
      message,
      priority,
    });
    return {
      content: [{ type: 'text', text: `Message sent to ${target_session_id}` }],
    };
  }
);

server.tool(
  'read_messages',
  'Read incoming messages from other sessions',
  {
    since_timestamp: z.number().optional().describe('Only messages after this Unix timestamp (ms)'),
    limit: z.number().default(50).describe('Max messages to return'),
  },
  async ({ since_timestamp, limit }) => {
    sendIpc({ type: 'read_messages', sessionId: SESSION_ID, since_timestamp, limit });
    await new Promise(r => setTimeout(r, 100));
    const messages = messageBus.read(SESSION_ID, { sinceTimestamp: since_timestamp, limit });
    return {
      content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }],
    };
  }
);

server.tool(
  'broadcast',
  'Send a message to all other sessions',
  {
    message: z.string().describe('Message to broadcast'),
  },
  async ({ message }) => {
    sendIpc({ type: 'broadcast', from: SESSION_ID, message });
    return {
      content: [{ type: 'text', text: 'Message broadcast to all sessions' }],
    };
  }
);

// --- Session Management Tools ---

server.tool(
  'spawn_session',
  'Spawn a new Claude Code session in a new tab',
  {
    working_directory: z.string().describe('Working directory for the new session'),
    initial_prompt: z.string().describe('Initial task/prompt for the new session'),
    label: z.string().optional().describe('Tab label'),
    template: z.enum(['implementer', 'researcher', 'reviewer', 'explorer']).default('implementer')
      .describe('Session template restricting available capabilities'),
  },
  async ({ working_directory, initial_prompt, label, template }) => {
    sendIpc({
      type: 'spawn_session',
      from: SESSION_ID,
      working_directory,
      initial_prompt,
      label: label || `Worker`,
      template,
    });
    await new Promise(r => setTimeout(r, 500));
    return {
      content: [{ type: 'text', text: `Session spawned: ${label || 'Worker'} in ${working_directory}` }],
    };
  }
);

server.tool(
  'get_session_status',
  'Check the status of a session',
  {
    session_id: z.string().describe('ID of the session to check'),
  },
  async ({ session_id }) => {
    sendIpc({ type: 'get_session_status', sessionId: session_id });
    await new Promise(r => setTimeout(r, 100));
    const session = registry.get(session_id);
    const result = messageBus.getResult(session_id);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ session, result }, null, 2),
      }],
    };
  }
);

server.tool(
  'report_result',
  'Report task completion result back to the lead session',
  {
    result: z.string().describe('Result description or data'),
    status: z.enum(['success', 'failure']).describe('Whether the task succeeded or failed'),
  },
  async ({ result, status }) => {
    sendIpc({
      type: 'report_result',
      sessionId: SESSION_ID,
      result,
      status,
    });
    return {
      content: [{ type: 'text', text: `Result reported: ${status}` }],
    };
  }
);

// --- Shared Scratchpad Tools ---

server.tool(
  'scratchpad_set',
  'Store a value in the shared scratchpad (visible to all sessions)',
  {
    key: z.string().describe('Key to store under'),
    value: z.string().describe('Value to store'),
    namespace: z.string().optional().describe('Optional namespace for organization'),
  },
  async ({ key, value, namespace }) => {
    sendIpc({ type: 'scratchpad_set', key, value, namespace, from: SESSION_ID });
    return {
      content: [{ type: 'text', text: `Stored: ${namespace ? namespace + '.' : ''}${key}` }],
    };
  }
);

server.tool(
  'scratchpad_get',
  'Retrieve a value from the shared scratchpad',
  {
    key: z.string().describe('Key to retrieve'),
    namespace: z.string().optional().describe('Optional namespace'),
  },
  async ({ key, namespace }) => {
    sendIpc({ type: 'scratchpad_get', key, namespace });
    await new Promise(r => setTimeout(r, 100));
    return {
      content: [{ type: 'text', text: `(value will be returned via IPC)` }],
    };
  }
);

server.tool(
  'scratchpad_list',
  'List all keys in the shared scratchpad',
  {
    namespace: z.string().optional().describe('Optional namespace filter'),
  },
  async ({ namespace }) => {
    sendIpc({ type: 'scratchpad_list', namespace });
    await new Promise(r => setTimeout(r, 100));
    return {
      content: [{ type: 'text', text: `(keys will be returned via IPC)` }],
    };
  }
);

// --- Cross-Session Intelligence Tools ---

server.tool(
  'read_session_history',
  'Read terminal output from another session',
  {
    session_id: z.string().describe('Session to read from'),
    last_n_lines: z.number().default(100).describe('Number of recent lines to return'),
  },
  async ({ session_id, last_n_lines }) => {
    sendIpc({ type: 'read_session_history', targetSessionId: session_id, lastNLines: last_n_lines });
    await new Promise(r => setTimeout(r, 200));
    return {
      content: [{ type: 'text', text: `(history will be returned via IPC)` }],
    };
  }
);

server.tool(
  'search_across_sessions',
  'Search through all sessions output for a pattern',
  {
    pattern: z.string().describe('Search pattern (regex supported)'),
    session_ids: z.array(z.string()).optional().describe('Specific sessions to search (default: all)'),
  },
  async ({ pattern, session_ids }) => {
    sendIpc({ type: 'search_sessions', pattern, sessionIds: session_ids });
    await new Promise(r => setTimeout(r, 300));
    return {
      content: [{ type: 'text', text: `(search results will be returned via IPC)` }],
    };
  }
);

server.tool(
  'spawn_explorer',
  'Spawn a read-only explorer session that can cross-reference other sessions',
  {
    task_description: z.string().describe('What to analyze across sessions'),
    session_ids_to_review: z.array(z.string()).describe('Which sessions to review'),
  },
  async ({ task_description, session_ids_to_review }) => {
    sendIpc({
      type: 'spawn_session',
      from: SESSION_ID,
      working_directory: process.cwd(),
      initial_prompt: `You are an explorer session. Your task: ${task_description}. Review sessions: ${session_ids_to_review.join(', ')}`,
      label: 'Explorer',
      template: 'explorer',
    });
    return {
      content: [{ type: 'text', text: `Explorer session spawned to analyze: ${task_description}` }],
    };
  }
);

// --- Context Management Tools ---

server.tool(
  'reset_session',
  'Reset a session with auto-summary (clears context, preserves progress)',
  {
    session_id: z.string().describe('Session to reset'),
    preserve_summary: z.boolean().default(true).describe('Inject summary into fresh session'),
  },
  async ({ session_id, preserve_summary }) => {
    sendIpc({ type: 'reset_session', sessionId: session_id, preserveSummary: preserve_summary });
    return {
      content: [{ type: 'text', text: `Reset requested for session ${session_id}` }],
    };
  }
);

server.tool(
  'save_checkpoint',
  'Save current session state as a named checkpoint',
  {
    label: z.string().optional().describe('Checkpoint label'),
  },
  async ({ label }) => {
    sendIpc({ type: 'save_checkpoint', sessionId: SESSION_ID, label });
    return {
      content: [{ type: 'text', text: `Checkpoint saved${label ? ': ' + label : ''}` }],
    };
  }
);

// Start server
async function main() {
  try {
    connectToMainProcess();
  } catch (e) {
    process.stderr.write(`Failed to connect to main process: ${e.message}\n`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`Nexus MCP server started for session ${SESSION_ID}\n`);
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
```

**Step 4: Commit**

```bash
git add mcp-server/
git commit -m "feat: MCP server with message bus, session registry, and all tools"
```

---

### Task 6: IPC bridge between Electron main process and MCP servers

**Files:**
- Create: `src/ipc-server.js` (main process — named pipe server)
- Create: `src/scratchpad.js` (main process — shared KV store)
- Create: `src/history-manager.js` (main process — session output logging)
- Modify: `main.js` — wire up IPC server

**Step 1: Create src/scratchpad.js**

```javascript
class Scratchpad {
  constructor() {
    this.data = new Map(); // "namespace:key" -> value
  }

  set(key, value, namespace = 'default') {
    this.data.set(`${namespace}:${key}`, { value, updatedAt: Date.now() });
  }

  get(key, namespace = 'default') {
    const entry = this.data.get(`${namespace}:${key}`);
    return entry ? entry.value : null;
  }

  list(namespace) {
    const prefix = namespace ? `${namespace}:` : '';
    const keys = [];
    for (const [k, v] of this.data) {
      if (!namespace || k.startsWith(prefix)) {
        keys.push({ key: k.replace(prefix, ''), value: v.value, updatedAt: v.updatedAt });
      }
    }
    return keys;
  }

  delete(key, namespace = 'default') {
    this.data.delete(`${namespace}:${key}`);
  }
}

module.exports = { Scratchpad };
```

**Step 2: Create src/history-manager.js**

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

class HistoryManager {
  constructor() {
    this.historyDir = path.join(os.homedir(), '.claude-nexus', 'history');
    fs.mkdirSync(this.historyDir, { recursive: true });
    this.buffers = new Map(); // sessionId -> string[]
  }

  appendOutput(sessionId, data) {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
    }
    this.buffers.get(sessionId).push(data);

    // Keep buffer bounded (last 10000 lines worth)
    const buf = this.buffers.get(sessionId);
    if (buf.length > 10000) {
      this.buffers.set(sessionId, buf.slice(-5000));
    }
  }

  getRecentOutput(sessionId, lastNLines = 100) {
    const buf = this.buffers.get(sessionId) || [];
    const text = buf.join('');
    const lines = text.split('\n');
    return lines.slice(-lastNLines).join('\n');
  }

  searchAcrossSessions(pattern, sessionIds) {
    const regex = new RegExp(pattern, 'gi');
    const results = {};

    const targets = sessionIds || [...this.buffers.keys()];
    for (const id of targets) {
      const buf = this.buffers.get(id) || [];
      const text = buf.join('');
      const matches = [];
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (regex.test(line)) {
          matches.push({ line: i + 1, text: line.trim() });
        }
        regex.lastIndex = 0;
      });
      if (matches.length > 0) {
        results[id] = matches.slice(-50); // last 50 matches per session
      }
    }
    return results;
  }

  saveToFile(sessionId, label = '') {
    const buf = this.buffers.get(sessionId) || [];
    const filename = `${sessionId}-${Date.now()}${label ? '-' + label : ''}.log`;
    const filepath = path.join(this.historyDir, filename);
    fs.writeFileSync(filepath, buf.join(''));
    return filepath;
  }
}

module.exports = { HistoryManager };
```

**Step 3: Create src/ipc-server.js — named pipe server for MCP communication**

```javascript
const net = require('net');
const os = require('os');
const path = require('path');

class IpcServer {
  constructor({ sessionManager, scratchpad, historyManager, onSpawnRequest }) {
    this.sessionManager = sessionManager;
    this.scratchpad = scratchpad;
    this.historyManager = historyManager;
    this.onSpawnRequest = onSpawnRequest;
    this.clients = new Map(); // sessionId -> socket
    this.server = null;
  }

  getIpcPath() {
    if (os.platform() === 'win32') {
      return '\\\\.\\pipe\\claude-nexus-ipc';
    }
    return path.join(os.tmpdir(), 'claude-nexus-ipc.sock');
  }

  start() {
    const ipcPath = this.getIpcPath();

    this.server = net.createServer((socket) => {
      let sessionId = null;
      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            sessionId = this._handleMessage(msg, socket, sessionId);
          } catch (e) {
            process.stderr.write(`IPC parse error: ${e.message}\n`);
          }
        }
      });

      socket.on('close', () => {
        if (sessionId) this.clients.delete(sessionId);
      });

      socket.on('error', () => {
        if (sessionId) this.clients.delete(sessionId);
      });
    });

    this.server.listen(ipcPath, () => {
      process.stderr.write(`IPC server listening on ${ipcPath}\n`);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Clean up stale socket and retry
        require('fs').unlinkSync(ipcPath);
        this.server.listen(ipcPath);
      }
    });
  }

  _handleMessage(msg, socket, currentSessionId) {
    switch (msg.type) {
      case 'register':
        this.clients.set(msg.sessionId, socket);
        return msg.sessionId;

      case 'list_sessions': {
        const sessions = this.sessionManager.listSessions();
        this._reply(socket, { type: 'sessions', sessions });
        break;
      }

      case 'send_message': {
        const targetSocket = this.clients.get(msg.to);
        if (targetSocket) {
          this._reply(targetSocket, {
            type: 'message',
            from: msg.from,
            message: msg.message,
            priority: msg.priority,
          });
        }
        break;
      }

      case 'broadcast': {
        for (const [id, s] of this.clients) {
          if (id !== msg.from) {
            this._reply(s, { type: 'message', from: msg.from, message: msg.message, priority: 'normal' });
          }
        }
        break;
      }

      case 'spawn_session': {
        if (this.onSpawnRequest) {
          this.onSpawnRequest({
            cwd: msg.working_directory,
            initialPrompt: msg.initial_prompt,
            label: msg.label,
            template: msg.template,
            requestedBy: msg.from,
          });
        }
        break;
      }

      case 'report_result': {
        // Forward to lead session
        for (const [id, s] of this.clients) {
          const session = this.sessionManager.getSessionInfo(id);
          if (session && session.isLead) {
            this._reply(s, {
              type: 'message',
              from: msg.sessionId,
              message: `[RESULT ${msg.status}] ${msg.result}`,
              priority: 'urgent',
            });
          }
        }
        break;
      }

      case 'scratchpad_set':
        this.scratchpad.set(msg.key, msg.value, msg.namespace);
        break;

      case 'scratchpad_get': {
        const value = this.scratchpad.get(msg.key, msg.namespace);
        this._reply(socket, { type: 'scratchpad_value', key: msg.key, value });
        break;
      }

      case 'scratchpad_list': {
        const keys = this.scratchpad.list(msg.namespace);
        this._reply(socket, { type: 'scratchpad_keys', keys });
        break;
      }

      case 'read_session_history': {
        const output = this.historyManager.getRecentOutput(msg.targetSessionId, msg.lastNLines);
        this._reply(socket, { type: 'session_history', sessionId: msg.targetSessionId, output });
        break;
      }

      case 'search_sessions': {
        const results = this.historyManager.searchAcrossSessions(msg.pattern, msg.sessionIds);
        this._reply(socket, { type: 'search_results', results });
        break;
      }

      case 'reset_session': {
        // Save history, then tell session manager to respawn
        this.historyManager.saveToFile(msg.sessionId, 'pre-reset');
        // TODO: implement session respawn in session-manager
        break;
      }

      case 'save_checkpoint': {
        const filepath = this.historyManager.saveToFile(msg.sessionId, msg.label || 'checkpoint');
        this._reply(socket, { type: 'checkpoint_saved', filepath });
        break;
      }

      case 'get_session_status': {
        const session = this.sessionManager.getSessionInfo(msg.sessionId);
        this._reply(socket, { type: 'session_status', session });
        break;
      }
    }

    return currentSessionId;
  }

  _reply(socket, data) {
    try {
      socket.write(JSON.stringify(data) + '\n');
    } catch (e) {
      // Socket may have closed
    }
  }

  stop() {
    if (this.server) this.server.close();
  }
}

module.exports = { IpcServer };
```

**Step 4: Update main.js — wire everything together**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SessionManager } = require('./src/session-manager');
const { IpcServer } = require('./src/ipc-server');
const { Scratchpad } = require('./src/scratchpad');
const { HistoryManager } = require('./src/history-manager');

let mainWindow;
let sessionManager;
let ipcServer;
let scratchpad;
let historyManager;
let tabCounter = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');

  sessionManager = new SessionManager(mainWindow);
  scratchpad = new Scratchpad();
  historyManager = new HistoryManager();

  // Capture terminal output for history
  sessionManager.onOutput = (id, data) => {
    historyManager.appendOutput(id, data);
  };

  ipcServer = new IpcServer({
    sessionManager,
    scratchpad,
    historyManager,
    onSpawnRequest: ({ cwd, initialPrompt, label, template, requestedBy }) => {
      tabCounter++;
      const id = `tab-${tabCounter}`;
      // Tell renderer to create the tab
      mainWindow.webContents.send('session:spawn-requested', {
        id, label, cwd, initialPrompt, template,
      });
    },
  });

  ipcServer.start();
}

ipcMain.on('session:create', (_event, { id, label, cwd, initialPrompt, template, isLead }) => {
  sessionManager.createSession(id, { label, cwd, initialPrompt, template, isLead });
});

ipcMain.on('session:close', (_event, { id }) => {
  sessionManager.closeSession(id);
});

ipcMain.on('terminal:write', (_event, { id, data }) => {
  sessionManager.writeToSession(id, data);
});

ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
  sessionManager.resizeSession(id, cols, rows);
});

ipcMain.handle('session:list', () => sessionManager.listSessions());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (ipcServer) ipcServer.stop();
  if (sessionManager) sessionManager.destroy();
  app.quit();
});
```

**Step 5: Update session-manager.js — add output callback**

Add this to the `createSession` method after the `ptyProc.onData` handler:

```javascript
// In createSession, modify the onData handler:
ptyProc.onData((data) => {
  this.mainWindow.webContents.send(`terminal:data:${id}`, data);
  if (this.onOutput) this.onOutput(id, data);
});
```

And add the property initialization in the constructor:
```javascript
this.onOutput = null; // set by main.js
```

**Step 6: Commit**

```bash
git add src/ipc-server.js src/scratchpad.js src/history-manager.js main.js src/session-manager.js
git commit -m "feat: IPC bridge connecting MCP servers to Electron main process"
```

---

## Phase 4: Conflict Detection & Git Worktree Management

### Task 7: File conflict detection

**Files:**
- Create: `src/conflict-detector.js`
- Modify: `src/ipc-server.js` — add conflict check handler

**Step 1: Create src/conflict-detector.js**

```javascript
class ConflictDetector {
  constructor() {
    // sessionId -> Set<filepath>
    this.fileEdits = new Map();
  }

  recordEdit(sessionId, filepath) {
    if (!this.fileEdits.has(sessionId)) {
      this.fileEdits.set(sessionId, new Set());
    }
    this.fileEdits.get(sessionId).add(filepath);
  }

  checkConflict(sessionId, filepath) {
    const conflicts = [];
    for (const [otherId, files] of this.fileEdits) {
      if (otherId !== sessionId && files.has(filepath)) {
        conflicts.push(otherId);
      }
    }
    return conflicts;
  }

  getSessionFiles(sessionId) {
    return [...(this.fileEdits.get(sessionId) || [])];
  }

  clearSession(sessionId) {
    this.fileEdits.delete(sessionId);
  }
}

module.exports = { ConflictDetector };
```

**Step 2: Wire into IPC server**

Add conflict detection to `src/ipc-server.js`:
- Import `ConflictDetector` in constructor
- Add `file_edit` message type that records edits and checks for conflicts
- Sends warning messages to conflicting sessions

**Step 3: Commit**

```bash
git add src/conflict-detector.js src/ipc-server.js
git commit -m "feat: file conflict detection across sessions"
```

---

### Task 8: Auto git worktree management

**Files:**
- Create: `src/worktree-manager.js`
- Modify: `src/session-manager.js` — option to create worktree per session

**Step 1: Create src/worktree-manager.js**

```javascript
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class WorktreeManager {
  constructor() {
    this.worktrees = new Map(); // sessionId -> { path, branch }
  }

  createWorktree(sessionId, repoPath) {
    const branch = `nexus-${sessionId}-${Date.now()}`;
    const worktreePath = path.join(repoPath, '.nexus-worktrees', sessionId);
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    try {
      execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
    } catch (e) {
      throw new Error(`Failed to create worktree: ${e.message}`);
    }

    this.worktrees.set(sessionId, { path: worktreePath, branch, repoPath });
    return { path: worktreePath, branch };
  }

  removeWorktree(sessionId) {
    const wt = this.worktrees.get(sessionId);
    if (!wt) return;

    try {
      execSync(`git worktree remove "${wt.path}" --force`, {
        cwd: wt.repoPath,
        stdio: 'pipe',
      });
      execSync(`git branch -D "${wt.branch}"`, {
        cwd: wt.repoPath,
        stdio: 'pipe',
      });
    } catch (e) {
      // Best effort cleanup
    }

    this.worktrees.delete(sessionId);
  }

  getWorktree(sessionId) {
    return this.worktrees.get(sessionId);
  }

  cleanup() {
    for (const [id] of this.worktrees) {
      this.removeWorktree(id);
    }
  }
}

module.exports = { WorktreeManager };
```

**Step 2: Integrate with SessionManager**

Update `src/session-manager.js` to optionally create a worktree when spawning a session, using the worktree path as the session's cwd.

**Step 3: Commit**

```bash
git add src/worktree-manager.js src/session-manager.js
git commit -m "feat: auto git worktree management for session isolation"
```

---

## Phase 5: Notifications & Progress Dashboard

### Task 9: Notification system

**Files:**
- Create: `src/notification-manager.js`
- Modify: `preload.js` — add notification IPC
- Modify: `src/renderer.js` — toast notifications
- Modify: `src/styles.css` — toast styling

**Step 1: Create src/notification-manager.js (main process)**

```javascript
const { Notification } = require('electron');

class NotificationManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  notify({ title, body, type = 'info', sessionId }) {
    // System tray notification
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body, silent: false });
      notification.show();
    }

    // In-app toast
    this.mainWindow.webContents.send('notification:toast', {
      title, body, type, sessionId, timestamp: Date.now(),
    });
  }
}

module.exports = { NotificationManager };
```

**Step 2: Add toast rendering in renderer**

Add a toast container to `index.html` and CSS animations for slide-in/fade-out toasts. Wire up the `notification:toast` IPC event to create toast elements.

**Step 3: Commit**

```bash
git add src/notification-manager.js src/renderer.js src/styles.css index.html preload.js
git commit -m "feat: notification system with system tray and in-app toasts"
```

---

### Task 10: Progress dashboard tab

**Files:**
- Create: `src/dashboard.js` (renderer)
- Modify: `src/tab-manager.js` — support non-terminal dashboard tab
- Modify: `src/styles.css` — dashboard styling

**Step 1: Create src/dashboard.js**

A special tab that shows:
- List of all sessions with status, label, template
- Message bus activity log
- Scratchpad contents
- Task dependency visualization (simple text-based for v1)

This is a DOM-based panel (not xterm) that polls session state and renders it.

**Step 2: Add dashboard tab type to TabManager**

Modify `TabManager.createTab` to accept a `type` parameter. When `type === 'dashboard'`, create a DOM panel instead of an xterm instance.

**Step 3: Add Ctrl+D keyboard shortcut to toggle dashboard**

**Step 4: Commit**

```bash
git add src/dashboard.js src/tab-manager.js src/styles.css
git commit -m "feat: progress dashboard with session overview and message log"
```

---

## Phase 6: Windows Explorer Integration & App Polish

### Task 11: Windows Explorer shell integration

**Files:**
- Create: `scripts/register-shell.js` — registry entries for Explorer integration
- Modify: `electron-builder.yml` — run registration on install

**Step 1: Create scripts/register-shell.js**

Uses `regedit` or `child_process` to add:
- Shell command `nexus` in Explorer address bar
- Right-click context menu entry "Open in Claude Nexus" for folders

```javascript
const { execSync } = require('child_process');
const path = require('path');

const exePath = path.join(process.resourcesPath, '..', 'Claude Nexus.exe');

// Right-click context menu for folders
const regCommands = [
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\shell\\ClaudeNexus\\command" /ve /d "\\"${exePath}\\" \\"%V\\"" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus" /ve /d "Open in Claude Nexus" /f`,
  `reg add "HKCU\\Software\\Classes\\Directory\\Background\\shell\\ClaudeNexus\\command" /ve /d "\\"${exePath}\\" \\"%V\\"" /f`,
];

for (const cmd of regCommands) {
  try { execSync(cmd); } catch (e) { console.error(e.message); }
}
```

**Step 2: Wire into electron-builder as afterInstall hook**

**Step 3: Commit**

```bash
git add scripts/register-shell.js electron-builder.yml
git commit -m "feat: Windows Explorer shell integration (right-click + address bar)"
```

---

### Task 12: Project picker on standalone launch

**Files:**
- Create: `src/project-picker.js` (renderer)
- Modify: `main.js` — show picker when no directory arg
- Modify: `index.html` — picker HTML
- Modify: `src/styles.css` — picker styling

**Step 1: Create project picker UI**

A modal/page shown on launch with:
- Recent projects list (persisted in `~/.claude-nexus/preferences.json`)
- "Browse..." button using Electron's `dialog.showOpenDialog`
- Project names shown with folder path

**Step 2: Persist recent projects**

Save last 10 opened projects to `~/.claude-nexus/preferences.json`.

**Step 3: Commit**

```bash
git add src/project-picker.js main.js index.html src/styles.css
git commit -m "feat: project picker with recent projects on standalone launch"
```

---

### Task 13: Session history panel

**Files:**
- Create: `src/history-panel.js` (renderer)
- Modify: `preload.js` — history IPC
- Modify: `main.js` — serve history data

**Step 1: Create history panel**

"Meanwhile in NEXUS..." sidebar or panel showing:
- Past session summaries grouped by date
- Click to view full output log
- Search within history

**Step 2: Commit**

```bash
git add src/history-panel.js preload.js main.js
git commit -m "feat: session history panel with 'Meanwhile in NEXUS' view"
```

---

### Task 14: CLAUDE.md and final polish

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`
- Verify all features work end-to-end

**Step 1: Create CLAUDE.md**

Document project structure, architecture, commands, and development workflow.

**Step 2: End-to-end test**

1. Launch app
2. First tab opens Claude Code with MCP
3. Tell Claude to spawn a worker session
4. Verify worker tab appears
5. Verify inter-session messaging works
6. Verify scratchpad works
7. Verify dashboard shows all sessions
8. Verify notifications fire
9. Test context reset
10. Close app cleanly

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add CLAUDE.md and README for Claude Nexus"
```

---

## Task Dependency Graph

```
Task 1 (scaffold) → Task 2 (basic terminal) → Task 3 (tabs)
                                                     ↓
                                              Task 4 (Claude Code)
                                                     ↓
                                              Task 5 (MCP server)
                                                     ↓
                                              Task 6 (IPC bridge)
                                                   ↙   ↘
                                    Task 7 (conflicts)  Task 9 (notifications)
                                         ↓                    ↓
                                    Task 8 (worktrees)  Task 10 (dashboard)
                                                   ↘   ↙
                                              Task 11 (Explorer)
                                                     ↓
                                              Task 12 (project picker)
                                                     ↓
                                              Task 13 (history)
                                                     ↓
                                              Task 14 (polish)
```
