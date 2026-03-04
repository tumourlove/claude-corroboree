# Nexus Autopilot (v0.2.0) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Nexus dashboard with live session previews, controls, tab badges, stuck detection, auto-retry, result aggregation, status tracking, and persistent scratchpad.

**Architecture:** Event-driven updates from SessionManager through IPC to renderer. Dashboard rewritten as card-based layout with controls. Scratchpad persisted to JSON on disk.

**Tech Stack:** Electron IPC, xterm.js, node-pty output monitoring, fs for persistence.

---

### Task 1: Persistent Scratchpad

**Files:**
- Modify: `src/scratchpad.js`

**Step 1: Add disk persistence to Scratchpad class**

Replace `src/scratchpad.js` with:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

class Scratchpad {
  constructor() {
    this.data = new Map();
    this.filePath = path.join(os.homedir(), '.claude-nexus', 'scratchpad.json');
    this._saveTimer = null;
    this._load();
  }

  set(key, value, namespace = 'default') {
    this.data.set(`${namespace}:${key}`, { value, updatedAt: Date.now() });
    this._scheduleSave();
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
    this._scheduleSave();
  }

  _load() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [k, v] of Object.entries(raw)) {
          if (v.updatedAt > sevenDaysAgo) {
            this.data.set(k, v);
          }
        }
      }
    } catch (e) {
      // Start fresh if file is corrupt
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 1000);
  }

  _save() {
    try {
      const obj = {};
      for (const [k, v] of this.data) obj[k] = v;
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
    } catch (e) {
      // Ignore write errors
    }
  }
}

module.exports = { Scratchpad };
```

**Step 2: Verify scratchpad dir exists**

Run: `ls ~/.claude-nexus/` (should already exist from configs dir)

**Step 3: Commit**

```bash
git add src/scratchpad.js
git commit -m "feat: persist scratchpad to disk with auto-save and stale cleanup"
```

---

### Task 2: Session Status Tracking

**Files:**
- Modify: `src/session-manager.js:73-76` (onData handler)
- Modify: `src/session-manager.js:60-71` (session object)

**Step 1: Add output monitoring and status detection to SessionManager**

In `src/session-manager.js`, add these properties to the session object (after line 70 `createdAt: Date.now(),`):

```javascript
      lastOutputAt: Date.now(),
```

Then replace the `ptyProc.onData` handler (lines 73-76) with:

```javascript
    ptyProc.onData((data) => {
      this.mainWindow.webContents.send(`terminal:data:${id}`, data);
      if (this.onOutput) this.onOutput(id, data);

      // Track activity for status detection
      session.lastOutputAt = Date.now();

      // Detect idle state (prompt character visible)
      if (data.includes('\u276f') || data.includes('❯')) {
        this.updateStatus(id, 'idle');
      } else if (session.status === 'idle') {
        this.updateStatus(id, 'working');
      }

      // Push preview lines to dashboard
      this._emitPreview(id, data);
    });
```

**Step 2: Add preview emission method**

Add this method to SessionManager (before `_findExecutable`):

```javascript
  _emitPreview(id, data) {
    // Strip ANSI codes for clean preview text
    const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
    const session = this.sessions.get(id);
    if (!session) return;
    if (!session._previewBuffer) session._previewBuffer = '';
    session._previewBuffer += clean;
    // Keep only last ~500 chars
    if (session._previewBuffer.length > 500) {
      session._previewBuffer = session._previewBuffer.slice(-500);
    }
    // Debounce: only send every 500ms
    if (!session._previewTimer) {
      session._previewTimer = setTimeout(() => {
        session._previewTimer = null;
        const lines = session._previewBuffer.split('\n').filter(l => l.trim()).slice(-5);
        this.mainWindow.webContents.send('session:output-preview', { id, lines });
      }, 500);
    }
  }
```

**Step 3: Update the onExit handler to set status**

Replace the `ptyProc.onExit` handler (lines 78-81) with:

```javascript
    ptyProc.onExit(({ exitCode }) => {
      this.updateStatus(id, exitCode === 0 ? 'done' : 'error');
      this.mainWindow.webContents.send('session:exited', { id, exitCode });
      this._cleanup(id);
    });
```

**Step 4: Commit**

```bash
git add src/session-manager.js
git commit -m "feat: real-time session status tracking and output preview emission"
```

---

### Task 3: Stuck Detection

**Files:**
- Modify: `src/session-manager.js` (add stuck check timer)
- Modify: `main.js` (wire up notification)

**Step 1: Add stuck detection timer to SessionManager**

Add to the `constructor` method in SessionManager (after line 14 `this.worktreeManager = new WorktreeManager();`):

```javascript
    this.stuckThresholdMs = 60000; // 60 seconds
    this._stuckCheckInterval = setInterval(() => this._checkStuck(), 10000);
```

Add the `_checkStuck` method (before `_findExecutable`):

```javascript
  _checkStuck() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status === 'working' && (now - session.lastOutputAt) > this.stuckThresholdMs) {
        this.updateStatus(id, 'stuck');
        this.mainWindow.webContents.send('session:stuck-warning', {
          id,
          lastOutputAge: Math.round((now - session.lastOutputAt) / 1000),
        });
      }
    }
  }
```

**Step 2: Clean up timer in destroy**

In the `destroy` method, add before the for loop:

```javascript
    if (this._stuckCheckInterval) clearInterval(this._stuckCheckInterval);
```

**Step 3: Commit**

```bash
git add src/session-manager.js
git commit -m "feat: stuck detection warns when sessions idle for 60s while working"
```

---

### Task 4: Session Restart and Result Collection in Main Process

**Files:**
- Modify: `main.js` (add new IPC handlers)
- Modify: `preload.js` (expose new methods)

**Step 1: Add new IPC handlers in main.js**

Add after the existing `ipcMain.handle('session:history', ...)` block:

```javascript
ipcMain.on('session:cancel', (_event, { id }) => {
  sessionManager.writeToSession(id, '\x03'); // SIGINT
});

ipcMain.on('session:restart', (_event, { id }) => {
  const info = sessionManager.getSessionInfo(id);
  if (!info) return;
  sessionManager.closeSession(id);
  // Small delay so the old session fully cleans up
  setTimeout(() => {
    sessionManager.createSession(id, {
      label: info.label,
      cwd: info.cwd,
      template: info.template,
      isLead: info.isLead,
    });
  }, 500);
});

ipcMain.on('session:send-quick-message', (_event, { id, text }) => {
  if (ipcServer) {
    ipcServer.sendToSession(id, {
      type: 'message',
      from: 'user',
      message: text,
      priority: 'normal',
    });
  }
});

ipcMain.on('session:broadcast-message', (_event, { text }) => {
  if (ipcServer) {
    for (const [sid, socket] of ipcServer.clients) {
      ipcServer._reply(socket, {
        type: 'message',
        from: 'user',
        message: text,
        priority: 'normal',
      });
    }
  }
});

ipcMain.handle('app:update-claude', async () => {
  const { execSync } = require('child_process');
  try {
    const output = execSync('claude update', { encoding: 'utf8', timeout: 30000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, output: e.message };
  }
});
```

**Step 2: Add sendToSession helper to IpcServer**

In `src/ipc-server.js`, add this method to IpcServer class (before `_reply`):

```javascript
  sendToSession(sessionId, data) {
    const socket = this.clients.get(sessionId);
    if (socket) this._reply(socket, data);
  }
```

**Step 3: Store the initial prompt on session for restart**

In `src/session-manager.js`, add `initialPrompt` to the session object (in `createSession`, in the session object after `createdAt`):

```javascript
      initialPrompt: initialPrompt || null,
```

And include it in `getSessionInfo` (after `isLead: session.isLead,`):

```javascript
      initialPrompt: session.initialPrompt,
```

**Step 4: Update preload.js**

Add to the `window.nexus` object:

```javascript
  cancelSession: (id) => ipcRenderer.send('session:cancel', { id }),
  restartSession: (id) => ipcRenderer.send('session:restart', { id }),
  sendQuickMessage: (id, text) => ipcRenderer.send('session:send-quick-message', { id, text }),
  broadcastMessage: (text) => ipcRenderer.send('session:broadcast-message', { text }),
  updateClaude: () => ipcRenderer.invoke('app:update-claude'),
  onOutputPreview: (cb) => ipcRenderer.on('session:output-preview', (_e, d) => cb(d)),
  onStuckWarning: (cb) => ipcRenderer.on('session:stuck-warning', (_e, d) => cb(d)),
```

**Step 5: Commit**

```bash
git add main.js src/ipc-server.js src/session-manager.js preload.js
git commit -m "feat: add session cancel, restart, messaging, and claude update IPC handlers"
```

---

### Task 5: Result Aggregation in IPC Server

**Files:**
- Modify: `src/ipc-server.js:116-129` (report_result handler)

**Step 1: Add results storage and completion detection**

In `IpcServer` constructor, add after `this.server = null;`:

```javascript
    this.results = new Map(); // sessionId -> { result, status, timestamp }
    this.spawnedWorkers = new Set(); // track worker session IDs
```

Replace the `report_result` case in `_handleMessage`:

```javascript
      case 'report_result': {
        // Store result
        this.results.set(msg.sessionId, {
          result: msg.result,
          status: msg.status,
          timestamp: Date.now(),
        });

        // Store in scratchpad for persistence
        this.scratchpad.set(msg.sessionId, JSON.stringify({
          result: msg.result,
          status: msg.status,
          timestamp: Date.now(),
        }), '_results');

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

        // Notify renderer of result
        if (this.sessionManager.mainWindow) {
          this.sessionManager.mainWindow.webContents.send('session:result', {
            id: msg.sessionId,
            result: msg.result,
            status: msg.status,
            timestamp: Date.now(),
          });
        }

        // Check if all workers complete
        this.spawnedWorkers.add(msg.sessionId);
        const allSessions = this.sessionManager.listSessions();
        const workers = allSessions.filter(s => !s.isLead);
        const allDone = workers.length > 0 && workers.every(w => this.results.has(w.id));
        if (allDone && workers.length > 0) {
          const allResults = workers.map(w => ({
            id: w.id,
            label: w.label,
            ...this.results.get(w.id),
          }));
          this.sessionManager.mainWindow.webContents.send('workers:all-complete', { results: allResults });
        }
        break;
      }
```

**Step 2: Add IPC handler for fetching results**

Add a new case in `_handleMessage`:

```javascript
      case 'get_results': {
        const results = [];
        for (const [id, r] of this.results) {
          const session = this.sessionManager.getSessionInfo(id);
          results.push({ id, label: session?.label || id, ...r });
        }
        this._reply(socket, { type: 'results', results });
        break;
      }
```

**Step 3: Add getResults to preload**

```javascript
  onSessionResult: (cb) => ipcRenderer.on('session:result', (_e, d) => cb(d)),
  onAllWorkersComplete: (cb) => ipcRenderer.on('workers:all-complete', (_e, d) => cb(d)),
```

**Step 4: Commit**

```bash
git add src/ipc-server.js preload.js
git commit -m "feat: result aggregation with worker completion detection"
```

---

### Task 6: Tab Badges

**Files:**
- Modify: `src/tab-manager.js` (add badge tracking and rendering)
- Modify: `src/styles.css` (badge styles)

**Step 1: Add badge tracking to TabManager**

In the TabManager constructor, add:

```javascript
    this.unreadCounts = new Map(); // id -> number
```

Add these methods to TabManager:

```javascript
  incrementBadge(id) {
    if (id === this.activeTabId) return; // don't badge active tab
    const count = (this.unreadCounts.get(id) || 0) + 1;
    this.unreadCounts.set(id, count);
    this._renderBadge(id);
  }

  clearBadge(id) {
    this.unreadCounts.delete(id);
    this._renderBadge(id);
  }

  _renderBadge(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const labelEl = tab.tabEl.querySelector('.tab-label');
    // Remove existing badge
    const existing = tab.tabEl.querySelector('.tab-badge');
    if (existing) existing.remove();

    const count = this.unreadCounts.get(id) || 0;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = count > 9 ? '9+' : count;
      labelEl.after(badge);
    }
  }
```

**Step 2: Clear badge on tab activate**

In the `activateTab` method, add after `this.activeTabId = id;`:

```javascript
    this.clearBadge(id);
```

**Step 3: Add badge styles to styles.css**

Append to styles.css:

```css
/* Tab Badges */
.tab-badge {
  background: #e94560;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  margin-left: 4px;
}
```

**Step 4: Commit**

```bash
git add src/tab-manager.js src/styles.css
git commit -m "feat: tab badges showing unread message count"
```

---

### Task 7: Dashboard Rewrite — Preview Cards with Controls

**Files:**
- Modify: `src/dashboard.js` (complete rewrite)
- Modify: `src/styles.css` (card styles)

**Step 1: Rewrite dashboard.js**

Replace the entire file with:

```javascript
export class Dashboard {
  constructor(containerEl) {
    this.container = containerEl;
    this.container.className = 'dashboard';
    this.previews = new Map(); // id -> string[]
    this.results = [];
    this._render();
    this._bindEvents();
  }

  _render() {
    this.container.innerHTML = `
      <div class="dash-toolbar">
        <h2>Nexus Dashboard</h2>
        <div class="dash-toolbar-actions">
          <button class="dash-btn" id="dash-broadcast-btn" title="Broadcast message to all sessions">Broadcast</button>
          <button class="dash-btn" id="dash-update-claude-btn" title="Update Claude Code CLI">Update Claude</button>
          <button class="dash-btn" id="dash-update-nexus-btn" title="Check for Nexus updates">Update Nexus</button>
        </div>
      </div>
      <div class="dash-cards" id="dash-cards">
        <div class="dashboard-empty">No sessions yet</div>
      </div>
      <div class="dash-results-panel" id="dash-results" style="display:none">
        <h3>Worker Results</h3>
        <div class="dash-results-list" id="dash-results-list"></div>
      </div>
      <div class="dash-log-panel">
        <h3>Activity</h3>
        <div class="dashboard-log" id="dash-log">
          <div class="dashboard-empty">No activity yet</div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#dash-broadcast-btn').addEventListener('click', () => {
      const text = prompt('Broadcast message to all sessions:');
      if (text) window.nexus.broadcastMessage(text);
    });

    this.container.querySelector('#dash-update-claude-btn').addEventListener('click', async () => {
      const btn = this.container.querySelector('#dash-update-claude-btn');
      btn.textContent = 'Updating...';
      btn.disabled = true;
      const result = await window.nexus.updateClaude();
      btn.textContent = result.success ? 'Updated!' : 'Failed';
      setTimeout(() => { btn.textContent = 'Update Claude'; btn.disabled = false; }, 3000);
    });

    this.container.querySelector('#dash-update-nexus-btn').addEventListener('click', () => {
      window.nexus.checkForUpdates();
    });
  }

  updateSessions(sessions) {
    const el = this.container.querySelector('#dash-cards');
    if (!sessions || sessions.length === 0) {
      el.innerHTML = '<div class="dashboard-empty">No sessions yet</div>';
      return;
    }
    el.innerHTML = sessions.map(s => {
      const preview = this.previews.get(s.id) || [];
      return `
        <div class="dash-card ${s.isLead ? 'dash-card-lead' : ''} dash-card-${s.status || 'idle'}" data-id="${s.id}">
          <div class="dash-card-header">
            <span class="dash-card-status status-${s.status || 'idle'}"></span>
            <span class="dash-card-label">${s.label || s.id}</span>
            <span class="dash-card-template">${s.template || ''}</span>
            ${s.isLead ? '<span class="dash-card-lead-badge">LEAD</span>' : ''}
            <span class="dash-card-cwd" title="${s.cwd || ''}">${this._shortenPath(s.cwd)}</span>
          </div>
          <div class="dash-card-preview">${preview.length ? preview.map(l => `<div class="dash-preview-line">${this._escapeHtml(l)}</div>`).join('') : '<span class="dash-preview-empty">No output yet</span>'}</div>
          <div class="dash-card-actions">
            <button class="dash-card-btn dash-focus-btn" data-action="focus" data-id="${s.id}" title="Focus this tab">Focus</button>
            <button class="dash-card-btn dash-msg-btn" data-action="message" data-id="${s.id}" title="Send message">Message</button>
            <button class="dash-card-btn dash-restart-btn" data-action="restart" data-id="${s.id}" title="Restart session">Restart</button>
            <button class="dash-card-btn dash-cancel-btn" data-action="cancel" data-id="${s.id}" title="Send SIGINT">Cancel</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind card action buttons
    el.querySelectorAll('.dash-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        this._handleCardAction(action, id);
      });
    });
  }

  _handleCardAction(action, id) {
    switch (action) {
      case 'focus':
        // Dispatch custom event for renderer to handle
        window.dispatchEvent(new CustomEvent('nexus:focus-tab', { detail: { id } }));
        break;
      case 'message': {
        const text = prompt(`Message to ${id}:`);
        if (text) window.nexus.sendQuickMessage(id, text);
        break;
      }
      case 'restart':
        if (confirm(`Restart session ${id}?`)) window.nexus.restartSession(id);
        break;
      case 'cancel':
        window.nexus.cancelSession(id);
        break;
    }
  }

  updatePreview(id, lines) {
    this.previews.set(id, lines);
    // Update just the preview area if card exists
    const card = this.container.querySelector(`.dash-card[data-id="${id}"] .dash-card-preview`);
    if (card) {
      card.innerHTML = lines.map(l => `<div class="dash-preview-line">${this._escapeHtml(l)}</div>`).join('');
    }
  }

  addResult(result) {
    this.results.push(result);
    const panel = this.container.querySelector('#dash-results');
    panel.style.display = 'block';
    const list = this.container.querySelector('#dash-results-list');
    const entry = document.createElement('div');
    entry.className = `dash-result-entry dash-result-${result.status}`;
    const time = new Date(result.timestamp).toLocaleTimeString();
    entry.innerHTML = `
      <span class="dash-result-status">${result.status === 'success' ? '✓' : '✗'}</span>
      <span class="dash-result-label">${result.label || result.id}</span>
      <span class="dash-result-text">${this._escapeHtml(result.result)}</span>
      <span class="dash-result-time">${time}</span>
    `;
    list.appendChild(entry);
  }

  addLogEntry(message) {
    const el = this.container.querySelector('#dash-log');
    if (!el) return;
    const empty = el.querySelector('.dashboard-empty');
    if (empty) empty.remove();
    const entry = document.createElement('div');
    entry.className = 'dash-log-entry';
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="dash-log-time">${time}</span> ${message}`;
    el.appendChild(entry);
    while (el.children.length > 100) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _shortenPath(p) {
    if (!p) return '';
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : p;
  }

  dispose() {
    this.container.innerHTML = '';
  }
}
```

**Step 2: Add dashboard card styles to styles.css**

Replace the existing dashboard styles (everything from `/* Dashboard */` through the end of dashboard-related CSS) with new card-based styles. Append to styles.css:

```css
/* Dashboard v2 — Card layout */
.dash-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.dash-toolbar h2 { color: #e0e0e0; font-size: 16px; font-weight: 600; }
.dash-toolbar-actions { display: flex; gap: 8px; }
.dash-btn {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  color: #8888aa;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.dash-btn:hover { border-color: #e94560; color: #e0e0e0; }
.dash-btn:disabled { opacity: 0.5; cursor: default; }

.dash-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding: 8px 16px;
  overflow-y: auto;
  max-height: 50vh;
}

.dash-card {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.dash-card-lead { border-color: #e94560; }
.dash-card-stuck { border-color: #ffa726; animation: stuckPulse 2s infinite; }
@keyframes stuckPulse {
  0%, 100% { border-color: #ffa726; }
  50% { border-color: #ff7043; }
}
.dash-card-error { border-color: #ef5350; }
.dash-card-done { border-color: #66bb6a; }

.dash-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #16213e;
}
.dash-card-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dash-card-label { font-size: 13px; color: #e0e0e0; font-weight: 600; }
.dash-card-template { font-size: 10px; color: #4fc3f7; text-transform: uppercase; }
.dash-card-lead-badge {
  font-size: 9px;
  background: #e94560;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 700;
}
.dash-card-cwd { margin-left: auto; font-size: 10px; color: #666; }

.dash-card-preview {
  padding: 8px 12px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #aaa;
  min-height: 60px;
  max-height: 100px;
  overflow: hidden;
}
.dash-preview-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dash-preview-empty { color: #555; font-style: italic; }

.dash-card-actions {
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  border-top: 1px solid #0f3460;
}
.dash-card-btn {
  background: transparent;
  border: 1px solid #2a2a4e;
  color: #8888aa;
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.dash-card-btn:hover { border-color: #4fc3f7; color: #e0e0e0; }
.dash-cancel-btn:hover { border-color: #ef5350; color: #ef5350; }
.dash-restart-btn:hover { border-color: #ffa726; color: #ffa726; }

/* Results panel */
.dash-results-panel {
  padding: 8px 16px;
}
.dash-results-panel h3 { color: #e0e0e0; font-size: 13px; margin-bottom: 8px; }
.dash-result-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #c0c0d0;
  border-radius: 4px;
  margin-bottom: 4px;
}
.dash-result-success { background: rgba(102, 187, 106, 0.1); }
.dash-result-failure { background: rgba(239, 83, 80, 0.1); }
.dash-result-status { font-size: 14px; }
.dash-result-success .dash-result-status { color: #66bb6a; }
.dash-result-failure .dash-result-status { color: #ef5350; }
.dash-result-label { font-weight: 600; min-width: 80px; }
.dash-result-text { flex: 1; color: #aaa; }
.dash-result-time { color: #666; font-size: 10px; }

.dash-log-panel { padding: 8px 16px; }
.dash-log-panel h3 { color: #e0e0e0; font-size: 13px; margin-bottom: 8px; }
```

**Step 3: Commit**

```bash
git add src/dashboard.js src/styles.css
git commit -m "feat: dashboard rewrite with live preview cards, controls, and results panel"
```

---

### Task 8: Wire Up Dashboard Events in Renderer

**Files:**
- Modify: `src/renderer.js` (connect events to dashboard and tab badges)

**Step 1: Replace polling with event-driven dashboard updates**

Add after the existing toast notification code in renderer.js:

```javascript
// --- Dashboard event-driven updates ---

// Output previews → dashboard cards
window.nexus.onOutputPreview(({ id, lines }) => {
  const dash = tabManager.getDashboard();
  if (dash) dash.updatePreview(id, lines);
});

// Session status changes → update dashboard + tab badges
window.nexus.onSessionStatus(({ id, status }) => {
  tabManager.updateTabStatus(id, status);
  // Refresh dashboard sessions
  refreshDashboard();
});

// Stuck warnings → dashboard + notification
window.nexus.onStuckWarning(({ id, lastOutputAge }) => {
  const dash = tabManager.getDashboard();
  if (dash) dash.addLogEntry(`⚠ Session ${id} appears stuck (no output for ${lastOutputAge}s)`);
  tabManager.incrementBadge(id);
});

// Worker results → dashboard results panel + badge on lead
window.nexus.onSessionResult(({ id, result, status, timestamp }) => {
  const dash = tabManager.getDashboard();
  if (dash) {
    const label = [...tabManager.tabs.values()].find(t => t.tabEl?.dataset?.tabId === id)?.label || id;
    dash.addResult({ id, label, result, status, timestamp });
    dash.addLogEntry(`Result from ${label}: ${status}`);
  }
  // Badge the lead tab
  for (const [tid, t] of tabManager.tabs) {
    if (t.label === 'Lead') tabManager.incrementBadge(tid);
  }
});

// All workers done → notification
window.nexus.onAllWorkersComplete(({ results }) => {
  const dash = tabManager.getDashboard();
  if (dash) dash.addLogEntry(`✓ All ${results.length} workers complete!`);
});

// Focus tab from dashboard
window.addEventListener('nexus:focus-tab', (e) => {
  tabManager.activateTab(e.detail.id);
});

// Refresh dashboard with current sessions (event-driven, not polling)
async function refreshDashboard() {
  const dash = tabManager.getDashboard();
  if (!dash) return;
  const sessions = await window.nexus.listSessions();
  dash.updateSessions(sessions);
}

// Also refresh when sessions are created/exited
window.nexus.onSessionCreated(() => refreshDashboard());
window.nexus.onSessionExited(() => refreshDashboard());
```

**Step 2: Update the existing session status handler**

Remove the duplicate handler — the existing `window.nexus.onSessionStatus` at line 72-74 should be removed since we're replacing it above.

**Step 3: Add missing preload event listeners**

Make sure these are in preload.js (some may already exist, add the missing ones):

```javascript
  onSessionCreated: (cb) => ipcRenderer.on('session:created', (_e, d) => cb(d)),
  onOutputPreview: (cb) => ipcRenderer.on('session:output-preview', (_e, d) => cb(d)),
  onStuckWarning: (cb) => ipcRenderer.on('session:stuck-warning', (_e, d) => cb(d)),
  onSessionResult: (cb) => ipcRenderer.on('session:result', (_e, d) => cb(d)),
  onAllWorkersComplete: (cb) => ipcRenderer.on('workers:all-complete', (_e, d) => cb(d)),
  onSessionStatus: (cb) => ipcRenderer.on('session:status', (_e, d) => cb(d)),
```

**Step 4: Commit**

```bash
git add src/renderer.js preload.js
git commit -m "feat: wire dashboard events, tab badges, and stuck/result notifications"
```

---

### Task 9: Auto-Retry on Failure

**Files:**
- Modify: `src/session-manager.js` (track retries, auto-respawn logic)
- Modify: `main.js` (add retry IPC handler)

**Step 1: Add retry tracking to SessionManager**

In the session object in `createSession`, add:

```javascript
      retryCount: 0,
      maxRetries: 2,
```

**Step 2: Add auto-retry support to the exit handler**

Update the `ptyProc.onExit` handler to emit retry-eligible info:

```javascript
    ptyProc.onExit(({ exitCode }) => {
      const status = exitCode === 0 ? 'done' : 'error';
      this.updateStatus(id, status);

      // If failed and under retry limit, offer retry
      if (exitCode !== 0 && session.retryCount < session.maxRetries) {
        this.mainWindow.webContents.send('session:retry-available', {
          id,
          exitCode,
          retryCount: session.retryCount,
          maxRetries: session.maxRetries,
        });
      }

      this.mainWindow.webContents.send('session:exited', { id, exitCode });
      this._cleanup(id);
    });
```

**Step 3: Add retry handler in main.js**

```javascript
ipcMain.on('session:retry', (_event, { id, originalInfo }) => {
  const retryPrompt = originalInfo.initialPrompt
    ? `${originalInfo.initialPrompt}\n\nNote: Previous attempt failed. Try a different approach.`
    : undefined;

  sessionManager.createSession(id, {
    label: originalInfo.label,
    cwd: originalInfo.cwd,
    template: originalInfo.template,
    isLead: originalInfo.isLead,
    initialPrompt: retryPrompt,
  });

  // Increment retry count on the new session
  const session = sessionManager.sessions.get(id);
  if (session) session.retryCount = (originalInfo.retryCount || 0) + 1;
});
```

**Step 4: Add to preload**

```javascript
  retrySession: (id, originalInfo) => ipcRenderer.send('session:retry', { id, originalInfo }),
  onRetryAvailable: (cb) => ipcRenderer.on('session:retry-available', (_e, d) => cb(d)),
```

**Step 5: Wire retry in renderer**

```javascript
// Auto-retry notification
window.nexus.onRetryAvailable(({ id, retryCount, maxRetries }) => {
  const dash = tabManager.getDashboard();
  if (dash) {
    dash.addLogEntry(`✗ Session ${id} failed (retry ${retryCount}/${maxRetries} available)`);
  }
});
```

**Step 6: Commit**

```bash
git add src/session-manager.js main.js preload.js src/renderer.js
git commit -m "feat: auto-retry with failure context injection (max 2 retries)"
```

---

### Task 10: Bundle and Verify

**Step 1: Bundle**

Run: `npm run bundle`
Expected: Success, no errors

**Step 2: Launch app**

Run: `npm start`
Expected: App launches, no crashes

**Step 3: Test dashboard**

- Open a project folder
- Press Ctrl+D to open dashboard
- Verify: session card shows with live preview, controls visible
- Verify: toolbar buttons (Broadcast, Update Claude, Update Nexus) visible

**Step 4: Test tab badges**

- Verify: tab status dots change color as session transitions idle → working

**Step 5: Commit the bundle config if any changes**

```bash
git add -A
git commit -m "chore: verify build and fix any issues from integration"
```

---

### Task 11: Update README and Push

**Files:**
- Modify: `README.md` (add Autopilot features)

**Step 1: Add v0.2.0 features to README**

Add a section after the existing features:

```markdown
### Autopilot (v0.2.0)
- **Live preview cards** — Dashboard shows last 5 lines of each session's output
- **Session controls** — Cancel, restart, message, and focus buttons per session
- **Tab badges** — Unread message count on inactive tabs
- **Stuck detection** — Warns when a working session goes silent for 60s
- **Auto-retry** — Failed workers can be retried with failure context (max 2 retries)
- **Result aggregation** — Worker results collected and displayed on dashboard
- **Real-time status** — Sessions tracked as idle/working/done/error/stuck
- **Persistent scratchpad** — Shared state survives app restarts
- **Update buttons** — Update Claude Code and Nexus from the dashboard
```

**Step 2: Bump version in package.json to 0.2.0**

**Step 3: Commit, tag, and push**

```bash
git add README.md package.json package-lock.json
git commit -m "release: v0.2.0 — Autopilot features"
git tag -a v0.2.0 -m "v0.2.0 - Autopilot: live previews, controls, stuck detection, auto-retry, result aggregation"
git push origin master --tags
```
