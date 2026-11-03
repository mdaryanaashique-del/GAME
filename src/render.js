// Canvas renderer for Neon Surge. Pure drawing: it reads the simulation state
// and never mutates it, which keeps gameplay logic testable on its own.

import { clamp, comboMultiplier, formatScore, powerUpProgress } from './logic.js';

const PICKUP_GLYPH = { rapid: '⚡', spread: '⋔', shield: '◈' };
const PICKUP_COLOR = { rapid: '#ffc857', spread: '#b6ff3c', shield: '#8b5cf6' };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.dpr = 1;
    this.gridOffset = 0;
  }

  resize(width, height, dpr = 1) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(game, dt = 0) {
    const ctx = this.ctx;
    const { width, height } = this;
    game.width = width;
    game.height = height;

    ctx.save();
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, width, height);

    const shake = game.shake ?? 0;
    if (shake > 0.2) {
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;
      ctx.translate(sx, sy);
    }

    this._drawBackdrop(game, dt);
    this._drawStars(game);
    this._drawPowerUps(game);
    this._drawBullets(game);
    this._drawEnemies(game);
    if (game.state !== 'over') this._drawPlayer(game);
    this._drawParticles(game);
    this._drawBossBar(game);
    this._drawBanner(game);
    ctx.restore();

    this._drawFlash(game);
    this._drawVignette();
  }

  /* -------------------------------- backdrop ------------------------------- */

  _drawBackdrop(game, dt) {
    const ctx = this.ctx;
    const { width, height } = this;

    const horizon = height * 0.72;
    const glow = ctx.createLinearGradient(0, 0, 0, height);
    glow.addColorStop(0, 'rgba(12, 8, 36, 0.95)');
    glow.addColorStop(0.55, 'rgba(6, 8, 22, 0.75)');
    glow.addColorStop(1, 'rgba(24, 6, 40, 0.9)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Perspective grid.
    this.gridOffset = (this.gridOffset + dt * 46) % 64;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.13)';
    ctx.beginPath();
    for (let i = 0; i < 14; i += 1) {
      const y = horizon + Math.pow(i / 13, 2.1) * (height - horizon) + this.gridOffset * 0.2;
      if (y > height) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.beginPath();
    const vanishX = width / 2;
    for (let i = -7; i <= 7; i += 1) {
      const x = vanishX + i * (width / 7);
      ctx.moveTo(vanishX + i * 14, horizon);
      ctx.lineTo(x * 1.6 - vanishX * 0.6, height);
    }
    ctx.stroke();
    ctx.restore();

    // Distant sun.
    const sunY = horizon - 8;
    const sunR = Math.min(width, height) * 0.16;
    const sun = ctx.createRadialGradient(width / 2, sunY, 0, width / 2, sunY, sunR);
    sun.addColorStop(0, 'rgba(255, 92, 168, 0.30)');
    sun.addColorStop(0.6, 'rgba(179, 71, 255, 0.16)');
    sun.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(width / 2, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawStars(game) {
    const ctx = this.ctx;
    ctx.save();
    for (const star of game.stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = star.hue;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* --------------------------------- player -------------------------------- */

  _drawPlayer(game) {
    const ctx = this.ctx;
    const p = game.player;
    const flicker = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    if (flicker) ctx.globalAlpha = 0.35;

    const r = p.radius;
    ctx.save();
    ctx.translate(p.x, p.y);

    // Engine flare.
    const flare = 1 + p.thrust * 0.9;
    const flame = ctx.createLinearGradient(0, r * 0.6, 0, r * 3.2 * flare);
    flame.addColorStop(0, 'rgba(0, 240, 255, 0.9)');
    flame.addColorStop(0.5, 'rgba(139, 92, 246, 0.5)');
    flame.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, r * 0.55);
    ctx.lineTo(r * 0.42, r * 0.55);
    ctx.lineTo(0, r * 2.9 * flare);
    ctx.closePath();
    ctx.fill();

    // Hull.
    ctx.shadowColor = 'rgba(0, 240, 255, 0.85)';
    ctx.shadowBlur = 18;
    const hull = ctx.createLinearGradient(0, -r * 1.5, 0, r);
    hull.addColorStop(0, '#e9fdff');
    hull.addColorStop(0.45, '#39d9ff');
    hull.addColorStop(1, '#1274b8');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.65);
    ctx.lineTo(r * 0.72, r * 0.35);
    ctx.lineTo(r * 1.5, r * 0.85);
    ctx.lineTo(r * 0.35, r * 0.72);
    ctx.lineTo(-r * 0.35, r * 0.72);
    ctx.lineTo(-r * 1.5, r * 0.85);
    ctx.lineTo(-r * 0.72, r * 0.35);
    ctx.closePath();
    ctx.fill();

    // Cockpit.
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(182, 255, 60, 0.95)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.25, r * 0.26, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield bubble.
    if (game.powerTimers.shield > 0) {
      const t = powerUpProgress('shield', game.powerTimers.shield);
      ctx.strokeStyle = `rgba(139, 92, 246, ${0.35 + Math.sin(game.time * 8) * 0.15 + 0.2})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(139, 92, 246, 0.9)';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.1 + t * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* -------------------------------- enemies -------------------------------- */

  _drawEnemies(game) {
    const ctx = this.ctx;
    for (const e of game.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const flash = e.hitFlash > 0;
      const color = flash ? '#ffffff' : e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = e.type === 'boss' ? 34 : 14;

      if (e.type === 'boss') {
        this._drawBossBody(e, color);
      } else if (e.type === 'tank') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, e.radius);
        ctx.lineTo(e.radius, 0);
        ctx.lineTo(e.radius * 0.55, -e.radius);
        ctx.lineTo(-e.radius * 0.55, -e.radius);
        ctx.lineTo(-e.radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(5, 6, 15, 0.65)';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'weaver') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6 + e.age * 2;
          const rad = i % 2 === 0 ? e.radius : e.radius * 0.45;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(139, 92, 246, 0.28)';
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, e.radius);
        ctx.lineTo(e.radius * 0.95, -e.radius * 0.6);
        ctx.lineTo(0, -e.radius * 0.15);
        ctx.lineTo(-e.radius * 0.95, -e.radius * 0.6);
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;

      // Damage pips for multi-hit enemies.
      if (e.maxHp > 1 && e.type !== 'boss') {
        const w = e.radius * 1.7;
        const ratio = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(5, 6, 15, 0.7)';
        ctx.fillRect(-w / 2, -e.radius - 9, w, 3);
        ctx.fillStyle = ratio > 0.5 ? '#b6ff3c' : '#ffc857';
        ctx.fillRect(-w / 2, -e.radius - 9, w * ratio, 3);
      }

      ctx.restore();
    }
  }

  _drawBossBody(e, color) {
    const ctx = this.ctx;
    const r = e.radius;

    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, color);
    body.addColorStop(0.5, 'rgba(0, 120, 190, 0.95)');
    body.addColorStop(1, 'rgba(10, 12, 30, 0.95)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(r, r * 0.2);
    ctx.lineTo(r * 0.62, -r * 0.72);
    ctx.lineTo(0, -r * 0.45);
    ctx.lineTo(-r * 0.62, -r * 0.72);
    ctx.lineTo(-r, r * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    // Core.
    const pulse = 0.7 + Math.sin(e.age * 6) * 0.3;
    ctx.fillStyle = `rgba(255, 46, 151, ${pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Wings.
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
    ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.7, -r * 0.2);
      ctx.lineTo(side * r * 1.25, r * 0.1);
      ctx.stroke();
    }
  }

  /* -------------------------------- bullets ------------------------------- */

  _drawBullets(game) {
    const ctx = this.ctx;
    ctx.save();
    for (const b of game.bullets) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.radius * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.stroke();
    }
    for (const b of game.enemyBullets) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------- power-ups ------------------------------ */

  _drawPowerUps(game) {
    const ctx = this.ctx;
    for (const pu of game.powerups) {
      const color = PICKUP_COLOR[pu.type] ?? '#b6ff3c';
      const spin = pu.age * 1.8;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.rotate(Math.sin(spin) * 0.22);
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.fillStyle = 'rgba(5, 6, 15, 0.82)';
      ctx.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const px = Math.cos(a) * pu.radius;
        const py = Math.sin(a) * pu.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PICKUP_GLYPH[pu.type] ?? '★', 0, 1);
      ctx.restore();
    }
  }

  /* ------------------------------- particles ------------------------------ */

  _drawParticles(game) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of game.particles) {
      const t = clamp(p.life / (p.maxLife || 1), 0, 1);
      if (p.kind === 'text') {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        continue;
      }
      ctx.globalAlpha = t * 0.95;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  /* --------------------------------- HUD bits ----------------------------- */

  _drawBossBar(game) {
    const boss = game.boss;
    if (!boss || boss.hp <= 0) return;
    const ctx = this.ctx;
    const width = Math.min(this.width - 64, 460);
    const x = (this.width - width) / 2;
    const y = 104;
    const ratio = clamp(boss.hp / boss.maxHp, 0, 1);

    ctx.save();
    ctx.fillStyle = 'rgba(5, 6, 15, 0.7)';
    ctx.fillRect(x, y, width, 8);
    const grad = ctx.createLinearGradient(x, y, x + width, y);
    grad.addColorStop(0, '#ff2e97');
    grad.addColorStop(1, '#00f0ff');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillRect(x, y, width * ratio, 8);
    ctx.restore();
  }

  _drawBanner(game) {
    const ctx = this.ctx;
    const m = /(\d+)$/.exec(game.spec?.label ?? '');
    if (!game.waveActive || !m) return;
    const elapsed = game.time - game.waveStartTime;
    if (!(elapsed >= 0) || elapsed > 2.2) return;
    const alpha = elapsed < 0.35 ? elapsed / 0.35 : Math.max(0, 1 - (elapsed - 1.5) / 0.7);
    if (alpha <= 0.02) return;
    const isBoss = Boolean(game.spec?.boss);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isBoss ? '#ff2e97' : '#00f0ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 26;
    ctx.font = `bold ${Math.min(46, this.width * 0.07)}px ui-monospace, monospace`;
    ctx.fillText(isBoss ? `BOSS ${m[1]}` : `WAVE ${m[1]}`, this.width / 2, this.height * 0.42);
    ctx.restore();
  }

  _drawFlash(game) {
    if (!game.flash || game.flash <= 0.01) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = clamp(game.flash * 0.5, 0, 0.5);
    ctx.fillStyle = '#ff2e97';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  _drawVignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.28,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.78,
    );
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}

/** Shared helper so the DOM HUD and canvas agree on combo formatting. */
export function comboLabel(streak) {
  const mult = comboMultiplier(streak);
  return mult > 1 ? `×${mult}` : '';
}

export { formatScore };
