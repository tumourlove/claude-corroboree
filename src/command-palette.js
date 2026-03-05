export class CommandPalette {
  constructor(container) {
    this.container = container;
    this.commands = [];
    this.visible = false;
    this.selectedIndex = 0;
    this.overlay = null;
    this.input = null;
    this.list = null;
    this.filtered = [];
  }

  register(id, label, action, { shortcut, category } = {}) {
    // Replace if same id already registered
    this.commands = this.commands.filter(c => c.id !== id);
    this.commands.push({ id, label, action, shortcut: shortcut || '', category: category || 'General' });
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.selectedIndex = 0;

    this.overlay = document.createElement('div');
    this.overlay.className = 'cmd-palette-overlay';
    this.overlay.innerHTML = `
      <div class="cmd-palette">
        <input class="cmd-palette-input" type="text" placeholder="Type a command..." autofocus />
        <div class="cmd-palette-list"></div>
      </div>
    `;

    this.container.appendChild(this.overlay);
    this.input = this.overlay.querySelector('.cmd-palette-input');
    this.list = this.overlay.querySelector('.cmd-palette-list');

    // Backdrop click closes
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.input.addEventListener('input', () => {
      this.selectedIndex = 0;
      this._renderList();
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this._updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this._updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.filtered[this.selectedIndex]) {
          this._execute(this.filtered[this.selectedIndex].id);
        }
      }
    });

    this._renderList();
    this.input.focus();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  _filter(query) {
    if (!query) return [...this.commands];
    const q = query.toLowerCase();
    return this.commands.filter(cmd => {
      const text = `${cmd.category} ${cmd.label}`.toLowerCase();
      return text.includes(q);
    });
  }

  _renderList() {
    const query = this.input ? this.input.value : '';
    this.filtered = this._filter(query);

    if (this.filtered.length === 0) {
      this.list.innerHTML = '<div class="cmd-palette-empty">No matching commands</div>';
      return;
    }

    this.list.innerHTML = this.filtered.map((cmd, i) => `
      <div class="cmd-palette-item${i === this.selectedIndex ? ' selected' : ''}" data-index="${i}">
        <span class="cmd-palette-category">${cmd.category}</span>
        <span class="cmd-palette-label">${cmd.label}</span>
        ${cmd.shortcut ? `<span class="cmd-palette-shortcut">${cmd.shortcut}</span>` : ''}
      </div>
    `).join('');

    // Click handlers
    this.list.querySelectorAll('.cmd-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        if (this.filtered[idx]) this._execute(this.filtered[idx].id);
      });
      el.addEventListener('mouseenter', () => {
        this.selectedIndex = parseInt(el.dataset.index);
        this._updateSelection();
      });
    });
  }

  _updateSelection() {
    const items = this.list.querySelectorAll('.cmd-palette-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
    });
    // Scroll into view
    const selected = items[this.selectedIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  _execute(commandId) {
    const cmd = this.commands.find(c => c.id === commandId);
    this.hide();
    if (cmd) cmd.action();
  }
}
