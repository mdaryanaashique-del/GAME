// Lightweight entity factories. Plain objects keep the hot loop allocation-light
// and make the simulation easy to reason about.

import { ENEMY_STATS, POWERUP_LABEL, randRange } from './logic.js';

export function createPlayer(width, height) {
  return {
    x: width / 2,
    y: height - Math.max(96, Math.min(180, height * 0.16)),
    vx: 0,
    vy: 0,
    radius: 13,
    fireTimer: 0,
    invuln: 0,
    shield: 0,
    aiming: false,
    targetX: null,
    targetY: null,
    thrust: 0,
  };
}

export function createBullet(x, y, vx, vy, options = {}) {
  return {
    x,
    y,
    vx,
    vy,
    radius: options.radius ?? 3.4,
    damage: options.damage ?? 1,
    color: options.color ?? '#00f0ff',
    friendly: options.friendly !== false,
    length: options.length ?? 16,
    life: options.life ?? 2.4,
  };
}

export function createEnemy(type, x, y, options = {}) {
  const stats = ENEMY_STATS[type] ?? ENEMY_STATS.grunt;
  const hp = options.hp ?? stats.hp + (options.hpBonus ?? 0);
  return {
    type,
    x,
    y,
    baseX: x,
    radius: stats.radius,
    speed: stats.speed * (options.speedScale ?? 1),
    hp,
    maxHp: hp,
    score: stats.score,
    color: stats.color,
    fireDelay: stats.fireDelay,
    fireTimer: randRange(0.6, stats.fireDelay),
    drift: stats.drift,
    amplitude: type === 'boss' ? 0 : Math.min(90, stats.drift * 0.7),
    phase: randRange(0, Math.PI * 2),
    age: 0,
    hitFlash: 0,
    entered: false,
    volley: 0,
  };
}

export function createPowerUp(type, x, y) {
  return {
    type,
    label: POWERUP_LABEL[type] ?? 'Bonus',
    x,
    y,
    radius: 14,
    vy: 92,
    age: 0,
  };
}

export function createParticle(x, y, options = {}) {
  return {
    x,
    y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    life: options.life ?? 0.6,
    maxLife: options.life ?? 0.6,
    size: options.size ?? 3,
    color: options.color ?? '#00f0ff',
    kind: options.kind ?? 'spark',
    text: options.text ?? '',
    gravity: options.gravity ?? 0,
  };
}

export function spawnBurst(list, x, y, color, count = 14, options = {}) {
  const speed = options.speed ?? 240;
  const life = options.life ?? 0.65;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + randRange(-0.3, 0.3);
    const velocity = randRange(speed * 0.35, speed);
    list.push(
      createParticle(x, y, {
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color,
        life: randRange(life * 0.6, life),
        size: randRange(1.6, options.size ?? 3.6),
        kind: options.kind ?? 'spark',
      }),
    );
  }
}

export function spawnFloatingText(list, x, y, text, color = '#b6ff3c') {
  list.push(
    createParticle(x, y, {
      vx: randRange(-14, 14),
      vy: -76,
      life: 0.9,
      size: 13,
      color,
      kind: 'text',
      text,
    }),
  );
}

export function createStarfield(width, height, count = 90) {
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    const depth = Math.random();
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 0.6 + depth * 1.9,
      speed: 16 + depth * 120,
      alpha: 0.25 + depth * 0.6,
      hue: Math.random() > 0.72 ? '#8b5cf6' : Math.random() > 0.5 ? '#00f0ff' : '#cfe6ff',
    });
  }
  return stars;
}

export function updateStarfield(stars, dt, width, height) {
  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > height + 4) {
      star.y = -4;
      star.x = Math.random() * width;
    }
  }
}

export function resizeStarfield(stars, width, height) {
  for (const star of stars) {
    star.x = Math.min(star.x, width);
    star.y = Math.min(star.y, height);
  }
}
