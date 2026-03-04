# Claude Nexus

A tabbed Electron terminal app that enables multiple Claude Code sessions to communicate, coordinate, and orchestrate work in parallel.

## Features

- **Tabbed Terminal** — Multiple Claude Code sessions in tabs with xterm.js
- **MCP Coordination** — Sessions communicate via embedded MCP server with 16 tools (messaging, scratchpad, session spawning, cross-session search)
- **Session Orchestration** — Lead session can spawn worker sessions, delegate tasks, and collect results
- **Shared Scratchpad** — Key-value store visible to all sessions for sharing context
- **Conflict Detection** — Warns when multiple sessions edit the same file
- **Git Worktree Isolation** — Optionally creates per-session git worktrees
- **Dashboard** — Real-time overview of all sessions and activity (Ctrl+D)
- **History Panel** — Browse past session output with search (Ctrl+H)
- **Notifications** — System tray + in-app toast notifications
- **Project Picker** — Recent projects list on standalone launch
- **Explorer Integration** — Right-click "Open in Claude Nexus" for Windows folders

## Quick Start

```bash
# Install dependencies
npm install

# Launch
npm start

# Or open a specific project
npm start -- "C:\path\to\project"
```

## How It Works

Each tab spawns a Claude Code CLI process with an MCP server config injected. The MCP server gives Claude tools to:

- **`list_sessions`** / **`get_session_status`** — See other sessions
- **`send_message`** / **`broadcast`** / **`read_messages`** — Inter-session messaging
- **`spawn_session`** — Create new worker tabs
- **`report_result`** — Send results back to lead session
- **`scratchpad_set`** / **`scratchpad_get`** / **`scratchpad_list`** — Shared state
- **`read_session_history`** / **`search_across_sessions`** — Cross-reference output
- **`spawn_explorer`** — Read-only analysis session
- **`reset_session`** / **`save_checkpoint`** — Context management

## Building

```bash
npm run build
```

Produces Windows installer and portable exe via electron-builder.
