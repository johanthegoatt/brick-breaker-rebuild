import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, stepGame, advanceLevel } from "../src/gameEngine.js";

test("createInitialState provides expected baseline", () => {
  const state = createInitialState({ width: 900, height: 500 });

  assert.equal(state.width, 900);
  assert.equal(state.height, 500);
  assert.equal(state.lives, 3);
  assert.ok(state.bricks.length > 0);
  assert.equal(state.ballLocked, true);
});

test("launch unlocks ball and gives it velocity", () => {
  const state = createInitialState();
  const next = stepGame(state, { launch: true });

  assert.equal(next.ballLocked, false);
  assert.notEqual(next.ball.vx, 0);
  assert.ok(next.ball.vy < 0);
});

test("destroying a brick increases score and combo", () => {
  const state = createInitialState({ width: 500, height: 400 });
  state.bricks = [
    {
      id: "only",
      x: 220,
      y: 160,
      width: 60,
      height: 20,
      hits: 1,
      maxHits: 1,
      points: 100,
    },
  ];
  state.ballLocked = false;
  state.ball.x = 250;
  state.ball.y = 151;
  state.ball.vx = 0;
  state.ball.vy = 200;

  const next = stepGame(state, { dt: 0.05 });
  assert.equal(next.bricks.length, 0);
  assert.ok(next.score >= 100);
  assert.ok(next.combo > 1);
  assert.equal(next.isLevelCleared, true);
});

test("missing the ball reduces life and locks ball", () => {
  const state = createInitialState({ width: 500, height: 350 });
  state.ballLocked = false;
  state.ball.y = 360;
  state.ball.vy = 200;

  const next = stepGame(state, { dt: 0.016 });
  assert.equal(next.lives, 2);
  assert.equal(next.ballLocked, true);
  assert.equal(next.isGameOver, false);
});

test("advanceLevel increments level and resets clear flag", () => {
  const state = createInitialState();
  state.isLevelCleared = true;

  const next = advanceLevel(state);
  assert.equal(next.level, 2);
  assert.equal(next.isLevelCleared, false);
  assert.ok(next.bricks.length > 0);
  assert.equal(next.ballLocked, true);
});
