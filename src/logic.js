// Pure game rules for Neon Surge. No DOM and no canvas here, so the same
// module can be imported by the renderer and by the unit tests.

export const MAX_SCORES = 5;
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const COMBO_WINDOW = 2.5;
export const MAX_MULTIPLIER = 5;
export const BOSS_EVERY = 5;
export const SCORE_PAD = 6;

export const CONFIG = {
  playerSpeed: 560,
  playerRadius: 13,
  playerHitRadius: 10,
  fireInterval: 0.21,
  rapidFactor: 0.52,
  bulletSpeed: 920,
  bulletDamage: 1,
  enemyBulletSpeed: 300,
  invulnTime: 1.8,
  maxDt: 0.05,
  maxParticles: 420,
};

export const ENEMY_STATS = {
  grunt: { hp: 1, radius: 15, speed: 96, score: 40, color: '#ff2e97', fireDelay: 2.7, drift: 46 },
  weaver: { hp: 2, radius: 14, speed: 124, score: 70, color: '#8b5cf6', fireDelay: 3.3, drift: 150 },
  tank: { hp: 5, radius: 23, speed: 64, score: 120, color: '#ffc857', fireDelay: 2.2, drift: 28 },
  boss: { hp: 46, radius: 56, speed: 44, score: 900, color: '#00f0ff', fireDelay: 1.6, drift: 70 },
};

export const POWERUP_DURATION = { rapid: 9, spread: 10, shield: 8 };
export const POWERUP_LABEL = { rapid: 'Rapid', spread: 'Spread', shield: 'Shield' };

/* ------------------------------- math helpers ------------------------------ */

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return n < min ? min : n > max ? max : n;
}

export function clampInt(value, min, max) {
  return Math.round(clamp(value, min, max));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function randRange(min, max, rng = Math.random) {
  return min + rng() * (max - min);
}

export function randInt(min, max, rng = Math.random) {
  return Math.floor(randRange(min, max + 1, rng));
}

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const reach = ar + br;
  return dx * dx + dy * dy <= reach * reach;
}

/** Move (x, y) toward (tx, ty), never further than `step` pixels in one call. */
export function moveTowards(x, y, tx, ty, step) {
  const dx = tx - x;
  const dy = ty - y;
  const distance = Math.hypot(dx, dy);
  if (distance <= step || distance === 0) return { x: tx, y: ty, distance };
  return { x: x + (dx / distance) * step, y: y + (dy / distance) * step, distance };
}

/* --------------------------------- economy -------------------------------- */

export function formatScore(score, pad = SCORE_PAD) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  return String(n).padStart(pad, '0');
}

export function comboMultiplier(streak) {
  return clampInt(1 + Math.floor(Math.max(0, streak) / 4), 1, MAX_MULTIPLIER);
}

export function scoreForKill(base, streak) {
  return Math.max(0, Math.floor(base)) * comboMultiplier(streak);
}

/* ---------------------------------- waves --------------------------------- */

export function isBossWave(wave) {
  return Math.max(1, Math.floor(Number(wave) || 1)) % BOSS_EVERY === 0;
}

export function waveSpec(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const boss = w % BOSS_EVERY === 0;
  const bossIndex = Math.floor(w / BOSS_EVERY);
  return {
    wave: w,
    boss,
    total: boss ? 1 : Math.min(30, 6 + w * 2),
    spawnInterval: boss ? 0 : Math.max(0.3, 0.95 - (w - 1) * 0.05),
    speedScale: 1 + (w - 1) * 0.06,
    hpBonus: Math.floor((w - 1) / 3),
    bossHp: boss ? 46 + (bossIndex - 1) * 30 : 0,
    bossSpeed: boss ? 1 + (bossIndex - 1) * 0.16 : 1,
    label: boss ? `WARNING // BOSS ${bossIndex}` : `WAVE ${w}`,
  };
}

export function pickEnemyType(wave, roll = Math.random()) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const r = clamp(roll, 0, 0.999999);
  if (w >= 4 && r > 0.86) return 'tank';
  if (w >= 2 && r > 0.58) return 'weaver';
  return 'grunt';
}

export function spawnX(width, radius, rng = Math.random) {
  const pad = radius + 18;
  const span = Math.max(1, width - pad * 2);
  return pad + rng() * span;
}

/* -------------------------------- power-ups ------------------------------- */

export function powerUpDropChance(wave) {
  return clamp(0.08 + Math.max(1, wave) * 0.004, 0.08, 0.19);
}

export function pickPowerUp(roll = Math.random()) {
  const r = clamp(roll, 0, 0.999999);
  if (r < 0.34) return 'spread';
  if (r < 0.68) return 'rapid';
  return 'shield';
}

/* ------------------------------- high scores ------------------------------ */

function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const score = Number(entry.score);
  if (!Number.isFinite(score) || score < 0) return null;
  return {
    score: Math.floor(score),
    wave: clampInt(entry.wave ?? 1, 1, 999),
    kills: clampInt(entry.kills ?? 0, 0, 999999),
    at: typeof entry.at === 'string' ? entry.at.slice(0, 32) : '',
  };
}

export function sanitizeScores(list, max = MAX_SCORES) {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const raw of list) {
    const entry = cleanEntry(raw);
    if (entry) clean.push(entry);
  }
  clean.sort((a, b) => b.score - a.score || b.wave - a.wave || b.kills - a.kills);
  return clean.slice(0, Math.max(1, max));
}

export function bestScore(list) {
  const clean = sanitizeScores(list, 1);
  return clean.length ? clean[0].score : 0;
}

/**
 * Add a finished run to the leaderboard.
 * `isRecord` is only true when the run beats every previous score.
 */
export function insertScore(list, entry, max = MAX_SCORES) {
  const previousBest = bestScore(list);
  const scores = sanitizeScores([...(Array.isArray(list) ? list : []), entry], max);
  const clean = cleanEntry(entry) ?? { score: 0, wave: 1, kills: 0, at: '' };
  const ranked = scores.some((row) => row.score === clean.score && row.wave === clean.wave && row.kills === clean.kills);
  return {
    scores,
    best: scores.length ? scores[0].score : 0,
    isRecord: ranked && clean.score > previousBest,
  };
}

export function powerUpProgress(type, remaining) {
  const total = POWERUP_DURATION[type] ?? 1;
  return clamp((Number(remaining) || 0) / total, 0, 1);
}
