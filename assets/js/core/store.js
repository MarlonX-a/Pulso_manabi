const listeners = new Map();

export const state = {
  chapter: 0,
  direction: 0,
  transitioning: false,
  atlasFilters: { period: null, canton: null, sector: null, type: null },
};

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => handler(payload));
}
