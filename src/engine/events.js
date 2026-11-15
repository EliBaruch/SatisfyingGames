// Tiny synchronous event bus (G.events). Handlers that throw are logged, not propagated.
// emit() does not allocate: it walks the live handler list (a handler removed during
// an emit may still be skipped or called once; adding during an emit is safe).
export function createEvents() {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); return fn; },
    off(name, fn) { const a = map.get(name); if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(name, payload) {
      const a = map.get(name);
      if (!a) return;
      const n = a.length;
      for (let i = 0; i < n && i < a.length; i++) {
        try { a[i](payload); } catch (err) { console.error(`[engine] '${name}' handler failed:`, err); }
      }
    },
  };
}
