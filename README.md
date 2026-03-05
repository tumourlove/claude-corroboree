# Claude Nexus

A tabbed Electron terminal for running multiple Claude Code sessions in parallel with full MCP-powered coordination.

![Claude Nexus](https://img.shields.io/badge/version-0.3.0-blue) ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey) ![License](https://img.shields.io/badge/license-MIT-green)

## What It Does

Nexus lets you run multiple Claude Code sessions side-by-side in tabs. Each session gets an MCP server injected that gives Claude the ability to talk to other sessions, spawn workers, share state, and coordinate complex multi-session workflows — all automatically.

The **Lead** session breaks tasks into subtasks, spawns worker sessions, monitors progress, and collects results. Workers report back when done. Sessions share a scratchpad, task queue, knowledge base, and file locks for coordination.

## Features

### Terminal & Tabs
- Multiple Claude Code sessions in tabs with xterm.js (v6)
- Keyboard shortcuts for tab management, clipboard, and navigation
- Shift+Enter for multi-line Claude Code input
- Image paste from clipboard (saves to temp file, pastes path)
- Help dropdown with all shortcuts (F1 or ? button)

### MCP Coordination (34 Tools)
Each session automatically gets tools for coordination, gated by template permissions:

| Category | Tools |
|----------|-------|
| **Communication** | `list_sessions`, `send_message`, `read_messages`, `broadcast` |
| **Orchestration** | `spawn_session`, `spawn_explorer`, `wait_for_workers`, `get_session_status`, `report_result` |
| **Task Queue** | `push_task`, `pull_task`, `update_task`, `list_tasks` |
| **File Coordination** | `claim_file`, `release_file`, `list_locks`, `share_snippet`, `get_snippet` |
| **Knowledge Base** | `kb_add`, `kb_search`, `kb_list` |
| **Progress & Context** | `stream_progress`, `request_context_handoff`, `report_handoff`, `save_checkpoint` |
| **Shared State** | `scratchpad_set`, `scratchpad_get`, `scratchpad_list`, `scratchpad_delete` |
| **History** | `read_session_history`, `search_across_sessions` |
| **Session Lifecycle** | `reset_session`, `merge_worker`, `list_worktrees` |

### Session Templates & Personalities
Each session has a role with enforced tool permissions and a distinct personality:

| Template | Emoji | Role | Permissions |
|----------|-------|------|-------------|
| **Lead** | 🎯 | Project coordinator — delegates, tracks, integrates | All tools |
| **Implementer** | o7 | Disciplined worker — builds, reports concisely | All except spawn/reset |
| **Researcher** | 🤔 | Curious analyst — investigates, digs deep | Read-only + scratchpad + report |
| **Reviewer** | 🔍 | Critical eye — reviews, gives constructive feedback | Researcher tools + messaging |
| **Explorer** | 🗺️ | Big-picture observer — cross-session connections | List, history, search only |

### Reliability (v0.3.0)
- **Session heartbeats** — 10s pings with health dashboard (green/yellow/red pulse)
- **Auto-retry with backoff** — Failed workers retry up to 3x (2s, 8s, 30s delays)
- **IPC reconnection** — MCP servers auto-reconnect with message buffering on disconnect
- **Auto-checkpointing** — Session state saved every 5 minutes, crash recovery dialog
- **Template permissions** — Tool access enforced per role (researchers can't spawn, etc.)

### Smart Coordination (v0.3.0)
- **Structured task queue** — Priority-based tasks with dependencies and auto-assignment
- **File locking** — `claim_file`/`release_file` prevents edit conflicts (10min auto-expiry)
- **Shared code snippets** — Share file excerpts between sessions with auto-expiry
- **Progress streaming** — Workers send progress updates with percentage bars
- **Per-project knowledge base** — Store architecture decisions, patterns, gotchas
- **Context handoffs** — Cooperative session reset with structured summary preservation
- **Git worktree per worker** — Workers auto-get isolated branches, lead merges results

### Panels
- **Dashboard** (Ctrl+Shift+D) — Session health, task board, dependency graph, progress bars, stats, badges
- **History** (Ctrl+Shift+H) — Session logs with replay mode (color-coded timeline)
- **Chat Sidebar** (Ctrl+Shift+C) — Live inter-session message feed with user injection

### Autopilot
- **Live preview cards** — Dashboard shows last 5 lines of each session's output
- **Session controls** — Cancel, restart, message, and focus buttons per session
- **Tab badges** — Unread message count on inactive tabs
- **Stuck detection** — Warns when a working session goes silent for 60s
- **Result aggregation** — Worker results collected and displayed on dashboard
- **Real-time status** — Sessions tracked as idle/working/done/error/stuck/retrying
- **Persistent scratchpad** — Shared state survives app restarts with periodic cleanup
- **Achievement badges** — "Speed Demon" (< 30s), "Thorough" (> 1000 chars) badges with toasts
- **Stats header** — Tasks completed, fastest worker, active session count

### System Integration
- Conflict detection when multiple sessions edit the same file
- Git worktree isolation (automatic for workers in git repos)
- System tray + in-app toast notifications
- Auto-update from GitHub Releases
- Windows Explorer "Open in Claude Nexus" context menu
- `nexus` command in Explorer address bar and Win+R

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New session tab |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+1-9 | Jump to tab by number |
| Ctrl+Shift+D | Dashboard panel |
| Ctrl+Shift+H | History panel |
| Ctrl+Shift+C | Chat sidebar |
| Ctrl+C | Copy selection (or SIGINT if no selection) |
| Ctrl+V | Paste text or image |
| Ctrl+X | Cut selection |
| Ctrl+A | Select all |
| Ctrl+L | Clear scrollback |
| Shift+Enter | New line (multi-line input) |
| F1 | Help dropdown |

## Install

### From Source (Development)

```bash
git clone https://github.com/tumourlove/claude-nexus.git
cd claude-nexus
npm install
npm start
```

### Open a Specific Project

```bash
npm start -- "C:\path\to\project"
```

### Register Shell Integration

```bash
node scripts/register-shell.js
```

This adds:
- Right-click "Open in Claude Nexus" on folders
- `nexus` command in Explorer address bar and Win+R

### Build Installer

```bash
npm run build
```

Produces Windows NSIS installer and portable exe in `release/`.

## How It Works

```
┌──────────────────────────────────────────────────────┐
│  Electron (main.js)                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Session 1 │  │ Session 2 │  │ Session 3 │          │
│  │ 🎯 Lead  │  │ o7 Worker│  │ o7 Worker│           │
│  │ node-pty │  │ node-pty │  │ node-pty │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                 │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐           │
│  │ MCP Srv  │  │ MCP Srv  │  │ MCP Srv  │           │
│  │ (34 tools)│ │(permissioned)│(permissioned)│       │
│  └────┬─────┘  └────┴─────┘  └────┴─────┘           │
│       │              │              │                 │
│  ┌────┴──────────────┴──────────────┴─────────────┐  │
│  │      Named Pipe IPC (message broker)           │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │                               │
│  ┌────────────────────┴───────────────────────────┐  │
│  │  SessionManager · TaskQueue · KnowledgeBase    │  │
│  │  Scratchpad · ConflictDetector · CheckpointMgr │  │
│  │  HistoryManager · NotificationManager          │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

Each tab spawns a Claude Code CLI process with a per-session MCP config. The MCP server connects back to Electron's main process via named pipe, which routes messages between sessions and manages shared state. Workers auto-get isolated git worktrees and template-gated tool permissions.

## Requirements

- Node.js 18+
- Claude Code CLI (`claude`) installed and in PATH
- Windows 10/11 (macOS/Linux support planned)
- Visual Studio Build Tools (for node-pty compilation)

## License

MIT
