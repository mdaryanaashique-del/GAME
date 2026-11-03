// Bootstrap: canvas sizing, input, HUD, screens and the animation loop.

import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import {
  MAX_LIVES,
  POWERUP_DURATION,
  bestScore,
  comboMultiplier,
  formatScore,
  insertScore,
} from './logic.js';
import { Renderer } from './render.js';
import { loadMuted, loadScores, saveMuted, saveScores } from './storage.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const game = new Game({ width: window.innerWidth, height: window.innerHeight });
const audio = new AudioEngine({ muted: loadMuted() });

const el = (id) => document.getElementById(id);
const ui = {
  score: el('hud-score'),
  wave: el('hud-wave'),
  best: el('hud-best'),
  lives: el('hud-lives'),
  powerups: el('hud-powerups'),
  combo: el('hud-combo'),
  banner: el('wave-banner'),
  title: el('screen-title'),
  pause: el('screen-pause'),
  over: el('screen-over'),
  titleScores: el('title-scores'),
  overScores: el('over-scores'),
  overScore: el('over-score'),
  overWave: el('over-wave'),
  overKills: el('over-kills'),
  overBest: el('over-best'),
  mute: el('btn-mute'),
};

let scores = loadScores();
let lastBest = bestScore(scores);

/* --------------------------------- sizing -------------------------------- */

function resize() {
  const width = Math.round(window.innerWidth);
  const height = Math.round(window.innerHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.resize(width, height, dpr);
  game.setViewport(width, height);
}

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

/* --------------------------------- input --------------------------------- */

const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };

function keyVector() {
  let x = 0;
  let y = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  return { x, y };
}

function currentInput() {
  const kv = keyVector();
  const usingKeys = kv.x !== 0 || kv.y !== 0;
  if (usingKeys) return { moveX: kv.x, moveY: kv.y, target: null };
  if (pointer.active) return { target: { x: pointer.x, y: pointer.y } };
  return { moveX: 0, moveY: 0, target: null };
}

function pointerPosition(event) {
  // Lift the ship slightly above the finger so it stays visible on touch.
  const offset = event.pointerType === 'touch' ? 46 : 0;
  pointer.x = event.clientX;
  pointer.y = event.clientY - offset;
}

canvas.addEventListener('pointerdown', (event) => {
  if (game.state !== 'playing') return;
  pointer.active = true;
  pointerPosition(event);
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointer.active || game.state !== 'playing') return;
  pointerPosition(event);
});

const releasePointer = () => {
  pointer.active = false;
};

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave', releasePointer);
window.addEventListener('blur', releasePointer);

const MOVE_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
]);

window.addEventListener('keydown', (event) => {
  if (MOVE_KEYS.has(event.code)) {
    keys.add(event.code);
    event.preventDefault();
    return;
  }

  if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault();
    if (game.state === 'playing') doPause();
    else if (game.state === 'paused') doResume();
    return;
  }

  if (event.code === 'KeyM') {
    toggleMute();
    return;
  }

  if (event.code === 'Enter' || event.code === 'Space') {
    if (game.state === 'title' || game.state === 'over') {
      event.preventDefault();
      startRun();
    }
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') doPause();
});

/* --------------------------------- audio --------------------------------- */

function syncMuteButton() {
  ui.mute.setAttribute('aria-pressed', String(!audio.muted));
  ui.mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  saveMuted(audio.muted);
  syncMuteButton();
  if (!audio.muted) audio.play('ui');
}

ui.mute.addEventListener('click', toggleMute);
syncMuteButton();

const SOUND_FOR_EVENT = {
  shoot: 'shoot',
  hit: 'hit',
  kill: 'explode',
  bossDown: 'bossDown',
  powerup: 'powerup',
  hurt: 'hurt',
  shieldBreak: 'powerup',
  wave: 'wave',
  waveClear: 'ui',
  bossSpawn: 'bossWarn',
  gameover: 'gameover',
};

function playEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'wave') {
      showBanner(event.label, event.boss);
      continue;
    }
    const sound = SOUND_FOR_EVENT[event.type];
    if (sound) audio.play(sound);
    if (event.type === 'gameover') handleGameOver(event);
    if (event.type === 'lifeGained') renderLives();
  }
}

/* --------------------------------- screens ------------------------------- */

function showBanner(label, boss = false) {
  if (!ui.banner) return;
  ui.banner.textContent = boss ? `⚠ ${label}` : label;
  ui.banner.style.color = boss ? '#ff2e97' : '#ffffff';
  ui.banner.classList.remove('show');
  // Force reflow so the animation restarts on quick wave changes.
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

function setScreen(name) {
  ui.title.classList.toggle('hidden', name !== 'title');
  ui.pause.classList.toggle('hidden', name !== 'pause');
  ui.over.classList.toggle('hidden', name !== 'over');
}

function renderScores(target, list, emptyText) {
  target.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    target.appendChild(li);
    return;
  }
  for (const row of list) {
    const li = document.createElement('li');
    const meta = document.createElement('em');
    meta.textContent = `W${row.wave} · ${row.kills} kills`;
    meta.style.fontStyle = 'normal';
    meta.style.color = 'rgba(127,146,180,0.85)';
    const value = document.createElement('span');
    value.textContent = formatScore(row.score);
    li.append(meta, value);
    target.appendChild(li);
  }
}

function refreshBoards() {
  const best = bestScore(scores);
  lastBest = best;
  ui.best.textContent = formatScore(best);
  renderScores(ui.titleScores, scores, 'No runs logged yet');
}

function renderLives() {
  ui.lives.innerHTML = '';
  const total = Math.max(MAX_LIVES, game.lives);
  for (let i = 0; i < total; i += 1) {
    const span = document.createElement('span');
    span.className = i < game.lives ? 'life' : 'life spent';
    ui.lives.appendChild(span);
  }
}

function handleGameOver(event) {
  const result = insertScore(scores, {
    score: event.score,
    wave: event.wave,
    kills: event.kills,
    at: new Date().toISOString(),
  });
  scores = result.scores;
  saveScores(scores);

  ui.overScore.textContent = formatScore(event.score);
  ui.overWave.textContent = String(event.wave);
  ui.overKills.textContent = String(event.kills);
  ui.overBest.classList.toggle('hidden', !result.isRecord);
  renderScores(ui.overScores, scores, 'No runs logged yet');
  refreshBoards();
  renderLives();
  setScreen('over');
}

function startRun() {
  audio.unlock();
  pointer.active = false;
  keys.clear();
  audio.play('ui');
  game.start();
  setScreen(null);
  showBanner('WAVE 1', false);
  renderLives();
  updateHud();
}

function doPause() {
  if (game.pause()) {
    audio.play('ui');
    setScreen('pause');
  }
}

function doResume() {
  if (game.resume()) {
    audio.unlock();
    audio.play('ui');
    setScreen(null);
  }
}

el('btn-play').addEventListener('click', startRun);
el('btn-again').addEventListener('click', startRun);
el('btn-resume').addEventListener('click', doResume);
el('btn-quit').addEventListener('click', () => {
  game.quitToTitle();
  pointer.active = false;
  setScreen('title');
  refreshBoards();
  updateHud();
});

/* ----------------------------------- HUD --------------------------------- */

let lastHud = '';

function powerChips() {
  const parts = [];
  for (const key of ['rapid', 'spread', 'shield']) {
    const remaining = game.powerTimers[key] ?? 0;
    if (remaining > 0) {
      const secs = Math.ceil(remaining);
      parts.push(`<span class="pu-chip ${key}">${key} ${secs}s</span>`);
    }
  }
  return parts.join('');
}

function updateHud() {
  const snapshot = [
    game.score,
    game.wave,
    game.lives,
    Math.round(game.powerTimers.rapid),
    Math.round(game.powerTimers.spread),
    Math.round(game.powerTimers.shield),
    comboMultiplier(game.streak),
  ].join('|');
  if (snapshot === lastHud) return;
  lastHud = snapshot;

  ui.score.textContent = formatScore(game.score);
  ui.wave.textContent = String(game.wave);
  ui.powerups.innerHTML = powerChips();
  const mult = comboMultiplier(game.streak);
  ui.combo.textContent = mult > 1 ? `COMBO ×${mult}` : '';
  renderLives();
}

/* ---------------------------------- loop --------------------------------- */

let lastTime = 0;

function frame(now) {
  const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
  lastTime = now;

  if (game.state === 'playing') {
    game.update(dt, currentInput());
  } else {
    game.update(dt, { moveX: 0, moveY: 0, target: null });
  }

  playEvents();
  renderer.draw(game, dt);
  updateHud();
  requestAnimationFrame(frame);
}

/* ---------------------------------- boot --------------------------------- */

resize();
refreshBoards();
renderLives();
updateHud();
setScreen('title');
renderer.draw(game, 0);
requestAnimationFrame(frame);

// Expose a tiny debug surface for automated checks; harmless in production.
window.__neonSurge = {
  game,
  start: startRun,
  pause: doPause,
  resume: doResume,
  state: () => game.state,
  POWERUP_DURATION,
};
