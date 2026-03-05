class TaskQueue {
  constructor() {
    this.tasks = new Map(); // id -> task
    this.nextId = 1;
  }

  push(task) {
    const id = String(this.nextId++);
    this.tasks.set(id, {
      id,
      title: task.title,
      description: task.description || '',
      priority: task.priority || 3, // 1=highest, 5=lowest
      status: 'pending', // pending, assigned, in_progress, done, failed
      assignee: null,
      dependencies: task.dependencies || [], // array of task IDs that must be done first
      createdBy: task.createdBy || null,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  }

  pull(sessionId) {
    // Find highest-priority unblocked, unassigned task
    let best = null;
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;
      if (!this._depsResolved(task)) continue;
      if (!best || task.priority < best.priority) {
        best = task;
      }
    }
    if (best) {
      best.status = 'assigned';
      best.assignee = sessionId;
      best.updatedAt = Date.now();
    }
    return best;
  }

  update(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (updates.status) task.status = updates.status;
    if (updates.result !== undefined) task.result = updates.result;
    if (updates.assignee !== undefined) task.assignee = updates.assignee;
    task.updatedAt = Date.now();
    return task;
  }

  get(taskId) {
    return this.tasks.get(taskId) || null;
  }

  list(filter) {
    let tasks = [...this.tasks.values()];
    if (filter) {
      if (filter.status) tasks = tasks.filter(t => t.status === filter.status);
      if (filter.assignee) tasks = tasks.filter(t => t.assignee === filter.assignee);
    }
    // Sort by priority (lower number = higher priority), then by creation time
    tasks.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    return tasks;
  }

  getGraph() {
    // Return tasks with dependency info for visualization
    return [...this.tasks.values()].map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      dependencies: t.dependencies,
      blocked: !this._depsResolved(t),
    }));
  }

  _depsResolved(task) {
    return task.dependencies.every(depId => {
      const dep = this.tasks.get(depId);
      return dep && dep.status === 'done';
    });
  }

  clear() {
    this.tasks.clear();
    this.nextId = 1;
  }
}

module.exports = { TaskQueue };
