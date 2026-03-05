export class HistoryPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.container.className = 'history-panel';
    this.searchQuery = '';
    this.viewMode = 'log'; // 'log' or 'timeline'
    this._render();
    this._loadHistory();
  }

  _sessionHue(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }

  _render() {
    this.container.innerHTML = `
      <div class="history-header">
        <div class="history-header-row">
          <div>
            <h2>Meanwhile in NEXUS...</h2>
            <span class="history-subtitle">Session history &amp; output logs</span>
          </div>
          <div class="history-view-toggle">
            <button class="history-toggle-btn active" data-view="log">Log</button>
            <button class="history-toggle-btn" data-view="timeline">Timeline</button>
          </div>
        </div>
      </div>
      <div class="history-search">
        <input type="text" class="history-search-input" placeholder="Search history..." id="history-search" />
      </div>
      <div class="history-list" id="history-list">
        <div class="dashboard-empty">Loading history...</div>
      </div>
      <div class="history-timeline" id="history-timeline" style="display:none">
        <div class="dashboard-empty">Loading timeline...</div>
      </div>
      <div class="history-viewer" id="history-viewer" style="display:none">
        <div class="history-viewer-header">
          <button class="history-back" id="history-back">&larr; Back</button>
          <span class="history-viewer-title" id="history-viewer-title"></span>
        </div>
        <pre class="history-viewer-content" id="history-viewer-content"></pre>
      </div>
    `;

    this.container.querySelector('#history-search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this._filterList();
    });

    this.container.querySelector('#history-back').addEventListener('click', () => {
      this.container.querySelector('#history-viewer').style.display = 'none';
      if (this.viewMode === 'log') {
        this.container.querySelector('#history-list').style.display = 'block';
      } else {
        this.container.querySelector('#history-timeline').style.display = 'block';
      }
    });

    // View toggle buttons
    this.container.querySelectorAll('.history-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.dataset.view;
        this.container.querySelectorAll('.history-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const listEl = this.container.querySelector('#history-list');
        const timelineEl = this.container.querySelector('#history-timeline');
        const viewerEl = this.container.querySelector('#history-viewer');
        viewerEl.style.display = 'none';
        if (this.viewMode === 'log') {
          listEl.style.display = 'block';
          timelineEl.style.display = 'none';
        } else {
          listEl.style.display = 'none';
          timelineEl.style.display = 'block';
          this._renderTimeline();
        }
      });
    });
  }

  async _loadHistory() {
    try {
      const sessions = await window.nexus.listSessions();
      const listEl = this.container.querySelector('#history-list');

      if (!sessions || sessions.length === 0) {
        listEl.innerHTML = '<div class="dashboard-empty">No sessions recorded yet</div>';
        return;
      }

      // Group by date
      const groups = new Map();
      for (const s of sessions) {
        const date = new Date(s.createdAt).toLocaleDateString();
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(s);
      }

      let html = '';
      for (const [date, items] of groups) {
        html += `<div class="history-date-group">
          <div class="history-date">${date}</div>
          ${items.map(s => `
            <div class="history-item" data-session-id="${s.id}">
              <span class="history-item-status status-${s.status || 'idle'}"></span>
              <div class="history-item-info">
                <span class="history-item-label">${s.label || s.id}</span>
                <span class="history-item-meta">${s.template || ''} ${s.isLead ? '(Lead)' : ''}</span>
              </div>
              <button class="replay-btn" data-session-id="${s.id}">Replay</button>
              <span class="history-item-time">${new Date(s.createdAt).toLocaleTimeString()}</span>
            </div>
          `).join('')}
        </div>`;
      }

      listEl.innerHTML = html;
      this._cachedSessions = sessions;

      listEl.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('replay-btn')) return;
          this._viewSession(el.dataset.sessionId);
        });
      });

      listEl.querySelectorAll('.replay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sessionId = btn.dataset.sessionId;
          const session = sessions.find(s => s.id === sessionId);
          if (session) {
            this.showReplay({
              lead: session,
              workers: sessions.filter(s => s.id !== sessionId),
            });
          }
        });
      });
    } catch (e) {
      // History may not be available yet
    }
  }

  _renderTimeline() {
    const timelineEl = this.container.querySelector('#history-timeline');
    const sessions = this._cachedSessions;

    if (!sessions || sessions.length === 0) {
      timelineEl.innerHTML = '<div class="dashboard-empty">No sessions to display on timeline</div>';
      return;
    }

    // Get timeline events from the global tracker
    const events = window.__timelineEvents || [];

    // Calculate time bounds
    const now = Date.now();
    const times = sessions.map(s => s.createdAt || now);
    const minTime = Math.min(...times);
    const maxTime = now;
    const totalDuration = Math.max(maxTime - minTime, 1000); // at least 1 second

    // Scale: pixels per millisecond
    const timelineWidth = Math.max(800, totalDuration / 100); // ~10px per second
    const rowHeight = 36;
    const headerHeight = 30;
    const leftLabelWidth = 120;

    // Time axis ticks
    const tickInterval = this._niceTickInterval(totalDuration);
    let ticksHtml = '';
    for (let t = Math.ceil(minTime / tickInterval) * tickInterval; t <= maxTime; t += tickInterval) {
      const x = leftLabelWidth + ((t - minTime) / totalDuration) * timelineWidth;
      const label = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ticksHtml += `<div class="tl-tick" style="left:${x}px"><span class="tl-tick-label">${label}</span><div class="tl-tick-line" style="height:${sessions.length * rowHeight + headerHeight}px"></div></div>`;
    }

    // Now marker
    const nowX = leftLabelWidth + timelineWidth;
    ticksHtml += `<div class="tl-now-marker" style="left:${nowX}px;height:${sessions.length * rowHeight + headerHeight}px"></div>`;

    // Session rows
    let rowsHtml = '';
    sessions.forEach((s, i) => {
      const startX = leftLabelWidth + ((s.createdAt - minTime) / totalDuration) * timelineWidth;
      const endTime = (s.status === 'exited' || s.status === 'done') ? (s.exitedAt || now) : now;
      const barWidth = Math.max(4, ((endTime - s.createdAt) / totalDuration) * timelineWidth);
      const hue = this._sessionHue(s.id);
      const color = `hsl(${hue}, 65%, 55%)`;
      const y = headerHeight + i * rowHeight;
      const label = this._escape(s.label || s.id);

      // Event dots on this session's bar
      const sessionEvents = events.filter(e => e.sessionId === s.id);
      let dotsHtml = '';
      for (const ev of sessionEvents) {
        const dotX = ((ev.timestamp - s.createdAt) / totalDuration) * timelineWidth;
        if (dotX < 0 || dotX > barWidth) continue;
        const dotColor = ev.type === 'error' ? '#ef5350'
          : ev.type === 'result' ? '#66bb6a'
          : ev.type === 'message' ? '#4fc3f7'
          : ev.type === 'task' ? '#f59e0b'
          : '#fff';
        dotsHtml += `<div class="tl-event-dot" style="left:${dotX}px;background:${dotColor}" title="${this._escape(ev.type + ': ' + (ev.label || ''))}"></div>`;
      }

      // Status indicator
      const statusClass = s.status === 'working' ? 'tl-bar-active' : s.status === 'done' ? 'tl-bar-done' : s.status === 'error' || s.status === 'failed' ? 'tl-bar-error' : '';

      rowsHtml += `
        <div class="tl-row" style="top:${y}px">
          <div class="tl-label" style="width:${leftLabelWidth}px" title="${label}">${label}</div>
          <div class="tl-bar ${statusClass}" style="left:${startX}px;width:${barWidth}px;background:${color}">
            ${dotsHtml}
          </div>
        </div>`;
    });

    const totalHeight = headerHeight + sessions.length * rowHeight + 20;
    const totalWidth = leftLabelWidth + timelineWidth + 40;

    timelineEl.innerHTML = `
      <div class="tl-container" style="width:${totalWidth}px;height:${totalHeight}px;position:relative">
        <div class="tl-axis" style="height:${headerHeight}px"></div>
        ${ticksHtml}
        ${rowsHtml}
      </div>
    `;

    // Auto-scroll to the right edge (current time)
    timelineEl.scrollLeft = totalWidth - timelineEl.clientWidth;
  }

  _niceTickInterval(totalDuration) {
    const targetTicks = 8;
    const raw = totalDuration / targetTicks;
    const intervals = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
    for (const iv of intervals) {
      if (iv >= raw) return iv;
    }
    return 600000;
  }

  async _viewSession(sessionId) {
    const listEl = this.container.querySelector('#history-list');
    const timelineEl = this.container.querySelector('#history-timeline');
    const viewerEl = this.container.querySelector('#history-viewer');
    const titleEl = this.container.querySelector('#history-viewer-title');
    const contentEl = this.container.querySelector('#history-viewer-content');

    titleEl.textContent = `Session: ${sessionId}`;
    contentEl.textContent = 'Loading output...';
    listEl.style.display = 'none';
    timelineEl.style.display = 'none';
    viewerEl.style.display = 'block';

    try {
      const history = await window.nexus.getSessionHistory(sessionId, 500);
      contentEl.textContent = history || '(no output captured)';
    } catch (e) {
      contentEl.textContent = `Error loading history: ${e.message}`;
    }
  }

  _filterList() {
    const items = this.container.querySelectorAll('.history-item');
    items.forEach(el => {
      const label = el.querySelector('.history-item-label').textContent.toLowerCase();
      const meta = el.querySelector('.history-item-meta').textContent.toLowerCase();
      const match = !this.searchQuery || label.includes(this.searchQuery) || meta.includes(this.searchQuery);
      el.style.display = match ? 'flex' : 'none';
    });
  }

  showReplay(sessions) {
    const container = this.container;
    if (!container) return;

    const listEl = container.querySelector('#history-list');
    const viewerEl = container.querySelector('#history-viewer');
    if (listEl) listEl.style.display = 'none';
    if (viewerEl) viewerEl.style.display = 'none';

    // Remove any existing replay view
    const existing = container.querySelector('.replay-view');
    if (existing) existing.remove();

    let html = '<div class="replay-view">';
    html += '<div class="replay-header"><h3>Run Replay</h3>';
    html += '<button class="replay-back">&#8592; Back</button></div>';

    // Timeline
    html += '<div class="replay-timeline">';
    const allSessions = [sessions.lead, ...sessions.workers].filter(Boolean);
    const templateColors = {
      lead: '#f59e0b',
      implementer: '#3b82f6',
      researcher: '#10b981',
      reviewer: '#8b5cf6',
      explorer: '#ec4899',
    };

    allSessions.forEach(s => {
      const color = templateColors[s.template] || '#6b7280';
      const label = this._escape(s.label || s.id || 'unknown');
      const template = s.template || 'unknown';
      const outputLines = (s.output || []).slice(-200).join('');
      html += `
        <div class="replay-session" style="border-left: 3px solid ${color}">
          <div class="replay-session-header">
            <span class="replay-session-label" style="color:${color}">${label}</span>
            <span class="replay-session-template">${template}</span>
          </div>
          <div class="replay-output"><pre>${this._escape(outputLines)}</pre></div>
        </div>`;
    });
    html += '</div></div>';

    container.insertAdjacentHTML('beforeend', html);

    container.querySelector('.replay-view .replay-back').addEventListener('click', () => {
      const replayView = container.querySelector('.replay-view');
      if (replayView) replayView.remove();
      if (listEl) listEl.style.display = 'block';
    });
  }

  _escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  dispose() {
    this.container.innerHTML = '';
  }
}
