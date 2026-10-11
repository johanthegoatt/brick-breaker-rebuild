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

test("a 2-hit brick loses one hit per contact, not both", () => {
  let state = createInitialState();
  state.ballLocked = false;
  const brick = { id: "t", x: 400, y: 200, width: 82, height: 24, hits: 2, maxHits: 2, points: 100 };
  state.bricks = [brick, { id: "far", x: 10, y: 10, width: 10, height: 10, hits: 1, maxHits: 1, points: 1 }];
  // Ball rising into the brick's underside.
  state.ball = { ...state.ball, x: 440, y: 232, vx: 0, vy: -360 };
  for (let i = 0; i < 10; i += 1) {
    state = stepGame(state, { dt: 1 / 60 });
  }
  const hit = state.bricks.find((b) => b.id === "t");
  assert.ok(hit, "brick should survive one contact");
  assert.equal(hit.hits, 1);
  assert.ok(state.ball.vy > 0, "ball heads back down");
});

test("a fast ball on a long frame still bounces off the paddle", () => {
  let state = createInitialState();
  state.ballLocked = false;
  const paddle = state.paddle;
  state.ball = {
    ...state.ball,
    x: paddle.x + paddle.width / 2,
    y: paddle.y - 30,
    vx: 0,
    vy: 640,
  };
  // 0.1 s at 640 px/s is 64 px: more than the paddle plus the ball in one jump.
  state = stepGame(state, { dt: 0.1 });
  assert.equal(state.lives, 3);
  assert.ok(state.ball.vy < 0);
});
