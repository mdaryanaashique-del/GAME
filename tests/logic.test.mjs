import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BOSS_EVERY,
  CONFIG,
  MAX_LIVES,
  MAX_MULTIPLIER,
  MAX_SCORES,
  bestScore,
  circlesOverlap,
  clamp,
  comboMultiplier,
  formatScore,
  insertScore,
  isBossWave,
  moveTowards,
  pickEnemyType,
  pickPowerUp,
  powerUpDropChance,
  powerUpProgress,
  sanitizeScores,
  scoreForKill,
  spawnX,
  waveSpec,
} from '../src/logic.js';
import { createEnemy, createPlayer, createStarfield, updateStarfield } from '../src/entities.js';
import { Game } from '../src/game.js';

describe('math helpers', () => {
  it('clamps into range and falls back for junk input', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(50, 0, 10), 10);
    assert.equal(clamp('nope', 2, 10), 2);
  });

  it('moves toward a target without overshooting', () => {
    const near = moveTowards(0, 0, 3, 4, 10);
    assert.deepEqual({ x: near.x, y: near.y }, { x: 3, y: 4 });

    const far = moveTowards(0, 0, 30, 40, 5);
    assert.ok(Math.abs(Math.hypot(far.x, far.y) - 5) < 1e-9);
  });

  it('detects circle overlaps', () => {
    assert.equal(circlesOverlap(0, 0, 5, 6, 0, 5), true);
    assert.equal(circlesOverlap(0, 0, 5, 11, 0, 5), false);
  });
});

describe('scoring', () => {
  it('formats scores with zero padding', () => {
    assert.equal(formatScore(0), '000000');
    assert.equal(formatScore(1234), '001234');
    assert.equal(formatScore(-9), '000000');
    assert.equal(formatScore('abc'), '000000');
  });

  it('scales the multiplier with the streak and caps it', () => {
    assert.equal(comboMultiplier(0), 1);
    assert.equal(comboMultiplier(1), 1);
    assert.equal(comboMultiplier(4), 2);
    assert.equal(comboMultiplier(8), 3);
    assert.equal(comboMultiplier(1000), MAX_MULTIPLIER);
  });

  it('applies the multiplier to kill score', () => {
    assert.equal(scoreForKill(40, 0), 40);
    assert.equal(scoreForKill(40, 4), 80);
    assert.equal(scoreForKill(0, 40), 0);
  });
});

describe('waves', () => {
  it('marks every fifth wave as a boss wave', () => {
    assert.equal(isBossWave(1), false);
    assert.equal(isBossWave(BOSS_EVERY), true);
    assert.equal(isBossWave(BOSS_EVERY * 2), true);
    assert.equal(isBossWave(0), false);
  });

  it('ramps enemy count, speed and boss hp', () => {
    const first = waveSpec(1);
    assert.equal(first.boss, false);
    assert.equal(first.total, 8);
    assert.equal(first.hpBonus, 0);

    const later = waveSpec(6);
    assert.ok(later.total > first.total);
    assert.ok(later.speedScale > first.speedScale);
    assert.ok(later.spawnInterval < first.spawnInterval);

    const boss1 = waveSpec(5);
    const boss2 = waveSpec(10);
    assert.equal(boss1.boss, true);
    assert.ok(boss2.bossHp > boss1.bossHp);
  });

  it('introduces tougher enemy types as waves progress', () => {
    assert.equal(pickEnemyType(1, 0.99), 'grunt');
    assert.equal(pickEnemyType(3, 0.99), 'weaver');
    assert.equal(pickEnemyType(6, 0.99), 'tank');
    assert.equal(pickEnemyType(6, 0), 'grunt');
  });

  it('keeps spawns inside the field', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const x = spawnX(400, 20, () => roll);
      assert.ok(x >= 38 && x <= 362, `x=${x} out of bounds`);
    }
  });
});

describe('power-ups', () => {
  it('never drops outside the chance band', () => {
    assert.ok(powerUpDropChance(1) >= 0.08);
    assert.ok(powerUpDropChance(999) <= 0.19);
    assert.ok(powerUpDropChance(9) > powerUpDropChance(1));
  });

  it('maps rolls to every power-up type', () => {
    assert.equal(pickPowerUp(0), 'spread');
    assert.equal(pickPowerUp(0.5), 'rapid');
    assert.equal(pickPowerUp(0.9), 'shield');
  });

  it('reports remaining progress clamped to 0..1', () => {
    assert.equal(powerUpProgress('rapid', 0), 0);
    assert.equal(powerUpProgress('rapid', 999), 1);
    assert.ok(Math.abs(powerUpProgress('shield', 4) - 0.5) < 1e-9);
  });
});

describe('high scores', () => {
  it('sanitizes junk entries and sorts descending', () => {
    const clean = sanitizeScores([
      { score: 100, wave: 2, kills: 4 },
      null,
      'nope',
      { score: -5 },
      { score: 900, wave: 5, kills: 30 },
    ]);
    assert.equal(clean.length, 2);
    assert.equal(clean[0].score, 900);
    assert.equal(clean[1].wave, 2);
  });

  it('caps the leaderboard length', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ score: i, wave: 1, kills: i }));
    assert.equal(sanitizeScores(many).length, MAX_SCORES);
    assert.equal(bestScore(many), 19);
  });

  it('flags a new record only when the run beats the previous best', () => {
    const first = insertScore([], { score: 500, wave: 3, kills: 10 });
    assert.equal(first.isRecord, true);
    assert.equal(first.best, 500);

    const worse = insertScore(first.scores, { score: 100, wave: 1, kills: 2 });
    assert.equal(worse.isRecord, false);
    assert.equal(worse.best, 500);

    const better = insertScore(first.scores, { score: 800, wave: 4, kills: 20 });
    assert.equal(better.isRecord, true);
    assert.equal(better.best, 800);
    assert.equal(better.scores[0].score, 800);
  });

  it('keeps the board sorted after insertion', () => {
    const { scores } = insertScore(
      [
        { score: 300, wave: 1, kills: 1 },
        { score: 100, wave: 1, kills: 1 },
      ],
      { score: 200, wave: 2, kills: 3 },
    );
    assert.deepEqual(
      scores.map((s) => s.score),
      [300, 200, 100],
    );
  });
});

describe('entities', () => {
  it('spawns the player inside the field', () => {
    const p = createPlayer(800, 600);
    assert.equal(p.x, 400);
    assert.ok(p.y > 0 && p.y < 600);
    assert.equal(p.radius, CONFIG.playerRadius);
  });

  it('applies wave bonuses to enemy hp and speed', () => {
    const base = createEnemy('grunt', 100, -20);
    const buffed = createEnemy('grunt', 100, -20, { hpBonus: 2, speedScale: 1.5 });
    assert.equal(buffed.hp, base.hp + 2);
    assert.ok(buffed.speed > base.speed);
    assert.equal(buffed.maxHp, buffed.hp);
  });

  it('recycles stars that leave the bottom', () => {
    const stars = createStarfield(300, 200, 12);
    for (const star of stars) star.y = 199;
    updateStarfield(stars, 5, 300, 200);
    for (const star of stars) assert.ok(star.y < 200);
  });
});

describe('game simulation', () => {
  const step = (game, seconds, input = {}) => {
    game.update(seconds, input);
  };

  it('starts on the title screen and begins wave 1 on start', () => {
    const game = new Game({ width: 600, height: 800 });
    assert.equal(game.state, 'title');

    game.start();
    assert.equal(game.state, 'playing');
    assert.equal(game.wave, 1);
    assert.ok(game.spawnLeft > 0);
    assert.equal(game.lives, 3);
  });

  it('moves the player toward a pointer target', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    const startX = game.player.x;
    step(game, 0.05, { target: { x: startX + 200, y: game.player.y } });
    assert.ok(game.player.x > startX);
    assert.ok(game.player.x <= startX + 200);
  });

  it('keeps the player inside the field', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    for (let i = 0; i < 40; i += 1) step(game, 0.05, { target: { x: 9999, y: 9999 } });
    assert.ok(game.player.x <= game.width - game.player.radius);
    assert.ok(game.player.y <= game.height - game.player.radius);
  });

  it('auto-fires bullets while playing', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    step(game, 0.05);
    step(game, 0.05);
    assert.ok(game.bullets.length >= 1);
  });

  it('spawns enemies over time and awards score for kills', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    for (let i = 0; i < 60; i += 1) step(game, 0.05);
    assert.ok(game.enemies.length > 0);

    const enemy = game.enemies[0];
    const before = game.score;
    enemy.hp = 1;
    game.bullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: -1,
      radius: 4,
      damage: 1,
      color: '#fff',
      friendly: true,
      life: 1,
    });
    step(game, 0.016);
    assert.ok(game.score > before);
    assert.equal(game.kills, 1);
    assert.equal(game.streak, 1);
  });

  it('stacks the combo multiplier on a kill streak', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    // Isolate the scenario: no random spawns or stray bullets steal the hits.
    game.spawnLeft = 0;
    game.waveActive = false;
    for (let i = 0; i < 4; i += 1) {
      game.enemies.length = 0;
      game.bullets.length = 0;
      game.enemyBullets.length = 0;
      game.streak = i;
      const enemy = createEnemy('grunt', 120, 120);
      enemy.hp = 1;
      // Pin the drift so the enemy stays where the bullet is injected.
      enemy.amplitude = 0;
      enemy.phase = 0;
      game.enemies.push(enemy);
      game.bullets.push({
        x: enemy.x,
        y: enemy.y,
        vx: 0,
        vy: -1,
        radius: 4,
        damage: 1,
        color: '#fff',
        friendly: true,
        life: 1,
      });
      step(game, 0.016);
    }
    assert.equal(game.streak, 4);
    assert.equal(comboMultiplier(game.streak), 2);
  });

  it('drops a power-up and applies its timer', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    game.powerups.push({ type: 'rapid', label: 'Rapid', x: game.player.x, y: game.player.y, radius: 14, vy: 0, age: 0 });
    step(game, 0.016);
    assert.equal(game.powerups.length, 0);
    assert.ok(game.powerTimers.rapid > 0);
    assert.ok(game.drainEvents().some((e) => e.type === 'powerup'));
  });

  it('consumes the shield instead of a life', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    game.powerTimers.shield = 5;
    game.enemyBullets.push({
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      radius: 4,
      friendly: false,
      color: '#fff',
      life: 2,
    });
    step(game, 0.016);
    assert.equal(game.lives, 3);
    assert.equal(game.powerTimers.shield, 0);
    assert.ok(game.player.invuln > 0);
  });

  it('ends the run when lives run out and reports the result', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    for (let i = 0; i < 3; i += 1) {
      game.player.invuln = 0;
      game.enemyBullets.push({
        x: game.player.x,
        y: game.player.y,
        vx: 0,
        vy: 0,
        radius: 4,
        friendly: false,
        color: '#fff',
        life: 2,
      });
      step(game, 0.016);
    }
    assert.equal(game.lives, 0);
    assert.equal(game.state, 'over');
    const over = game.drainEvents().find((e) => e.type === 'gameover');
    assert.ok(over);
    assert.ok(Number.isInteger(over.wave));
  });

  it('pauses, resumes and survives a viewport change', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    assert.equal(game.pause(), true);
    assert.equal(game.state, 'paused');
    const x = game.player.x;
    step(game, 0.2, { moveX: 1 });
    assert.equal(game.player.x, x);
    assert.equal(game.resume(), true);
    assert.equal(game.state, 'playing');

    game.setViewport(320, 480);
    assert.equal(game.width, 320);
    assert.ok(game.player.x <= 320);
  });

  it('spawns a boss with a health pool on the boss wave', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    game.beginWave(5);
    // Suppress auto-fire so the boss reaches the field at full health.
    game.player.fireTimer = 1e9;
    for (let i = 0; i < 40; i += 1) step(game, 0.05);
    const boss = game.enemies.find((e) => e.type === 'boss');
    assert.ok(boss, 'expected a boss to spawn');
    assert.equal(boss.hp, waveSpec(5).bossHp);
    assert.equal(game.boss, boss);
  });

  it('keeps lives within the cap when a boss is destroyed', () => {
    const game = new Game({ width: 600, height: 800 });
    game.start();
    game.beginWave(5);
    game._spawnBoss();
    // Place the boss inside the field: bullets spawned above the top edge are culled.
    game.boss.x = game.width / 2;
    game.boss.y = 120;
    game.boss.entered = true;
    game.boss.hp = 1;
    game.bullets.push({
      x: game.boss.x,
      y: game.boss.y,
      vx: 0,
      vy: -1,
      radius: 6,
      damage: 5,
      color: '#fff',
      friendly: true,
      life: 1,
    });
    step(game, 0.016);
    assert.equal(game.boss, null);
    assert.ok(game.lives <= MAX_LIVES);
    assert.ok(game.powerups.length >= 1);
  });
});
