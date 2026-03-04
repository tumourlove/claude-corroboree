class Scratchpad {
  constructor() {
    this.data = new Map(); // "namespace:key" -> value
  }

  set(key, value, namespace = 'default') {
    this.data.set(`${namespace}:${key}`, { value, updatedAt: Date.now() });
  }

  get(key, namespace = 'default') {
    const entry = this.data.get(`${namespace}:${key}`);
    return entry ? entry.value : null;
  }

  list(namespace) {
    const prefix = namespace ? `${namespace}:` : '';
    const keys = [];
    for (const [k, v] of this.data) {
      if (!namespace || k.startsWith(prefix)) {
        keys.push({ key: k.replace(prefix, ''), value: v.value, updatedAt: v.updatedAt });
      }
    }
    return keys;
  }

  delete(key, namespace = 'default') {
    this.data.delete(`${namespace}:${key}`);
  }
}

module.exports = { Scratchpad };
