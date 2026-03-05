class TaskQueue {
  constructor() {
    this.tasks = new Map(); // id -> task
    this.nextId = 1;
  }

  push(task) {
    const id = String(this.nextId++);

    // Validate dependencies exist and check for cycles
    const deps = task.dependencies || [];
    if (deps.length > 0) {
      const validation = this._validateDependencies(id, deps);
      if (validation.error) {
        return { error: validation.error };
      }
    }

    this.tasks.set(id, {
      id,
      title: task.title,
      description: task.description || '',
      priority: task.priority || 3, // 1=highest, 5=lowest
      status: 'pending', // pending, assigned, in_progress, done, failed, blocked
      assignee: null,
      dependencies: deps,
      blocked_by: null, // set when blocked due to a failed dependency
      createdBy: task.createdBy || null,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { id };
  }

  pull(sessionId) {
    // Find highest-priority unblocked, unassigned task with all deps satisfied
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

    // Failure propagation: block all transitive dependents
    if (updates.status === 'failed') {
      this._propagateFailure(taskId);
    }

    // Auto-unblock: when a task succeeds, check blocked dependents
    if (updates.status === 'done') {
      this._autoUnblock(taskId);
    }

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
    const nodes = [];
    const edges = [];
    for (const t of this.tasks.values()) {
      nodes.push({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: t.assignee,
      });
      for (const depId of t.dependencies) {
        edges.push({ from: depId, to: t.id });
      }
    }
    return { nodes, edges };
  }

  _validateDependencies(newId, deps) {
    for (const depId of deps) {
      if (!this.tasks.has(depId)) {
        return { error: `Dependency task #${depId} does not exist` };
      }
    }
    // Self-dep check (newId is new so can't be referenced by others — no cycle possible)
    if (deps.includes(newId)) {
      return { error: `Task cannot depend on itself` };
    }
    // Check for mutual dependency: if any dep transitively depends on another dep
    // through the existing graph, that's fine — it's not a cycle with the new task.
    // Since nothing in the graph can depend on newId yet, adding edges to newId is safe.
    return { error: null };
  }

  _depsResolved(task) {
    return task.dependencies.every(depId => {
      const dep = this.tasks.get(depId);
      return dep && dep.status === 'done';
    });
  }

  _propagateFailure(failedTaskId) {
    // Find all tasks that directly or transitively depend on the failed task
    const toBlock = new Set();
    const queue = [failedTaskId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      for (const task of this.tasks.values()) {
        if (toBlock.has(task.id)) continue;
        if (task.status === 'done' || task.status === 'failed') continue;
        if (task.dependencies.includes(currentId)) {
          toBlock.add(task.id);
          queue.push(task.id);
        }
      }
    }

    for (const taskId of toBlock) {
      const task = this.tasks.get(taskId);
      task.status = 'blocked';
      task.blocked_by = failedTaskId;
      task.updatedAt = Date.now();
    }
  }

  _autoUnblock(completedTaskId) {
    // Check all blocked tasks — unblock those whose deps are now all satisfied
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue;
      if (this._depsResolved(task)) {
        task.status = 'pending';
        task.blocked_by = null;
        task.updatedAt = Date.now();
      }
    }
  }

  clear() {
    this.tasks.clear();
    this.nextId = 1;
  }
}

module.exports = { TaskQueue };
