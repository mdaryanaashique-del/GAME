// Simulation for Neon Surge: player, enemies, bullets, waves and collisions.
// Rendering lives in render.js; DOM/input lives in main.js.

import {
  COMBO_WINDOW,
  CONFIG,
  MAX_LIVES,
  POWERUP_DURATION,
  START_LIVES,
  circlesOverlap,
  clamp,
  comboMultiplier,
  isBossWave,
  moveTowards,
  pickEnemyType,
  pickPowerUp,
  powerUpDropChance,
  scoreForKill,
  spawnX,
  waveSpec,
} from './logic.js';
import {
  createBullet,
  createEnemy,
  createPlayer,
  createPowerUp,
  createStarfield,
  resizeStarfield,
  spawnBurst,
  spawnFloatingText,
  updateStarfield,
} from './entities.js';

export class Game {
  constructor(options = {}) {
    this.width = options.width ?? 960;
    this.height = options.height ?? 640;
    this.rng = options.rng ?? Math.random;
    this.events = [];
    this.stars = createStarfield(this.width, this.height, 110);
    this.state = 'title';
    this.time = 0;
    this.reset();
  }

  /* ------------------------------ lifecycle ------------------------------ */

  reset() {
    this.player = createPlayer(this.width, this.height);
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.powerups = [];
    this.particles = [];
    this.score = 0;
    this.wave = 0;
    this.kills = 0;
    this.lives = START_LIVES;
    this.streak = 0;
    this.streakTimer = 0;
    this.powerTimers = { rapid: 0, spread: 0, shield: 0 };
    this.shake = 0;
    this.flash = 0;
    this.boss = null;
    this.spawnLeft = 0;
    this.spawnTimer = 0;
    this.waveActive = false;
    this.waveDelay = 0;
    this.spec = waveSpec(1);
    this.time = 0;
  }

  start() {
    this.reset();
    this.state = 'playing';
    this.beginWave(1);
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    this.emit({ type: 'pause' });
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this.emit({ type: 'resume' });
    return true;
  }

  quitToTitle() {
    this.reset();
    this.state = 'title';
  }

  setViewport(width, height) {
    const nextW = Math.max(240, Math.round(width));
    const nextH = Math.max(240, Math.round(height));
    if (nextW === this.width && nextH === this.height) return;
    this.width = nextW;
    this.height = nextH;
    this.player.x = clamp(this.player.x, 30, this.width - 30);
    this.player.y = clamp(this.player.y, 70, this.height - 24);
    resizeStarfield(this.stars, this.width, this.height);
  }

  /* -------------------------------- events ------------------------------- */

  emit(event) {
    this.events.push(event);
  }

  drainEvents() {
    if (this.events.length === 0) return [];
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, input = {}) {
    const step = clamp(dt, 0, CONFIG.maxDt);

    if (this.state === 'playing') {
      this.time += step;
      this._updateStarfield(step);
      this._updatePlayer(step, input);
      this._updateFiring(step);
      this._updatePowerTimers(step);
      this._updateSpawning(step);
      this._updateEnemies(step);
      this._updateBullets(step);
      this._updatePowerUps(step);
      this._resolveCollisions();
      this._updateParticles(step);
      this._updateStreak(step);
      this._updateWaveState(step);
    } else if (this.state === 'title') {
      this._updateStarfield(step * 0.5);
    } else if (this.state === 'over') {
      this._updateStarfield(step * 0.35);
      this._updateParticles(step);
      this._updateBullets(step);
    }

    this.shake = Math.max(0, this.shake - step * 34);
    this.flash = Math.max(0, this.flash - step * 2.4);
  }

  _updateStarfield(dt) {
    updateStarfield(this.stars, dt, this.width, this.height);
  }

  _updatePlayer(dt, input) {
    const p = this.player;
    const speed = CONFIG.playerSpeed;
    const target = input.target;

    if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      const step = speed * dt;
      const next = moveTowards(p.x, p.y, target.x, target.y, step);
      p.vx = dt > 0 ? (next.x - p.x) / dt : 0;
      p.vy = dt > 0 ? (next.y - p.y) / dt : 0;
      p.x = next.x;
      p.y = next.y;
    } else {
      const mx = clamp(input.moveX ?? 0, -1, 1);
      const my = clamp(input.moveY ?? 0, -1, 1);
      const len = Math.hypot(mx, my);
      const targetVx = len > 0 ? (mx / len) * speed : 0;
      const targetVy = len > 0 ? (my / len) * speed : 0;
      const smoothing = Math.min(1, dt * 16);
      p.vx += (targetVx - p.vx) * smoothing;
      p.vy += (targetVy - p.vy) * smoothing;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    const minY = Math.min(this.height * 0.45, 84);
    p.x = clamp(p.x, p.radius + 8, this.width - p.radius - 8);
    p.y = clamp(p.y, minY, this.height - p.radius - 10);

    p.invuln = Math.max(0, p.invuln - dt);
    p.thrust = clamp(Math.hypot(p.vx, p.vy) / speed, 0, 1);

    // Engine trail.
    if (Math.random() < 0.75) {
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 6,
        y: p.y + p.radius + 4,
        vx: (Math.random() - 0.5) * 40,
        vy: 150 + Math.random() * 130,
        life: 0.24,
        maxLife: 0.24,
        size: 2.2 + Math.random() * 1.6,
        color: Math.random() > 0.5 ? '#00f0ff' : '#8b5cf6',
        kind: 'spark',
        gravity: 0,
        text: '',
      });
    }
  }

  _updateFiring(dt) {
    const p = this.player;
    p.fireTimer -= dt;
    if (p.fireTimer > 0) return;

    const rapid = this.powerTimers.rapid > 0;
    const spread = this.powerTimers.spread > 0;
    p.fireTimer = CONFIG.fireInterval * (rapid ? CONFIG.rapidFactor : 1);

    const muzzleY = p.y - p.radius - 7;
    const angles = spread ? [-0.24, 0, 0.24] : [0];
    for (const angle of angles) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.bullets.push(
        createBullet(p.x + sin * 10, muzzleY, sin * CONFIG.bulletSpeed, -cos * CONFIG.bulletSpeed, {
          damage: CONFIG.bulletDamage,
          color: spread ? '#b6ff3c' : '#00f0ff',
          radius: spread ? 3 : 3.4,
        }),
      );
    }
    this.emit({ type: 'shoot' });
  }

  _updatePowerTimers(dt) {
    for (const key of Object.keys(this.powerTimers)) {
      if (this.powerTimers[key] > 0) {
        this.powerTimers[key] = Math.max(0, this.powerTimers[key] - dt);
        if (this.powerTimers[key] === 0) this.emit({ type: 'powerExpired', power: key });
      }
    }
  }

  _updateStreak(dt) {
    if (this.streakTimer > 0) {
      this.streakTimer = Math.max(0, this.streakTimer - dt);
      if (this.streakTimer === 0 && this.streak > 0) {
        this.streak = 0;
        this.emit({ type: 'comboEnd' });
      }
    }
  }

  /* --------------------------------- waves -------------------------------- */

  beginWave(wave) {
    const spec = waveSpec(wave);
    this.wave = spec.wave;
    this.spec = spec;
    this.spawnLeft = spec.total;
    this.spawnTimer = spec.boss ? 0.9 : 0.7;
    this.waveActive = true;
    this.waveDelay = 0;
    this.emit({ type: 'wave', wave: spec.wave, boss: spec.boss, label: spec.label });
  }

  _updateSpawning(dt) {
    if (!this.waveActive || this.spawnLeft <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    if (this.spec.boss) {
      this._spawnBoss();
      this.spawnLeft = 0;
      return;
    }

    const type = pickEnemyType(this.wave, this.rng());
    const radius = type === 'tank' ? 23 : type === 'weaver' ? 14 : 15;
    const enemy = createEnemy(type, spawnX(this.width, radius, this.rng), -radius - 12, {
      hpBonus: this.spec.hpBonus,
      speedScale: this.spec.speedScale,
    });
    this.enemies.push(enemy);
    this.spawnLeft -= 1;
    this.spawnTimer = this.spec.spawnInterval;
  }

  _spawnBoss() {
    const boss = createEnemy('boss', this.width / 2, -70, {
      hp: this.spec.bossHp,
      speedScale: this.spec.bossSpeed,
    });
    boss.entered = false;
    boss.patrolPhase = 0;
    this.enemies.push(boss);
    this.boss = boss;
    this.emit({ type: 'bossSpawn' });
  }

  _updateWaveState(dt) {
    if (this.waveActive && this.spawnLeft <= 0 && this.enemies.length === 0 && this.state === 'playing') {
      this.waveActive = false;
      this.waveDelay = 1.25;
      this.emit({ type: 'waveClear', wave: this.wave });
    }

    if (!this.waveActive && this.waveDelay > 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this.beginWave(this.wave + 1);
    }
  }

  /* -------------------------------- enemies ------------------------------- */

  _updateEnemies(dt) {
    const p = this.player;

    for (const e of this.enemies) {
      e.age += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 4);

      if (e.type === 'boss') {
        if (!e.entered) {
          const home = this.height * 0.2;
          const next = moveTowards(e.x, e.y, e.x, home, e.speed * dt);
          e.y = next.y;
          if (Math.abs(e.y - home) < 1) e.entered = true;
        } else {
          const centerX = this.width / 2;
          const span = Math.max(60, this.width * 0.32);
          e.patrolPhase += dt * 0.55;
          const targetX = centerX + Math.sin(e.patrolPhase) * span;
          const next = moveTowards(e.x, e.y, targetX, this.height * 0.2, e.speed * dt * 1.4);
          e.x = next.x;
          e.y = this.height * 0.2 + Math.sin(e.age * 1.6) * 16;
        }
      } else if (e.type === 'weaver') {
        e.y += e.speed * dt * 0.82;
        e.x = e.baseX + Math.sin(e.phase + e.age * 2.7) * (e.amplitude + 26);
      } else if (e.type === 'tank') {
        e.y += e.speed * dt;
        e.x = e.baseX + Math.sin(e.phase + e.age * 0.9) * e.amplitude * 0.5;
      } else {
        e.y += e.speed * dt;
        e.x = e.baseX + Math.sin(e.phase + e.age * 1.7) * e.amplitude;
      }

      // Keep non-boss enemies inside the field horizontally.
      if (e.type !== 'boss') {
        e.x = clamp(e.x, e.radius + 4, this.width - e.radius - 4);
      }

      e.fireTimer -= dt;
      const canShoot = e.y > e.radius && e.y < this.height - 40 && e.fireTimer <= 0;
      if (canShoot) {
        this._enemyShoot(e, p);
        const jitter = 0.8 + this.rng() * 0.5;
        e.fireTimer = Math.max(0.5, e.fireDelay * jitter) / (1 + Math.max(0, this.wave - 1) * 0.02);
      }
    }

    // Remove enemies that flew past the bottom.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (e.type !== 'boss' && e.y > this.height + e.radius + 40) {
        this.enemies.splice(i, 1);
        this.streak = 0;
        this.streakTimer = 0;
      }
    }
  }

  _enemyShoot(enemy, player) {
    const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const speed = CONFIG.enemyBulletSpeed * (1 + Math.min(0.6, this.wave * 0.03));
    const push = (angle, extra = 0) => {
      this.enemyBullets.push(
        createBullet(
          enemy.x,
          enemy.y + enemy.radius * 0.6,
          Math.cos(angle) * (speed + extra),
          Math.sin(angle) * (speed + extra),
          { friendly: false, color: enemy.type === 'boss' ? '#ff2e97' : '#ffc857', radius: 4.2, life: 4 },
        ),
      );
    };

    if (enemy.type === 'boss') {
      enemy.volley = (enemy.volley + 1) % 3;
      if (enemy.volley === 0) {
        // Aimed burst.
        push(aim);
        push(aim - 0.18);
        push(aim + 0.18);
      } else if (enemy.volley === 1) {
        // Radial ring.
        for (let i = 0; i < 10; i += 1) push((Math.PI * 2 * i) / 10 + enemy.age * 0.4, -60);
      } else {
        // Sweep.
        for (let i = -2; i <= 2; i += 1) push(aim + i * 0.24);
      }
      this.emit({ type: 'enemyShoot' });
      return;
    }

    if (enemy.type === 'tank') {
      push(aim - 0.2);
      push(aim);
      push(aim + 0.2);
    } else if (enemy.type === 'weaver') {
      push(aim);
    } else {
      push(aim + (this.rng() - 0.5) * 0.16);
    }
    this.emit({ type: 'enemyShoot' });
  }

  /* -------------------------------- bullets ------------------------------- */

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -40 || b.x < -40 || b.x > this.width + 40) this.bullets.splice(i, 1);
    }

    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = this.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const out = b.x < -60 || b.x > this.width + 60 || b.y > this.height + 60 || b.y < -80;
      if (b.life <= 0 || out) this.enemyBullets.splice(i, 1);
    }
  }

  _updatePowerUps(dt) {
    for (let i = this.powerups.length - 1; i >= 0; i -= 1) {
      const pu = this.powerups[i];
      pu.age += dt;
      pu.y += pu.vy * dt;
      pu.x += Math.sin(pu.age * 2.2) * 18 * dt;
      if (pu.y > this.height + 30) this.powerups.splice(i, 1);
    }
  }

  _updateParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - Math.min(0.9, dt * 1.8);
      p.vy *= 1 - Math.min(0.9, dt * 1.1);
    }
    if (list.length > CONFIG.maxParticles) list.splice(0, list.length - CONFIG.maxParticles);
  }

  /* ------------------------------- collisions ----------------------------- */

  _resolveCollisions() {
    // Player bullets vs enemies.
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      let hit = false;
      for (const e of this.enemies) {
        if (!circlesOverlap(b.x, b.y, b.radius, e.x, e.y, e.radius)) continue;
        e.hp -= b.damage;
        e.hitFlash = 1;
        spawnBurst(this.particles, b.x, b.y, e.color, 4, { speed: 110, life: 0.26, size: 2.2 });
        hit = true;
        if (e.hp <= 0) this._killEnemy(e);
        break;
      }
      if (hit) {
        this.bullets.splice(i, 1);
        this.emit({ type: 'hit' });
      }
    }

    // Enemy bullets vs player.
    const p = this.player;
    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = this.enemyBullets[i];
      if (!circlesOverlap(b.x, b.y, b.radius, p.x, p.y, CONFIG.playerHitRadius)) continue;
      this.enemyBullets.splice(i, 1);
      this._damagePlayer();
      if (this.state !== 'playing') return;
    }

    // Enemy bodies vs player.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (!circlesOverlap(e.x, e.y, e.radius * 0.86, p.x, p.y, CONFIG.playerHitRadius)) continue;
      if (e.type !== 'boss') {
        e.hp = 0;
        this._killEnemy(e);
      }
      this._damagePlayer();
      if (this.state !== 'playing') return;
    }

    // Power-ups vs player.
    for (let i = this.powerups.length - 1; i >= 0; i -= 1) {
      const pu = this.powerups[i];
      if (!circlesOverlap(pu.x, pu.y, pu.radius + 6, p.x, p.y, CONFIG.playerRadius + 6)) continue;
      this.powerups.splice(i, 1);
      this.powerTimers[pu.type] = POWERUP_DURATION[pu.type] ?? 8;
      spawnFloatingText(this.particles, pu.x, pu.y - 12, `${pu.label}!`, '#b6ff3c');
      spawnBurst(this.particles, pu.x, pu.y, '#b6ff3c', 16, { speed: 190, life: 0.5 });
      this.emit({ type: 'powerup', power: pu.type });
    }
  }

  _killEnemy(enemy) {
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);

    this.kills += 1;
    this.streak += 1;
    this.streakTimer = COMBO_WINDOW;
    const gained = scoreForKill(enemy.score, this.streak);
    this.score += gained;
    const multiplier = comboMultiplier(this.streak);
    if (multiplier > 1) {
      spawnFloatingText(this.particles, enemy.x, enemy.y - 14, `×${multiplier}`, '#ffc857');
    }

    if (enemy.type === 'boss') {
      this.boss = null;
      this.shake = Math.max(this.shake, 18);
      this.flash = 0.55;
      spawnBurst(this.particles, enemy.x, enemy.y, '#00f0ff', 60, { speed: 460, life: 1.1, size: 4.4 });
      spawnBurst(this.particles, enemy.x, enemy.y, '#ff2e97', 40, { speed: 300, life: 0.9, size: 3.2 });
      this._dropPowerUp(enemy.x - 36, enemy.y, 'shield');
      this._dropPowerUp(enemy.x + 36, enemy.y, 'spread');
      this._dropPowerUp(enemy.x, enemy.y + 26, 'rapid');
      if (this.lives < MAX_LIVES) {
        this.lives += 1;
        this.emit({ type: 'lifeGained', lives: this.lives });
      }
      this.emit({ type: 'bossDown', score: this.score });
      return;
    }

    this.shake = Math.max(this.shake, 5);
    spawnBurst(this.particles, enemy.x, enemy.y, enemy.color, 18, { speed: 280, life: 0.62 });
    spawnFloatingText(this.particles, enemy.x, enemy.y, `+${gained}`, '#e9f4ff');
    if (this.rng() < powerUpDropChance(this.wave)) {
      this._dropPowerUp(enemy.x, enemy.y, pickPowerUp(this.rng()));
    }
    this.emit({ type: 'kill', enemy: enemy.type, score: this.score, streak: this.streak });
  }

  _dropPowerUp(x, y, type) {
    const pu = createPowerUp(type, clamp(x, 24, this.width - 24), clamp(y, 30, this.height - 40));
    this.powerups.push(pu);
  }

  _damagePlayer() {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'playing') return;

    if (this.powerTimers.shield > 0) {
      this.powerTimers.shield = 0;
      p.invuln = 0.9;
      spawnBurst(this.particles, p.x, p.y, '#8b5cf6', 26, { speed: 300, life: 0.7 });
      this.shake = Math.max(this.shake, 8);
      this.emit({ type: 'shieldBreak' });
      return;
    }

    this.lives -= 1;
    this.streak = 0;
    this.streakTimer = 0;
    p.invuln = CONFIG.invulnTime;
    this.shake = Math.max(this.shake, 14);
    this.flash = 0.45;
    spawnBurst(this.particles, p.x, p.y, '#ff2e97', 34, { speed: 340, life: 0.8 });
    this.emit({ type: 'hurt', lives: this.lives });

    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'over';
      this.boss = null;
      this.emit({
        type: 'gameover',
        score: this.score,
        wave: this.wave,
        kills: this.kills,
        multiplier: comboMultiplier(this.streak),
      });
    }
  }
}
