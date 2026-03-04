export class HistoryPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.container.className = 'history-panel';
    this.searchQuery = '';
    this._render();
    this._loadHistory();
  }

  _render() {
    this.container.innerHTML = `
      <div class="history-header">
        <h2>Meanwhile in NEXUS...</h2>
        <span class="history-subtitle">Session history &amp; output logs</span>
      </div>
      <div class="history-search">
        <input type="text" class="history-search-input" placeholder="Search history..." id="history-search" />
      </div>
      <div class="history-list" id="history-list">
        <div class="dashboard-empty">Loading history...</div>
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
      this.container.querySelector('#history-list').style.display = 'block';
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
              <span class="history-item-time">${new Date(s.createdAt).toLocaleTimeString()}</span>
            </div>
          `).join('')}
        </div>`;
      }

      listEl.innerHTML = html;

      listEl.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
          this._viewSession(el.dataset.sessionId);
        });
      });
    } catch (e) {
      // History may not be available yet
    }
  }

  async _viewSession(sessionId) {
    const listEl = this.container.querySelector('#history-list');
    const viewerEl = this.container.querySelector('#history-viewer');
    const titleEl = this.container.querySelector('#history-viewer-title');
    const contentEl = this.container.querySelector('#history-viewer-content');

    titleEl.textContent = `Session: ${sessionId}`;
    contentEl.textContent = 'Loading output...';
    listEl.style.display = 'none';
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

  dispose() {
    this.container.innerHTML = '';
  }
}
