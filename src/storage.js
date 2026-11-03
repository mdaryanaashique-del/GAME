// localStorage wrappers that never throw (private mode, disabled storage, SSR).

import { sanitizeScores } from './logic.js';

const SCORES_KEY = 'neon-surge:scores:v1';
const MUTED_KEY = 'neon-surge:muted:v1';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__neon_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadScores() {
  const store = storage();
  if (!store) return [];
  try {
    return sanitizeScores(JSON.parse(store.getItem(SCORES_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function saveScores(scores) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(SCORES_KEY, JSON.stringify(sanitizeScores(scores)));
    return true;
  } catch {
    return false;
  }
}

export function loadMuted() {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(MUTED_KEY, muted ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}
