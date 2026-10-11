// Longest slice of time the ball moves in one go (seconds).
export const MAX_SUBSTEP_SECONDS = 1 / 240;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createBricks(level, width) {
  const columns = 10;
  const rows = 5 + Math.min(2, level - 1);
  const brickWidth = 82;
  const brickHeight = 24;
  const gap = 8;
  const totalWidth = columns * brickWidth + (columns - 1) * gap;
  const offsetX = (width - totalWidth) / 2;
  const offsetY = 74;

  const bricks = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const hits = row >= rows - 2 && level > 1 ? 2 : 1;
      bricks.push({
        id: `${row}-${col}`,
        x: offsetX + col * (brickWidth + gap),
        y: offsetY + row * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        hits,
        maxHits: hits,
        points: 100 + row * 30,
      });
    }
  }

  return bricks;
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
    ball: createBall(width, height),
    ballLocked: true,
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
    ball: { ...state.ball },
    bricks: state.bricks.map((brick) => ({ ...brick })),
  };
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
  state.ballLocked = true;
  state.ball.x = state.paddle.x + state.paddle.width / 2;
  state.ball.y = state.paddle.y - state.ball.radius - 1;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

export function stepGame(
  state,
  {
    dt = 1 / 60,
    moveDirection = 0,
    paddleX,
    launch = false,
  } = {},
) {
  if (state.isGameOver || state.isLevelCleared) {
    return state;
  }

  const next = cloneState(state);

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
    next.ball.x = next.paddle.x + next.paddle.width / 2;
    next.ball.y = next.paddle.y - next.ball.radius - 1;

    if (launch) {
      const launchAngle = Math.PI / 4;
      next.ballLocked = false;
      next.ball.vx = next.ball.speed * Math.cos(launchAngle);
      next.ball.vy = -next.ball.speed * Math.sin(launchAngle);
    }

    return next;
  }

  // Move the ball in fixed small slices so a slow frame (or a fast ball) can
  // not carry it through the paddle or a brick in one jump.
  const substeps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_SECONDS));
  const h = dt / substeps;
  for (let s = 0; s < substeps; s += 1) {
    next.ball.x += next.ball.vx * h;
    next.ball.y += next.ball.vy * h;

    if (next.ball.x - next.ball.radius <= 0) {
      next.ball.x = next.ball.radius;
      next.ball.vx = Math.abs(next.ball.vx);
    }

    if (next.ball.x + next.ball.radius >= next.width) {
      next.ball.x = next.width - next.ball.radius;
      next.ball.vx = -Math.abs(next.ball.vx);
    }

    if (next.ball.y - next.ball.radius <= 0) {
      next.ball.y = next.ball.radius;
      next.ball.vy = Math.abs(next.ball.vy);
    }

    const paddleTop = next.paddle.y;
    if (
      next.ball.vy > 0 &&
      next.ball.y + next.ball.radius >= paddleTop &&
      next.ball.y - next.ball.radius <= paddleTop + next.paddle.height &&
      next.ball.x >= next.paddle.x &&
      next.ball.x <= next.paddle.x + next.paddle.width
    ) {
      const relative = (next.ball.x - (next.paddle.x + next.paddle.width / 2)) / (next.paddle.width / 2);
      const clamped = clamp(relative, -1, 1);
      const speed = Math.min(640, Math.hypot(next.ball.vx, next.ball.vy) * 1.02 + 5);
      const angle = clamped * 1.1;

      next.ball.vx = speed * Math.sin(angle);
      next.ball.vy = -Math.abs(speed * Math.cos(angle));
      next.combo = 1;
    }

    for (let i = 0; i < next.bricks.length; i += 1) {
      const brick = next.bricks[i];
      if (!circleHitsBrick(next.ball, brick)) {
        continue;
      }

      resolveBrickCollision(next.ball, brick);
      brick.hits -= 1;

      if (brick.hits <= 0) {
        next.score += Math.round(brick.points * next.combo);
        next.combo = Math.min(4, Number((next.combo + 0.25).toFixed(2)));
        next.bricks.splice(i, 1);
      }

      break;
    }

    if (next.ball.y - next.ball.radius > next.height) {
      next.lives -= 1;
      next.combo = 1;

      if (next.lives <= 0) {
        next.isGameOver = true;
        return next;
      }

      resetBallOnPaddle(next);
      return next;
    }
    if (next.bricks.length === 0) {
      break;
    }
  }

  if (next.bricks.length === 0) {
    next.isLevelCleared = true;
  }

  return next;
}

export function advanceLevel(state) {
  if (!state.isLevelCleared || state.isGameOver) {
    return state;
  }

  const next = cloneState(state);
  next.level += 1;
  next.ball.speed = Math.min(520, next.ball.speed + 24);
  next.bricks = createBricks(next.level, next.width);
  next.isLevelCleared = false;
  resetBallOnPaddle(next);

  return next;
}
