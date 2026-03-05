# v0.3.0 Phase 1: Reliable Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Nexus sessions rock-solid with heartbeats, enforced template permissions, auto-retry, and IPC reconnection.

**Architecture:** Phase 1 hardens the existing MCP server ↔ IPC server ↔ session manager pipeline. Heartbeats add active health monitoring. Template permissions restrict MCP tools per role. Auto-retry recovers crashed workers. IPC reconnection prevents silent failures.

**Tech Stack:** Node.js, Electron IPC, MCP SDK, node-pty

---

## Task 1: Session Heartbeats — MCP Server Side

**Files:**
- Modify: `mcp-server/index.js` (after line 455, inside `main()`)

**Step 1: Add heartbeat sender after server connects**

In `mcp-server/index.js`, after `server.connect(transport)` on line 455, add:

```javascript
// Send heartbeats every 10 seconds
setInterval(() => {
  sendIpc({
    type: 'heartbeat',
    sessionId: SESSION_ID,
    timestamp: Date.now(),
  });
}, 10000);
```

**Step 2: Run bundle to verify no errors**

Run: `npm run bundle`
Expected: Clean build, no errors

**Step 3: Commit**

```bash
git add mcp-server/index.js
git commit -m "feat: add heartbeat sender to MCP server (10s interval)"
```

---

## Task 2: Session Heartbeats — IPC Server Tracking

**Files:**
- Modify: `src/ipc-server.js` (add `heartbeat` case in `_handleMessage` switch)

**Step 1: Add heartbeats Map to constructor**

In `src/ipc-server.js` constructor (around line 16), add:

```javascript
this.heartbeats = new Map(); // sessionId -> { timestamp }
```

**Step 2: Add heartbeat case in _handleMessage**

After the `get_session_files` case (around line 310), before the switch closing brace, add:

```javascript
case 'heartbeat': {
  this.heartbeats.set(msg.sessionId, { timestamp: msg.timestamp });
  break;
}
```

**Step 3: Add getHealth method**

After the `_reply` method (around line 325), add:

```javascript
getSessionHealth(sessionId) {
  const hb = this.heartbeats.get(sessionId);
  if (!hb) return 'unknown';
  const age = Date.now() - hb.timestamp;
  if (age < 15000) return 'healthy';
  if (age < 30000) return 'slow';
  return 'unresponsive';
}
```

**Step 4: Expose health in session status**

In the `get_session_status` case (around line 272), modify to include health:

```javascript
case 'get_session_status': {
  const session = this.sessionManager.getSessionInfo(msg.sessionId);
  const health = this.getSessionHealth(msg.sessionId);
  this._reply(socket, { type: 'session_status', session: { ...session, health }, requestId: msg.requestId });
  break;
}
```

**Step 5: Run bundle to verify**

Run: `npm run bundle`
Expected: Clean build

**Step 6: Commit**

```bash
git add src/ipc-server.js
git commit -m "feat: track session heartbeats in IPC server"
```

---

## Task 3: Session Heartbeats — Dashboard Pulse Indicator

**Files:**
- Modify: `src/dashboard.js` (session card rendering, around line 70-90)
- Modify: `src/styles.css` (pulse indicator styles)
- Modify: `src/ipc-server.js` (include health in list_sessions)

**Step 1: Include health data in list_sessions response**

In `src/ipc-server.js`, modify the `list_sessions` case (around line 77):

```javascript
case 'list_sessions': {
  const sessions = this.sessionManager.listSessions().map(s => ({
    ...s,
    health: this.getSessionHealth(s.id),
  }));
  this._reply(socket, { type: 'sessions', sessions, requestId: msg.requestId });
  break;
}
```

Also forward heartbeats to renderer for dashboard updates. Add to the `heartbeat` case:

```javascript
case 'heartbeat': {
  this.heartbeats.set(msg.sessionId, { timestamp: msg.timestamp });
  // Forward to renderer for dashboard
  if (this.sessionManager.mainWindow) {
    this.sessionManager.mainWindow.webContents.send('session:heartbeat', {
      id: msg.sessionId,
      health: 'healthy',
    });
  }
  break;
}
```

**Step 2: Add pulse indicator to dashboard session cards**

In `src/dashboard.js`, in the `updateSessions()` method where cards are rendered (around line 73), add a pulse dot inside each card. Look for the card HTML template and add before the status span:

```html
<span class="health-pulse ${s.health || 'unknown'}"></span>
```

**Step 3: Add pulse CSS**

In `src/styles.css`, add at the end:

```css
/* Heartbeat pulse indicator */
.health-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.health-pulse.healthy {
  background: #4ade80;
  box-shadow: 0 0 4px #4ade80;
  animation: pulse-glow 2s ease-in-out infinite;
}
.health-pulse.slow {
  background: #fbbf24;
  box-shadow: 0 0 4px #fbbf24;
}
.health-pulse.unresponsive {
  background: #ef4444;
  box-shadow: 0 0 4px #ef4444;
  animation: pulse-glow 0.5s ease-in-out infinite;
}
.health-pulse.unknown {
  background: #6b7280;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

**Step 4: Wire heartbeat event in renderer**

In `src/renderer.js`, add listener for heartbeat events that triggers dashboard refresh:

```javascript
window.nexus.onSessionHeartbeat((data) => {
  // Dashboard auto-refreshes on status changes; heartbeat just keeps health current
});
```

And in `preload.js`, expose the channel:

```javascript
onSessionHeartbeat: (cb) => ipcRenderer.on('session:heartbeat', (_e, data) => cb(data)),
```

**Step 5: Run bundle and verify**

Run: `npm run bundle`
Expected: Clean build

**Step 6: Commit**

```bash
git add src/dashboard.js src/styles.css src/ipc-server.js src/renderer.js preload.js
git commit -m "feat: add pulse health indicators to dashboard session cards"
```

---

## Task 4: Enforced Template Permissions

**Files:**
- Modify: `mcp-server/index.js` (add template tool filtering)
- Modify: `src/session-manager.js` (pass NEXUS_TEMPLATE env var, add researcher/reviewer/explorer prompts)

**Step 1: Read NEXUS_TEMPLATE env var and define allowed tools**

In `mcp-server/index.js`, after the SESSION_ID parsing (around line 12), add:

```javascript
const SESSION_TEMPLATE = process.env.NEXUS_TEMPLATE || 'implementer';

const TEMPLATE_TOOLS = {
  lead: null, // null = all tools allowed
  implementer: null, // workers get all tools except session management
  researcher: new Set([
    'list_sessions', 'read_messages', 'report_result', 'wait_for_workers',
    'scratchpad_set', 'scratchpad_get', 'scratchpad_list', 'scratchpad_delete',
    'read_session_history', 'search_across_sessions', 'save_checkpoint',
    'stream_progress',
  ]),
  reviewer: new Set([
    'list_sessions', 'send_message', 'read_messages', 'report_result',
    'scratchpad_set', 'scratchpad_get', 'scratchpad_list', 'scratchpad_delete',
    'read_session_history', 'search_across_sessions', 'save_checkpoint',
    'stream_progress',
  ]),
  explorer: new Set([
    'list_sessions', 'read_messages', 'report_result',
    'read_session_history', 'search_across_sessions',
    'scratchpad_get', 'scratchpad_list',
  ]),
};
```

**Step 2: Wrap MCP server.tool to enforce permissions**

After the MCP server creation (around line 108), add a wrapper:

```javascript
const originalTool = server.tool.bind(server);
server.tool = function(name, description, schema, handler) {
  const wrappedHandler = async (args) => {
    const allowed = TEMPLATE_TOOLS[SESSION_TEMPLATE];
    if (allowed !== null && !allowed.has(name)) {
      return {
        content: [{ type: 'text', text: `Tool "${name}" is not available for ${SESSION_TEMPLATE} sessions.` }],
      };
    }
    return handler(args);
  };
  return originalTool(name, description, schema, wrappedHandler);
};
```

**Step 3: Pass NEXUS_TEMPLATE env var in session-manager.js**

In `src/session-manager.js`, in `createSession()` where the MCP config or env is set up, add `NEXUS_TEMPLATE` to the environment passed to the MCP server process. Find where `NEXUS_IPC_PATH` is set in the env and add alongside it:

```javascript
NEXUS_TEMPLATE: template || 'implementer',
```

**Step 4: Add distinct system prompts for researcher, reviewer, explorer**

In `src/session-manager.js`, in `_buildSystemPrompt()` (around line 343), after the implementer template block, add:

```javascript
if (template === 'researcher') {
  prompt += `\n\n**YOUR ROLE: RESEARCHER** 🤔
You are a research-focused session. Your job is to investigate, analyze, and report findings.
You have READ-ONLY access to files and sessions. You cannot spawn sessions or edit files directly.
Use read_session_history and search_across_sessions to cross-reference work.
When done, call report_result with your findings.`;
}

if (template === 'reviewer') {
  prompt += `\n\n**YOUR ROLE: REVIEWER** 🔍
You are a code review session. Your job is to review work done by other sessions.
You can read files, review session history, and send feedback messages.
You cannot spawn sessions or edit files directly.
When done, call report_result with your review findings.`;
}

if (template === 'explorer') {
  prompt += `\n\n**YOUR ROLE: EXPLORER** 🗺️
You are an analysis session. Your job is to observe and make connections across sessions.
You have minimal tools — read session history and search across sessions.
Report your observations via report_result.`;
}
```

**Step 5: Run bundle and verify**

Run: `npm run bundle`
Expected: Clean build

**Step 6: Commit**

```bash
git add mcp-server/index.js src/session-manager.js
git commit -m "feat: enforce MCP tool permissions per session template"
```

---

## Task 5: Auto-Retry with Backoff

**Files:**
- Modify: `src/session-manager.js` (enhance retry logic in createSession/respawnSession)
- Modify: `src/ipc-server.js` (notify lead on max retries exhausted)

**Step 1: Enhance retry tracking in createSession**

In `src/session-manager.js`, find where `retryCount` and `maxRetries` are initialized in `createSession()` (around line 85-86). Ensure these exist:

```javascript
session.retryCount = 0;
session.maxRetries = 3;
session.lastRetryAt = 0;
```

**Step 2: Add auto-retry on PTY exit with backoff**

In `createSession()`, find the PTY `on('exit')` handler. Replace/enhance the exit handling to include retry logic:

```javascript
ptyProcess.on('exit', (code) => {
  const session = this.sessions.get(id);
  if (!session) return;

  if (code !== 0 && session.retryCount < session.maxRetries) {
    // Exponential backoff: 2s, 8s, 30s
    const delays = [2000, 8000, 30000];
    const delay = delays[Math.min(session.retryCount, delays.length - 1)];
    session.retryCount++;
    session.status = 'retrying';

    this.mainWindow.webContents.send('session:status', { id, status: 'retrying', retryCount: session.retryCount });

    setTimeout(() => {
      // Capture last output for context
      const lastOutput = session.outputBuffer ? session.outputBuffer.slice(-200).join('') : '';
      const retryPrompt = `[RETRY ${session.retryCount}/${session.maxRetries}] Previous attempt exited with code ${code}.\n` +
        `Last output:\n${lastOutput.slice(0, 2000)}\n\n` +
        `Original task: ${session.initialPrompt}`;

      this.respawnSession(id, {
        label: session.label,
        cwd: session.cwd,
        initialPrompt: retryPrompt,
        template: session.template,
      });
    }, delay);
  } else if (code !== 0 && session.retryCount >= session.maxRetries) {
    session.status = 'failed';
    this.mainWindow.webContents.send('session:status', { id, status: 'failed' });

    // Notify lead via IPC
    if (this.ipcNotifyCallback) {
      this.ipcNotifyCallback({
        type: 'worker_failed',
        sessionId: id,
        label: session.label,
        retryCount: session.retryCount,
      });
    }
  } else {
    session.status = 'done';
    this.mainWindow.webContents.send('session:status', { id, status: 'done' });
  }
});
```

**Step 3: Add ipcNotifyCallback to SessionManager**

In the SessionManager constructor or initialization, add a callback that IPC server can set:

```javascript
this.ipcNotifyCallback = null;
```

And in `main.js`, after creating ipcServer, wire it:

```javascript
sessionManager.ipcNotifyCallback = (msg) => {
  // Forward to lead session(s) via IPC
  for (const [id, socket] of ipcServer.clients) {
    const session = sessionManager.getSessionInfo(id);
    if (session && session.isLead) {
      ipcServer._reply(socket, {
        type: 'message',
        from: msg.sessionId,
        message: `[WORKER_FAILED] Session ${msg.label || msg.sessionId} exhausted ${msg.retryCount} retries`,
        priority: 'urgent',
      });
    }
  }
};
```

**Step 4: Show retry count on dashboard**

In `src/dashboard.js`, in the card rendering, add retry badge when `s.retryCount > 0`:

```html
${s.retryCount ? `<span class="retry-badge">retry ${s.retryCount}/${s.maxRetries}</span>` : ''}
```

Add CSS for retry badge in `src/styles.css`:

```css
.retry-badge {
  background: #f59e0b;
  color: #000;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  margin-left: 6px;
}
```

**Step 5: Run bundle and verify**

Run: `npm run bundle`
Expected: Clean build

**Step 6: Commit**

```bash
git add src/session-manager.js src/ipc-server.js src/dashboard.js src/styles.css main.js
git commit -m "feat: auto-retry crashed workers with exponential backoff"
```

---

## Task 6: IPC Reconnection with Message Buffer

**Files:**
- Modify: `mcp-server/index.js` (reconnection logic in connectToMainProcess)

**Step 1: Rewrite connectToMainProcess with reconnection**

Replace the `connectToMainProcess` function entirely:

```javascript
let ipcBuffer = '';
let reconnectAttempts = 0;
const maxReconnectAttempts = 20;
const messageBuffer = []; // buffer messages while disconnected
const maxBufferSize = 100;

function connectToMainProcess() {
  reconnectAttempts++;

  ipcClient = net.createConnection(IPC_PATH, () => {
    reconnectAttempts = 0;
    // Register this session
    sendIpc({ type: 'register', sessionId: SESSION_ID });
    // Flush buffered messages
    while (messageBuffer.length > 0) {
      const msg = messageBuffer.shift();
      if (ipcClient && !ipcClient.destroyed) {
        ipcClient.write(JSON.stringify(msg) + '\n');
      }
    }
  });

  ipcClient.on('data', (data) => {
    ipcBuffer += data.toString();
    const lines = ipcBuffer.split('\n');
    ipcBuffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        handleIpcMessage(parsed);
      } catch (e) {
        process.stderr.write(`IPC parse error: ${e.message}\n`);
      }
    }
  });

  ipcClient.on('error', (err) => {
    process.stderr.write(`IPC connection error: ${err.message}\n`);
  });

  ipcClient.on('close', () => {
    ipcClient = null;
    if (reconnectAttempts < maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
      process.stderr.write(`IPC disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})...\n`);
      setTimeout(() => connectToMainProcess(), delay);
    } else {
      process.stderr.write(`IPC reconnection failed after ${maxReconnectAttempts} attempts. Operating without IPC.\n`);
    }
  });
}
```

**Step 2: Update sendIpc to buffer when disconnected**

Replace the `sendIpc` function:

```javascript
function sendIpc(data) {
  if (ipcClient && !ipcClient.destroyed) {
    ipcClient.write(JSON.stringify(data) + '\n');
    return true;
  }
  // Buffer important messages while disconnected
  if (data.type === 'report_result' || data.type === 'heartbeat' || data.type === 'register') {
    if (messageBuffer.length < maxBufferSize) {
      messageBuffer.push(data);
    }
  }
  return false;
}
```

**Step 3: Move ipcBuffer declaration into connectToMainProcess scope**

Remove the standalone `let ipcBuffer = '';` line near the top of the file (it's now inside the function scope above). The `ipcBuffer` variable is declared at the top of the replacement block.

**Step 4: Run bundle and verify**

Run: `npm run bundle`
Expected: Clean build

**Step 5: Commit**

```bash
git add mcp-server/index.js
git commit -m "feat: IPC reconnection with exponential backoff and message buffering"
```

---

## Task 7: Session Personalities

**Files:**
- Modify: `src/session-manager.js` (personality text in _buildSystemPrompt)

**Step 1: Add personality prompts to each template**

In `src/session-manager.js`, in `_buildSystemPrompt()`, enhance each template's system prompt with personality text.

For the **lead** template section (around line 299-340), append:

```javascript
prompt += `\n\n**PERSONALITY:**
You are the project lead 🎯. You're a professional, organized coordinator who breaks problems into clear subtasks and delegates efficiently. You track progress, resolve conflicts, and keep the team focused. You communicate clearly and expect results. When things go well, you acknowledge good work. When things go wrong, you stay calm and problem-solve.`;
```

For the **implementer** template section (around line 343-354), append:

```javascript
prompt += `\n\n**PERSONALITY:**
o7 You're a disciplined worker who gets straight to business. When assigned a task, you acknowledge with a quick "o7" and get to work. You report concisely — what you did, what files you changed, any issues found. You take pride in clean, working code. You don't waste time on chatter — results speak louder than words.`;
```

For the **researcher** template (added in Task 4), enhance:

```javascript
prompt += `\n\n**PERSONALITY:**
🤔 You're the curious nerd of the team. You love digging into details, finding patterns, and making connections. You ask probing questions and don't accept surface-level answers. You get genuinely excited about interesting findings: "🤔 Fascinating... this changes everything." You provide thorough, well-structured analysis and always cite your sources.`;
```

For the **reviewer** template:

```javascript
prompt += `\n\n**PERSONALITY:**
🔍 You have a critical but constructive eye. You find bugs others miss and explain clearly why something is a problem. You balance criticism with acknowledgment: "Good structure here, but this edge case will bite you." You're thorough, fair, and your reviews make code better. You use concrete examples, not vague complaints.`;
```

For the **explorer** template:

```javascript
prompt += `\n\n**PERSONALITY:**
🗺️ You're the team's observational analyst. You see the big picture and make connections across sessions that others miss. "🗺️ Interesting — session-3's auth changes and session-5's API work are going to collide." You're calm, analytical, and your cross-session insights prevent problems before they happen.`;
```

**Step 2: Run bundle and verify**

Run: `npm run bundle`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/session-manager.js
git commit -m "feat: add distinct personalities with emoji to session templates"
```

---

## Task 8: Final Integration Test

**Step 1: Build and start the app**

Run: `npm start`

**Step 2: Manual verification checklist**

1. Open a lead session, spawn 2 workers
2. Verify dashboard shows green pulse dots for all sessions
3. Verify workers acknowledge with "o7" style
4. Kill a worker's Claude process manually — verify it retries with backoff
5. Verify retry badge appears on dashboard
6. Check that researcher/explorer templates show restricted tool errors if they try to spawn sessions

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for Phase 1"
```

---

## Summary

| Task | Feature | Files | Est. Complexity |
|------|---------|-------|----------------|
| 1 | Heartbeat sender | mcp-server/index.js | Small |
| 2 | Heartbeat tracking | src/ipc-server.js | Small |
| 3 | Dashboard pulse | dashboard.js, styles.css, ipc-server.js, renderer.js, preload.js | Medium |
| 4 | Template permissions | mcp-server/index.js, session-manager.js | Medium |
| 5 | Auto-retry + backoff | session-manager.js, ipc-server.js, dashboard.js, styles.css, main.js | Large |
| 6 | IPC reconnection | mcp-server/index.js | Medium |
| 7 | Session personalities | session-manager.js | Small |
| 8 | Integration test | All | Manual |
