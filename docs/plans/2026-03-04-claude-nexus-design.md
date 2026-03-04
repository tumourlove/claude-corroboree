# Claude Nexus - Design Document

**Date:** 2026-03-04
**Status:** Approved

## Overview

Claude Nexus is an Electron-based tabbed terminal application that runs multiple Claude Code sessions and enables them to communicate, coordinate, and orchestrate work in parallel via an embedded MCP server. A lead session can auto-spawn worker sessions, delegate tasks, and collect results.

## Architecture

```
+-----------------------------------------------+
|              Electron App                      |
|                                                |
|  +------------------------------------------+ |
|  |  Main Process                             | |
|  |  +-- SessionManager                      | |
|  |  |   +-- spawns Claude Code via node-pty  | |
|  |  |   +-- tracks session lifecycle         | |
|  |  |   +-- injects MCP config per session   | |
|  |  |   +-- manages git worktrees            | |
|  |  |                                        | |
|  |  +-- MCP Server (stdio per session)       | |
|  |  |   +-- message bus (pub/sub + direct)   | |
|  |  |   +-- session registry                 | |
|  |  |   +-- shared scratchpad (KV store)     | |
|  |  |   +-- conflict detector                | |
|  |  |   +-- tool handlers                    | |
|  |  |                                        | |
|  |  +-- HistoryManager                       | |
|  |  |   +-- logs all session output          | |
|  |  |   +-- stores summaries + checkpoints   | |
|  |  |                                        | |
|  |  +-- NotificationManager                  | |
|  |  |   +-- system tray notifications        | |
|  |  |   +-- in-app toast notifications       | |
|  |  |                                        | |
|  |  +-- IPC bridge to Renderer               | |
|  +------------------------------------------+ |
|                                                |
|  +------------------------------------------+ |
|  |  Renderer Process                         | |
|  |  +-- Tab Bar (drag, reorder, close)       | |
|  |  +-- xterm.js terminals per tab           | |
|  |  +-- Split pane support (H/V)             | |
|  |  +-- Progress Dashboard tab               | |
|  |  +-- Status bar                           | |
|  |  +-- Notification toasts                  | |
|  +------------------------------------------+ |
+-----------------------------------------------+
```

### Process Model

- Each tab spawns a `claude` CLI process via `node-pty`
- The Electron main process runs an MCP server that communicates with each Claude session via stdio transport
- When a new session starts, the app writes a temporary MCP config file and sets the environment so Claude Code connects to the embedded MCP server
- The main process acts as the central message broker between all sessions

## Security Model

- **No network exposure:** MCP server uses stdio pipes only. No HTTP/WebSocket listeners. Messages never leave the local machine.
- **Session isolation:** Each session runs in its own PTY with its own working directory. Communication only through the MCP message bus.
- **Message sanitization:** All MCP messages validated against strict JSON schema before routing. No arbitrary code execution through messages.
- **Scoped spawning:** `spawn_session` requires an existing directory as working_directory. No spawning processes outside app management.
- **No credential leakage:** Per-session MCP config is a temp file, cleaned up on session close. Contains only stdio transport path.
- **PTY sandboxing:** Processes run under current user permissions, no elevation requested.
- **Conflict detection:** File edit conflicts detected before they happen (see Conflict Detection section).

## MCP Tools

### Core Communication

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list_sessions` | See all active tabs with status | none |
| `send_message` | Send a message to a specific session | `target_session_id`, `message`, `priority` |
| `read_messages` | Read incoming messages | `since_timestamp?`, `limit?` |
| `broadcast` | Message all sessions | `message` |

### Session Management

| Tool | Purpose | Parameters |
|------|---------|------------|
| `spawn_session` | Create a new worker tab | `working_directory`, `initial_prompt`, `label?`, `template?` |
| `get_session_status` | Check session state (idle/working/done/error) | `session_id` |
| `report_result` | Worker reports task completion | `result`, `status: success\|failure` |
| `reset_session` | Reset session with auto-summary | `session_id`, `preserve_summary: bool` |

### Cross-Session Intelligence

| Tool | Purpose | Parameters |
|------|---------|------------|
| `read_session_history` | Read another session's output | `session_id`, `last_n_lines?` |
| `search_across_sessions` | Search all sessions' output | `pattern`, `session_ids?` |
| `spawn_explorer` | Spin up read-only explorer session | `task_description`, `session_ids_to_review` |
| `get_session_summary` | Get a session's latest summary | `session_id` |

### Shared Scratchpad

| Tool | Purpose | Parameters |
|------|---------|------------|
| `scratchpad_set` | Store a value by key | `key`, `value`, `namespace?` |
| `scratchpad_get` | Retrieve a value by key | `key`, `namespace?` |
| `scratchpad_list` | List all keys | `namespace?` |
| `scratchpad_delete` | Remove a key | `key`, `namespace?` |

### Web Research

| Tool | Purpose | Parameters |
|------|---------|------------|
| `web_search` | Search the web | `query`, `limit?` |
| `web_fetch` | Fetch and extract URL content | `url`, `prompt?` |

### Context Management

| Tool | Purpose | Parameters |
|------|---------|------------|
| `save_checkpoint` | Save current state without resetting | `label?` |
| `restore_checkpoint` | Restore a previous checkpoint | `checkpoint_id` |

## Session Templates

Pre-configured session types that restrict available tools and behavior:

| Template | Description | Restrictions |
|----------|-------------|-------------|
| `researcher` | Web research focused | No file edits, has web tools |
| `implementer` | Code implementation | Full file access, testing |
| `reviewer` | Code review & quality | Read-only file access, runs lints/tests |
| `explorer` | Cross-session analysis | Read-only, can read all session histories |

The lead session defaults to no restrictions (full access to all tools).

## Conflict Detection

The MCP server tracks which files each session is modifying:
- When a session uses `Edit`, `Write`, or similar file tools, the MCP server is notified
- Before allowing a file edit, checks if any other session has modified the same file
- If conflict detected: sends a warning message to both sessions with details
- Optional: auto-manage git worktrees so each session works on an isolated branch, merge at completion

## Terminal UI

### Tab Bar
- Draggable, reorderable tabs
- Each tab shows: label, status icon (spinner=active, checkmark=done, X=error)
- Color-coded: blue=working, green=done, red=error, gray=idle, purple=explorer
- Close button (confirmation if session active)
- "+" button to manually spawn a new session

### Terminal
- Full xterm.js with color support, scrollback, resize handling
- Split pane support (horizontal and vertical)
- Theme support (dark default, customizable)

### Progress Dashboard
- Special non-terminal tab showing bird's-eye view
- Session list with current task descriptions
- Task dependency graph visualization
- Real-time progress indicators
- Message bus activity log

### Status Bar (bottom)
- Active session count
- Message bus activity indicator
- Quick session switcher

### Keyboard Shortcuts
- `Ctrl+T` - new tab
- `Ctrl+W` - close tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab` - switch tabs
- `Ctrl+Shift+\` - split pane
- `Ctrl+1-9` - jump to tab by number
- `Ctrl+D` - open dashboard

## Notifications

- **System tray:** Toast notifications for session completion, errors, urgent messages
- **In-app toasts:** Non-intrusive popups for inter-session messages, status changes
- **Tab flash:** Tab title flashes when a background session needs attention
- **Sound (optional):** Configurable audio cues for key events

## Session History

- All session output logged to `~/.claude-nexus/history/`
- History panel shows past sessions: timestamp, project, summary
- Can review/reopen past session output
- Auto-summary generated on session close or reset
- "Meanwhile in NEXUS..." header for the history view

## Context Reset Flow

1. Lead (or session itself) calls `reset_session`
2. Session auto-generates progress summary
3. Summary saved to message bus + history
4. Full output saved to history
5. PTY is respawned (fresh Claude Code session)
6. Summary injected as initial context
7. MCP config re-injected

## App Launch & Project Selection

### Windows Explorer Integration
- **Address bar keyword:** Type `nexus` in Explorer address bar to open Claude Nexus in that directory
- **Right-click context menu:** "Open in Claude Nexus" on folders
- Both registered via Windows shell extension during install

### Standalone Launch
- Opens project picker: recent projects list + "Browse..." button
- Recent projects persisted in app data
- First tab spawns as lead session in selected directory

## Auto-Merge Coordination

When multiple sessions edit files in the same repo:
1. Each worker session gets its own git worktree (auto-created)
2. Sessions work on isolated branches
3. When workers complete, lead can trigger merge
4. Conflict resolution assisted by explorer session if needed
5. Worktrees cleaned up after merge

## Tech Stack

- **Runtime:** Electron
- **Terminal:** xterm.js + xterm-addon-fit + xterm-addon-webgl
- **PTY:** node-pty
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **State:** In-memory with periodic persistence to disk
- **Build:** electron-builder (Windows installer + portable)

## Data Storage

```
~/.claude-nexus/
  history/           # Session output logs + summaries
  checkpoints/       # Saved session states
  preferences.json   # App settings, recent projects, themes
  scratchpad/        # Persistent KV store data
```

## Future Considerations (not in v1 but worth noting)

- Multi-machine coordination (sessions on different computers)
- Plugin system for custom session templates
- Integration with Claude Buddy (show orchestration activity)
- Voice commands for session management
