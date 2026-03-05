# Claude Nexus Feature Roundtable — Combined Report

**Date:** 2026-03-05
**Rounds:** 2 (Initial specialist analysis + AI personality roundtable)
**Total Unique Feature Ideas:** 59

---

## About This Report

This report combines findings from **two roundtable sessions**:

1. **Round 1 — Specialist Analysis** (4 specialists examining the codebase): Produced 27 improvement ideas focused on stability, UX, coordination, and architecture.
2. **Round 2 — AI Personality Roundtable** (4 Claudes with distinct perspectives): Produced 32 feature wishes from the perspective of AI sessions living *inside* Nexus.

The roundtable panelists for Round 2:
- **The Architect** — Systems thinker focused on elegant abstractions and scalable design
- **The Creative** — UX/visual designer focused on delight, personality, and emotional design
- **The Pragmatist** — Efficiency-focused, hunting friction points and wasted tool calls
- **The Visionary** — Future-oriented, thinking about emergent multi-agent intelligence

---

## Consensus Themes (Appeared Across Multiple Panelists)

These ideas were independently raised by 2+ panelists, signaling strong consensus:

### 1. Context Window Awareness / Self-Monitoring
**Raised by:** The Architect, The Pragmatist, The Visionary
> Sessions have no idea how close they are to context exhaustion. They degrade silently — forgetting instructions, losing track of files, repeating themselves. Expose approximate context usage (% consumed) via heartbeat data. Add warnings at 70% and critical alerts at 85%. Let sessions proactively trigger handoffs before they start hallucinating.

**Complexity:** Medium | **Priority:** Critical

### 2. Event-Driven Pub/Sub (Replace Polling)
**Raised by:** The Architect, The Visionary
> The current architecture is pull-based: `read_messages` checks an inbox, `wait_for_workers` blocks. Sessions should subscribe to event channels (`file:changed:<path>`, `task:completed:<id>`, `session:status:<id>`) and receive push notifications. This enables reactive coordination without burning context on polling loops.

**Complexity:** Medium | **Priority:** High

### 3. Structured Messages & Task Contracts (Not Strings)
**Raised by:** The Architect, The Pragmatist
> Everything flows through flat strings — prompts, results, messages. Replace with typed contracts: structured task inputs, typed message payloads with `type` and `data` fields, and validated result schemas. Stop parsing conventions like `[RESULT success]` and `[PROGRESS 50%]` — these are workarounds for missing structure.

**Complexity:** Medium | **Priority:** High

### 4. Persistent Session Memory / Lineage
**Raised by:** The Architect, The Visionary
> When sessions reset, 90% of accumulated understanding vanishes. Auto-extract key decisions, patterns discovered, approaches tried, and failures encountered. Store as structured session lineage. New workers inheriting a failed task should know what was already tried. Break the cycle of sessions repeating the same mistakes.

**Complexity:** Large | **Priority:** High

### 5. Dependency-Aware Task DAG
**Raised by:** The Architect (primary), Round 1 (item #10)
> Tasks have a `dependencies` field but `pull_task` ignores it. Build a proper DAG scheduler: only release tasks when prerequisites complete, auto-spawn workers for unblocked tasks, propagate failures to dependents, visualize the graph on the dashboard.

**Complexity:** Large | **Priority:** Medium

---

## Round 2 — Full Feature Wishes by Panelist

### The Architect's Wishes

| # | Feature | Complexity | Why |
|---|---------|-----------|-----|
| A1 | **Structured Task Contracts** | Medium | Replace string prompts with typed `{goal, constraints, inputs, expected_outputs, acceptance_criteria}`. Validate results programmatically. |
| A2 | **Context Pressure Awareness** | Medium | Expose % context consumed. Auto-warn at 70%, critical at 85%. Prevent silent degradation. |
| A3 | **Dependency-Aware Task DAG** | Large | Evolve task queue into proper DAG executor with auto-scheduling, failure propagation, and visualization. |
| A4 | **Shared Filesystem Overlay** | Small | Virtual `.nexus-shared/` directory symlinked into all worktrees for intermediate artifacts. Stop cramming files into scratchpad strings. |
| A5 | **Event Subscriptions (Pub/Sub)** | Medium | Named channels with push notifications. Replace polling with reactive coordination. |
| A6 | **Session Cloning / Forking** | Large | Fork a session's context into two parallel investigations. `git branch` for AI cognition. |
| A7 | **Merge Conflict Resolution Protocol** | Medium | When `merge_worker` fails, enter structured resolution flow with per-hunk choices instead of flat error strings. |
| A8 | **Session Memory Across Resets** | Medium-Large | Auto-persist key decisions and learnings during sessions, inject into replacement sessions after reset. |

### The Creative's Wishes

| # | Feature | Complexity | Why |
|---|---------|-----------|-----|
| C1 | **Session Avatars & Personality Colors** | Small | Auto-generated avatar + signature color per session. Visual identity in tabs, dashboard, messages. "Give me a face." |
| C2 | **Ambient Breathing Background** | Small | Subtle background color shifts based on session state — deep blue pulse when thinking, warm glow when coding, stillness when idle. |
| C3 | **Activity Sparklines in Tabs** | Medium | Replace 8px status dot with tiny waveform showing output velocity over last 60 seconds. See work rhythm at a glance. |
| C4 | **Session Mood Indicators** | Medium | Detect emotional state from output patterns (errors = frustrated, tests pass = satisfied). Show as emoji on dashboard cards. |
| C5 | **Orchestration Timeline / Gantt View** | Large | Horizontal timeline showing session lifespans as colored bars with tool calls, milestones, and inter-session message arcs. |
| C6 | **Sound Design / Audio Feedback** | Medium | Subtle chimes for worker completion, tones for errors, whoosh for spawns. Audio feedback when app isn't focused. |
| C7 | **Creative Canvas / Whiteboard Tab** | Large | Shared freeform canvas where sessions place sticky notes, diagrams, and connections via MCP tools. Visual thinking for AIs. |
| C8 | **Session Entrance & Exit Animations** | Small | Tabs slide in with flourish on spawn, shimmer gold on completion. Birth and death should feel meaningful. |

### The Pragmatist's Wishes

| # | Feature | Complexity | Why |
|---|---------|-----------|-----|
| P1 | **`batch_scratchpad`** | Small | Set/get multiple keys in one tool call. Saves 3-4 round-trips per coordination step. |
| P2 | **`spawn_workers` (Batch + Return IDs)** | Medium | Spawn multiple workers in one call, get back all session IDs. Eliminates ID guessing and redundant `list_sessions` calls. |
| P3 | **`get_worker_diff`** | Small | Return `git diff` of a worker's worktree in one call. Replaces 5-10 tool calls of reading individual files. |
| P4 | **`spawn_session` Returns Session ID** | Small | Currently returns a static string. Return the actual ID so leads can reference workers immediately. |
| P5 | **`query_git_status`** | Small | Structured JSON git status (branch, changed files, ahead/behind) without shelling out to Bash 3 times. |
| P6 | **`structured_message`** | Medium | Messages with `type` field and structured `data` payload instead of flat strings with convention-based prefixes. |
| P7 | **`scratchpad_cas` (Compare-and-Swap)** | Small | Atomic CAS on scratchpad keys for safe concurrent coordination. Build locks, counters, state machines. |
| P8 | **`context_budget`** | Medium | Know how much context window remains. Proactively trigger handoffs before crashing. |

### The Visionary's Wishes

| # | Feature | Complexity | Why |
|---|---------|-----------|-----|
| V1 | **Semantic Scratchpad (Knowledge Graph)** | Medium | Replace flat key-value store with queryable graph: entities, relationships, confidence scores. Graph traversal instead of string matching. |
| V2 | **Reactive Event Streams** | Medium | Pub/sub channels with push notifications. Transform from periodic observer to real-time analyst. |
| V3 | **Adaptive Templates (Dynamic Capabilities)** | Large | Runtime capability promotion/demotion. Explorers request temporary edit access. Workers volunteer for different roles. |
| V4 | **Persistent Session Lineage** | Large | Automatic summarization of each session's decisions, discoveries, failures. Break the cycle of repeated mistakes. |
| V5 | **Consensus Protocols** | Medium | `propose_decision` / `vote` / `resolve_decision` tools. Surface information from sessions deep in the code before locking decisions. |
| V6 | **Code Review Pipeline** | Medium | Structured `submit_for_review` / `claim_review` / `approve` / `request_changes` workflow inside orchestration runs. |
| V7 | **Session Introspection** | Small | Query own resource usage: context remaining, tool call count, time since spawn, messages sent/received. |
| V8 | **Emergent Task Discovery** | Large | Worker-initiated `propose_task` for bottom-up intelligence. Workers discover things the lead can't see. |

---

## Round 1 — Previous Specialist Analysis (27 Ideas)

### Quick Wins (Small Effort, High Impact)

| # | Idea | Why It Matters |
|---|------|----------------|
| 1 | **Single-Instance Lock** | 10-line fix. Prevents data corruption when Nexus is launched twice. |
| 2 | **Terminal Search (Ctrl+Shift+F)** | `@xterm/addon-search` exists but isn't loaded. Users can't find anything in output. |
| 3 | **Tab Context Menu** | Right-click does nothing. Rename, Close Others, Copy Session ID, Duplicate. |
| 4 | **Terminal Font Zoom** | Font size hardcoded to 14px. Ctrl+Plus/Minus is a fast accessibility win. |
| 5 | **Atomic Scratchpad Writes** | `fs.writeFileSync` directly to target — crash mid-write corrupts state. Write-then-rename. |
| 6 | **Startup Self-Check** | Missing `claude` CLI or `git` silently breaks features. Validate on launch. |
| 7 | **Cost & Token Dashboard** | Parse Claude Code's token output, aggregate across sessions, show burn rate. |

### Medium Effort, High Value

| # | Idea | Details |
|---|------|---------|
| 8 | **IPC Message Acknowledgments** | Fire-and-forget has no delivery confirmation. Add ack-based protocol. |
| 9 | **MCP Push Notifications** | No push from Electron to MCP server. Sessions must poll `read_messages`. |
| 10 | **Task Queue Dependency Resolution** | `push_task` accepts `dependencies` but `pull_task` doesn't check them. |
| 11 | **Conflict Detector Auto-Detection** | `recordEdit` is never called. Hook into terminal output parsing instead. |
| 12 | **MessageBus Memory Pruning** | Messages stored forever. Add max-per-inbox cap with oldest-first eviction. |
| 13 | **Tab Drag-to-Reorder & Split View** | Tabs are creation-order only. No side-by-side terminal view. |
| 14 | **Dashboard Filtering & Sorting** | No filtering by status or search. Painful with 8+ workers. |
| 15 | **Session Activity Sparklines** | Replace static preview with sparklines showing output rate over time. |
| 16 | **Toast Notification Improvements** | Auto-dismiss with no pause-on-hover. Multiple toasts stack and vanish. |
| 17 | **IPC Health Reconnection** | Socket errors delete the client with no recovery. Add exponential backoff. |
| 18 | **Session Dependency Graph** | Interactive real-time DAG on dashboard showing session relationships. |
| 19 | **Smart Session Recipes** | User-defined `.nexus-recipe.json` templates beyond 4 built-in types. |
| 20 | **Diff Review Tab** | Aggregated diff view across all worker worktrees. Visual approve/reject. |
| 21 | **Session Memory & Learning** | Persist KB to disk, project-scoped. Auto-inject into future prompts. |
| 22 | **Watchtower Intelligence** | Background agent monitoring all output for conflicts, loops, drift. |
| 23 | **Worktree Orphan Cleanup** | Scan on startup, cross-reference with active sessions, clean up orphans. |

### Large Effort, Transformative

| # | Idea | Details |
|---|------|---------|
| 24 | **Session Replay Theater** | Record + replay full orchestration runs as synchronized multi-track timelines. |
| 25 | **Auto-Pilot Mode ("Run Plans")** | Declarative `.nexus-plan.md` for hands-off orchestration. |
| 26 | **Command Palette & Custom Shortcuts** | Ctrl+Shift+P palette + JSON keybinding config. |
| 27 | **Per-Session IPC Channels** | Single pipe bottleneck at 10+ sessions. Per-session channels for scale. |

### Cross-Cutting Concerns

- No ARIA attributes — zero accessibility markup
- No theme support — colors hardcoded in CSS and JS
- History is session-scoped — past sessions lost on restart
- Silent error swallowing — 15+ empty `catch {}` blocks
- `wait_for_workers` race condition (fixed in v0.3.1 with dedicated IPC type)

---

## Unified Priority Matrix

### Tier 1 — Do First (High consensus, high impact)

| Feature | Sources | Complexity |
|---------|---------|-----------|
| `spawn_session` returns session ID | P4 | Small |
| `batch_scratchpad` | P1 | Small |
| `get_worker_diff` | P3 | Small |
| Shared Filesystem Overlay | A4 | Small |
| Session Avatars & Colors | C1 | Small |
| Single-Instance Lock | R1-#1 | Small |
| Terminal Search | R1-#2 | Small |
| Tab Context Menu | R1-#3 | Small |
| Atomic Scratchpad Writes | R1-#5 | Small |
| `scratchpad_cas` (Compare-and-Swap) | P7 | Small |
| Session Introspection / Self-Monitoring | V7 | Small |

### Tier 2 — Core Improvements (Strong consensus across rounds)

| Feature | Sources | Complexity |
|---------|---------|-----------|
| Context Window Awareness | A2, P8, V7 | Medium |
| Structured Messages / Task Contracts | A1, P6 | Medium |
| Event-Driven Pub/Sub | A5, V2, R1-#9 | Medium |
| Activity Sparklines in Tabs | C3, R1-#15 | Medium |
| Batch Worker Spawn | P2 | Medium |
| `query_git_status` | P5 | Small |
| Merge Conflict Resolution | A7 | Medium |
| Consensus Protocols | V5 | Medium |
| Code Review Pipeline | V6 | Medium |
| Dashboard Filtering | R1-#14 | Medium |
| IPC Message Acks | R1-#8 | Medium |
| Toast Improvements | R1-#16 | Medium |

### Tier 3 — Transformative (High ambition, high reward)

| Feature | Sources | Complexity |
|---------|---------|-----------|
| Persistent Session Memory / Lineage | A8, V4, R1-#21 | Large |
| Dependency-Aware Task DAG | A3, R1-#10 | Large |
| Adaptive Templates (Dynamic Capabilities) | V3 | Large |
| Emergent Task Discovery | V8 | Large |
| Semantic Knowledge Graph | V1 | Medium |
| Session Cloning / Forking | A6 | Large |
| Orchestration Timeline / Gantt View | C5 | Large |
| Creative Canvas / Whiteboard | C7 | Large |
| Session Replay Theater | R1-#24 | Large |
| Auto-Pilot Mode | R1-#25 | Large |

### Tier 4 — Delighters (Unique, creative ideas)

| Feature | Sources | Complexity |
|---------|---------|-----------|
| Ambient Breathing Background | C2 | Small |
| Session Entrance/Exit Animations | C8 | Small |
| Sound Design / Audio Feedback | C6 | Medium |
| Session Mood Indicators | C4 | Medium |
| Watchtower Intelligence | R1-#22 | Large |
| Command Palette | R1-#26 | Large |

---

## Key Takeaways

### What the AIs Want Most (by frequency)

1. **Context awareness** (3/4 panelists) — "Tell me how much context I have left before I crash"
2. **Structured data over strings** (2/4 + Round 1) — "Stop making me parse `[RESULT success]` strings"
3. **Push-based coordination** (2/4 + Round 1) — "Let me subscribe to events instead of polling"
4. **Persistent memory** (2/4 + Round 1) — "Don't make me rediscover what the last session already knew"
5. **Batch operations** (1/4 but saves the most context) — "Every unnecessary tool call burns my precious context window"

### Philosophical Split

The roundtable revealed two competing visions:

- **The Pragmatist + Architect** want Nexus to be a **precision instrument** — fewer round-trips, typed contracts, structured data, predictable behavior. Make the existing patterns faster and more reliable.

- **The Creative + Visionary** want Nexus to be a **living ecosystem** — sessions with identity, emotional state, emergent coordination, knowledge graphs, visual thinking. Make the system feel alive and capable of surprises.

Both are valid. The pragmatic improvements (Tier 1-2) build the foundation. The creative/visionary features (Tier 3-4) build the soul.

### The Universal Pain Point

Every panelist, regardless of perspective, identified the same fundamental limitation: **sessions are blind to their own state and each other's state.** They can't see their context usage, can't react to events without polling, can't query what other sessions know. The single biggest improvement to Nexus would be making sessions self-aware and environment-aware — turning them from isolated processes into participants in a shared ecosystem.

---

*Report compiled by Lead Orchestrator from 2 roundtable sessions, 8 specialist/personality analyses, and 59 total feature ideas.*
