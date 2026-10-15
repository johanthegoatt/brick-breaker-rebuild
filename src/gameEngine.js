// Longest slice of time the ball moves in one go (seconds).
export const MAX_SUBSTEP_SECONDS = 1 / 240;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// One row per string, ten columns. Digits are hits to break, S is steel
// (never breaks, never counts toward clearing), dots are empty.
export const LAYOUTS = [
  [
    "1111111111",
    "1111111111",
    "1111111111",
    "1111111111",
    "1111111111",
  ],
  [
    "....11....",
    "...1111...",
    "..111111..",
    ".11111111.",
    "1111111111",
    "2222222222",
  ],
  [
    "1.1.1.1.1.",
    ".2.2.2.2.2",
    "1.1.1.1.1.",
    ".2.2.2.2.2",
    "1.1.1.1.1.",
    "S...SS...S",
  ],
  [
    "....22....",
    "...2112...",
    "..211112..",
    ".S211112S.",
    "..211112..",
    "...2112...",
    "....22....",
  ],
  [
    "SS333333SS",
    "S21111112S",
    "S21....12S",
    "S21111112S",
    "SS2....2SS",
  ],
];

function createBricks(level, width) {
  const columns = 10;
  const brickWidth = 82;
  const brickHeight = 24;
  const gap = 8;
  const totalWidth = columns * brickWidth + (columns - 1) * gap;
  const offsetX = (width - totalWidth) / 2;
  const offsetY = 74;
  const layout = LAYOUTS[(level - 1) % LAYOUTS.length];
  // Each time the layouts come round again every brick takes one more hit.
  const loop = Math.floor((level - 1) / LAYOUTS.length);

  const bricks = [];
  layout.forEach((rowText, row) => {
    [...rowText].forEach((cell, col) => {
      if (cell === ".") return;
      const steel = cell === "S";
      const hits = steel ? 1 : Math.min(4, Number(cell) + loop);
      bricks.push({
        id: `${row}-${col}`,
        x: offsetX + col * (brickWidth + gap),
        y: offsetY + row * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        hits,
        maxHits: hits,
        steel,
        points: (100 + row * 30) * hits,
      });
    });
  });

  return bricks;
}

export function breakableCount(bricks) {
  return bricks.filter((brick) => !brick.steel).length;
}

function createBall(width, height, speed = 360) {
  return {
    x: width / 2,
    y: height - 60,
    radius: 8,
    vx: 0,
    vy: 0,
    speed,
  };
}

export function createInitialState({ width = 960, height = 600 } = {}) {
  return {
    width,
    height,
    paddle: {
      x: width / 2 - 60,
      y: height - 28,
      width: 120,
      height: 14,
      speed: 620,
    },
    balls: [createBall(width, height)],
    ballLocked: true,
    capsules: [],
    effects: { wideMs: 0, slowMs: 0 },
    events: [],
    lives: 3,
    score: 0,
    combo: 1,
    level: 1,
    bricks: createBricks(1, width),
    isLevelCleared: false,
    isGameOver: false,
  };
}

function cloneState(state) {
  return {
    ...state,
    paddle: { ...state.paddle },
    balls: state.balls.map((ball) => ({ ...ball })),
    bricks: state.bricks.map((brick) => ({ ...brick })),
    capsules: state.capsules.map((capsule) => ({ ...capsule })),
    effects: { ...state.effects },
    events: [],
  };
}

// Power-ups drop from broken bricks and are caught with the paddle.
export const POWERUPS = {
  wide: { label: "Wide paddle", weight: 4 },
  multi: { label: "Multi-ball", weight: 3 },
  slow: { label: "Slow ball", weight: 3 },
  life: { label: "Extra life", weight: 1 },
};
export const DROP_CHANCE = 0.16;
const WIDE_MS = 12_000;
const SLOW_MS = 9_000;
const BASE_PADDLE_WIDTH = 120;
const WIDE_PADDLE_WIDTH = 180;

function pickPowerup(random) {
  const entries = Object.entries(POWERUPS);
  const total = entries.reduce((sum, [, spec]) => sum + spec.weight, 0);
  let roll = random() * total;
  for (const [type, spec] of entries) {
    roll -= spec.weight;
    if (roll < 0) return type;
  }
  return entries[0][0];
}

function applyPowerup(state, type) {
  if (type === "wide") state.effects.wideMs = WIDE_MS;
  if (type === "slow") state.effects.slowMs = SLOW_MS;
  if (type === "life") state.lives = Math.min(9, state.lives + 1);
  if (type === "multi") {
    const spawned = [];
    for (const ball of state.balls) {
      for (const turn of [-0.45, 0.45]) {
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        spawned.push({ ...ball, vx: ball.vx * cos - ball.vy * sin, vy: ball.vx * sin + ball.vy * cos });
      }
    }
    // Cap so a lucky streak does not turn into hundreds of balls.
    state.balls = state.balls.concat(spawned).slice(0, 12);
  }
  state.events.push({ type: "powerup", powerup: type });
}

function circleHitsBrick(ball, brick) {
  const closestX = clamp(ball.x, brick.x, brick.x + brick.width);
  const closestY = clamp(ball.y, brick.y, brick.y + brick.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;

  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

// Bounce off the side with the smallest overlap, push the ball back out of
// the brick and point the velocity away from it. Without the push-out a ball
// still overlapping a 2-hit brick on the next frame flipped again and spent
// both hits in one contact.
function resolveBrickCollision(ball, brick) {
  const overlapLeft = ball.x + ball.radius - brick.x;
  const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
  const overlapTop = ball.y + ball.radius - brick.y;
  const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);

  const smallest = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  if (smallest === overlapLeft) {
    ball.x = brick.x - ball.radius;
    ball.vx = -Math.abs(ball.vx);
  } else if (smallest === overlapRight) {
    ball.x = brick.x + brick.width + ball.radius;
    ball.vx = Math.abs(ball.vx);
  } else if (smallest === overlapTop) {
    ball.y = brick.y - ball.radius;
    ball.vy = -Math.abs(ball.vy);
  } else {
    ball.y = brick.y + brick.height + ball.radius;
    ball.vy = Math.abs(ball.vy);
  }
}

function resetBallOnPaddle(state) {
  const speed = state.balls[0]?.speed ?? 360;
  state.ballLocked = true;
  state.balls = [createBall(state.width, state.height, speed)];
  state.capsules = [];
  state.effects = { wideMs: 0, slowMs: 0 };
  state.paddle.width = BASE_PADDLE_WIDTH;
  const ball = state.balls[0];
  ball.x = state.paddle.x + state.paddle.width / 2;
  ball.y = state.paddle.y - ball.radius - 1;
}

export function stepGame(
  state,
  {
    dt = 1 / 60,
    moveDirection = 0,
    paddleX,
    launch = false,
    random = Math.random,
  } = {},
) {
  if (state.isGameOver || state.isLevelCleared) {
    return state;
  }

  const next = cloneState(state);
  const ms = dt * 1000;
  next.effects.wideMs = Math.max(0, next.effects.wideMs - ms);
  next.effects.slowMs = Math.max(0, next.effects.slowMs - ms);

  fitPaddleWidth(next);

  if (Number.isFinite(paddleX)) {
    next.paddle.x = clamp(
      paddleX - next.paddle.width / 2,
      0,
      next.width - next.paddle.width,
    );
  } else {
    next.paddle.x = clamp(
      next.paddle.x + moveDirection * next.paddle.speed * dt,
      0,
      next.width - next.paddle.width,
    );
  }

  if (next.ballLocked) {
    const ball = next.balls[0];
    ball.x = next.paddle.x + next.paddle.width / 2;
    ball.y = next.paddle.y - ball.radius - 1;

    if (launch) {
      const launchAngle = Math.PI / 4;
      next.ballLocked = false;
      ball.vx = ball.speed * Math.cos(launchAngle);
      ball.vy = -ball.speed * Math.sin(launchAngle);
      next.events.push({ type: "launch" });
    }

    return next;
  }

  stepCapsules(next, dt);
  fitPaddleWidth(next);

  // Slow ball scales time for the balls only; their speed stays as it was.
  const ballDt = next.effects.slowMs > 0 ? dt * 0.65 : dt;
  // Move the ball in fixed small slices so a slow frame (or a fast ball) can
  // not carry it through the paddle or a brick in one jump.
  const substeps = Math.max(1, Math.ceil(ballDt / MAX_SUBSTEP_SECONDS));
  const h = ballDt / substeps;
  for (let s = 0; s < substeps; s += 1) {
    for (const ball of next.balls) {
      stepBall(next, ball, h, random);
    }
    next.balls = next.balls.filter((ball) => ball.y - ball.radius <= next.height);

    if (next.balls.length === 0) {
      next.lives -= 1;
      next.combo = 1;
      next.events.push({ type: "lost" });

      if (next.lives <= 0) {
        next.isGameOver = true;
        return next;
      }

      resetBallOnPaddle(next);
      return next;
    }
    if (breakableCount(next.bricks) === 0) {
      break;
    }
  }

  if (breakableCount(next.bricks) === 0) {
    next.isLevelCleared = true;
    next.events.push({ type: "cleared" });
  }

  return next;
}

// Grow or shrink around the paddle's centre so it does not jump sideways.
function fitPaddleWidth(state) {
  const targetWidth = state.effects.wideMs > 0 ? WIDE_PADDLE_WIDTH : BASE_PADDLE_WIDTH;
  if (state.paddle.width === targetWidth) return;
  state.paddle.x = clamp(state.paddle.x + (state.paddle.width - targetWidth) / 2, 0, state.width - targetWidth);
  state.paddle.width = targetWidth;
}

function stepCapsules(state, dt) {
  const paddle = state.paddle;
  const kept = [];
  for (const capsule of state.capsules) {
    capsule.y += capsule.vy * dt;
    const caught =
      capsule.y + capsule.height / 2 >= paddle.y &&
      capsule.y - capsule.height / 2 <= paddle.y + paddle.height &&
      capsule.x + capsule.width / 2 >= paddle.x &&
      capsule.x - capsule.width / 2 <= paddle.x + paddle.width;
    if (caught) {
      applyPowerup(state, capsule.type);
    } else if (capsule.y - capsule.height / 2 < state.height) {
      kept.push(capsule);
    }
  }
  state.capsules = kept;
}

function stepBall(state, ball, h, random) {
  ball.x += ball.vx * h;
  ball.y += ball.vy * h;

  if (ball.x - ball.radius <= 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
    state.events.push({ type: "wall" });
  }

  if (ball.x + ball.radius >= state.width) {
    ball.x = state.width - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    state.events.push({ type: "wall" });
  }

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    state.events.push({ type: "wall" });
  }

  const paddle = state.paddle;
  if (
    ball.vy > 0 &&
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width
  ) {
    const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const clamped = clamp(relative, -1, 1);
    const speed = Math.min(640, Math.hypot(ball.vx, ball.vy) * 1.02 + 5);
    const angle = clamped * 1.1;

    ball.vx = speed * Math.sin(angle);
    ball.vy = -Math.abs(speed * Math.cos(angle));
    state.combo = 1;
    state.events.push({ type: "paddle" });
  }

  for (let i = 0; i < state.bricks.length; i += 1) {
    const brick = state.bricks[i];
    if (!circleHitsBrick(ball, brick)) {
      continue;
    }

    resolveBrickCollision(ball, brick);
    if (brick.steel) {
      state.events.push({ type: "steel", x: ball.x, y: ball.y });
      break;
    }
    brick.hits -= 1;

    if (brick.hits <= 0) {
      state.score += Math.round(brick.points * state.combo);
      state.combo = Math.min(4, Number((state.combo + 0.25).toFixed(2)));
      state.bricks.splice(i, 1);
      state.events.push({ type: "break", x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, maxHits: brick.maxHits });
      if (random() < DROP_CHANCE) {
        state.capsules.push({
          type: pickPowerup(random),
          x: brick.x + brick.width / 2,
          y: brick.y + brick.height / 2,
          width: 34,
          height: 16,
          vy: 150,
        });
      }
    } else {
      state.events.push({ type: "hit", x: ball.x, y: ball.y });
    }

    break;
  }
}

export function advanceLevel(state) {
  if (!state.isLevelCleared || state.isGameOver) {
    return state;
  }

  const next = cloneState(state);
  next.level += 1;
  next.balls = [{ ...next.balls[0], speed: Math.min(520, (next.balls[0]?.speed ?? 360) + 24) }];
  next.bricks = createBricks(next.level, next.width);
  next.isLevelCleared = false;
  resetBallOnPaddle(next);

  return next;
}
