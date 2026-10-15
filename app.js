import { createInitialState, stepGame, advanceLevel, POWERUPS } from "./src/gameEngine.js";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 600;

const elements = {
  canvas: document.getElementById("gameCanvas"),
  scoreValue: document.getElementById("scoreValue"),
  livesValue: document.getElementById("livesValue"),
  comboValue: document.getElementById("comboValue"),
  levelValue: document.getElementById("levelValue"),
  launchBtn: document.getElementById("launchBtn"),
  resetBtn: document.getElementById("resetBtn"),
  nextLevelBtn: document.getElementById("nextLevelBtn"),
  statusText: document.getElementById("statusText"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayButton: document.getElementById("overlayButton"),
};

const context = elements.canvas.getContext("2d");

const appState = {
  game: createInitialState({ width: GAME_WIDTH, height: GAME_HEIGHT }),
  lastFrameAt: 0,
  keyState: { left: false, right: false },
  mouseX: null,
  launchRequested: false,
  paused: false,
};

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setOverlayMode(mode) {
  if (mode === "level-cleared") {
    elements.overlayTitle.textContent = "Level Cleared";
    elements.overlayButton.textContent = "Go To Next Level";
    elements.overlay.hidden = false;
    return;
  }

  if (mode === "game-over") {
    elements.overlayTitle.textContent = "Game Over";
    elements.overlayButton.textContent = "Restart Run";
    elements.overlay.hidden = false;
    return;
  }

  elements.overlay.hidden = true;
}

function resetRuntimeState() {
  appState.lastFrameAt = 0;
  appState.keyState.left = false;
  appState.keyState.right = false;
  appState.mouseX = null;
  appState.launchRequested = false;
}

function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, "#10263c");
  gradient.addColorStop(1, "#173a57");
  context.fillStyle = gradient;
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function drawPaddle(paddle) {
  context.fillStyle = "#19c38f";
  context.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

const CAPSULE_STYLE = {
  wide: { color: "#19c38f", letter: "W" },
  multi: { color: "#ffc857", letter: "M" },
  slow: { color: "#7dd1ff", letter: "S" },
  life: { color: "#ff5d8f", letter: "+" },
};

function drawCapsules(capsules) {
  context.font = "bold 12px Outfit, sans-serif";
  context.textAlign = "center";
  for (const capsule of capsules) {
    const style = CAPSULE_STYLE[capsule.type];
    const left = capsule.x - capsule.width / 2;
    const top = capsule.y - capsule.height / 2;
    context.fillStyle = style.color;
    context.beginPath();
    context.roundRect(left, top, capsule.width, capsule.height, capsule.height / 2);
    context.fill();
    context.fillStyle = "#0b1a29";
    context.fillText(style.letter, capsule.x, capsule.y + 4);
  }
}

function drawBall(ball, slowed) {
  context.fillStyle = slowed ? "#9fe3ff" : "#ffc857";
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.fill();
}

const BRICK_COLORS = ["#7dd1ff", "#ff8a5b", "#ff5d8f", "#c38bff"];

const calmMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const fx = { sparks: [], trail: [], flash: 0 };

function sparkBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    fx.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life: 0.5 + Math.random() * 0.3, age: 0, color });
  }
  // Oldest sparks go first if a combo chain gets busy.
  if (fx.sparks.length > 360) fx.sparks.splice(0, fx.sparks.length - 360);
}

function reactTo(events) {
  for (const event of events) {
    if (event.type === "break") sparkBurst(event.x, event.y, BRICK_COLORS[Math.min(event.maxHits, BRICK_COLORS.length) - 1], 16);
    if (event.type === "hit") sparkBurst(event.x, event.y, "#ffffff", 5);
    if (event.type === "steel") sparkBurst(event.x, event.y, "#c9d3df", 4);
    if (event.type === "lost") fx.flash = 0.35;
  }
}

function stepFx(dt) {
  fx.flash = Math.max(0, fx.flash - dt);
  for (const spark of fx.sparks) {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 420 * dt;
  }
  fx.sparks = fx.sparks.filter((spark) => spark.age < spark.life);
  if (!calmMotion.matches && !appState.game.ballLocked) {
    for (const ball of appState.game.balls) fx.trail.push({ x: ball.x, y: ball.y, r: ball.radius, age: 0 });
  }
  for (const dot of fx.trail) dot.age += dt;
  fx.trail = fx.trail.filter((dot) => dot.age < 0.12);
}

function drawFx() {
  for (const dot of fx.trail) {
    context.fillStyle = `rgba(255, 200, 87, ${0.35 * (1 - dot.age / 0.12)})`;
    context.beginPath();
    context.arc(dot.x, dot.y, dot.r * (1 - dot.age / 0.24), 0, Math.PI * 2);
    context.fill();
  }
  for (const spark of fx.sparks) {
    context.globalAlpha = 1 - spark.age / spark.life;
    context.fillStyle = spark.color;
    context.fillRect(spark.x - 2, spark.y - 2, 4, 4);
  }
  context.globalAlpha = 1;
  if (fx.flash > 0) {
    context.fillStyle = `rgba(255, 70, 90, ${fx.flash * 0.6})`;
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

function drawBricks(bricks) {
  for (const brick of bricks) {
    context.fillStyle = brick.steel ? "#8a97a8" : BRICK_COLORS[Math.min(brick.hits, BRICK_COLORS.length) - 1];
    context.fillRect(brick.x, brick.y, brick.width, brick.height);

    if (brick.steel) {
      context.strokeStyle = "rgba(255, 255, 255, 0.45)";
      context.lineWidth = 2;
      context.strokeRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
    } else if (brick.maxHits > 1) {
      context.fillStyle = "rgba(0, 0, 0, 0.35)";
      context.font = "12px Outfit";
      context.textAlign = "center";
      context.fillText(String(brick.hits), brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
    }
  }
}

function drawHud(game) {
  elements.scoreValue.textContent = String(game.score);
  elements.livesValue.textContent = String(game.lives);
  elements.comboValue.textContent = `x${game.combo.toFixed(2)}`;
  elements.levelValue.textContent = String(game.level);

  elements.nextLevelBtn.disabled = !game.isLevelCleared;

  if (game.isLevelCleared) {
    setOverlayMode("level-cleared");
  } else if (game.isGameOver) {
    setOverlayMode("game-over");
  } else {
    setOverlayMode("none");
  }
}

function draw() {
  drawBackground();
  drawBricks(appState.game.bricks);
  drawPaddle(appState.game.paddle);
  drawFx();
  drawCapsules(appState.game.capsules);
  for (const ball of appState.game.balls) drawBall(ball, appState.game.effects.slowMs > 0);
  drawHud(appState.game);
}

function computeMoveDirection() {
  return (appState.keyState.right ? 1 : 0) - (appState.keyState.left ? 1 : 0);
}

function animate(timestamp) {
  if (!appState.lastFrameAt) {
    appState.lastFrameAt = timestamp;
  }

  const dt = Math.min((timestamp - appState.lastFrameAt) / 1000, 0.033);
  appState.lastFrameAt = timestamp;

  if (appState.paused) {
    requestAnimationFrame(animate);
    return;
  }

  appState.game = stepGame(appState.game, {
    dt,
    moveDirection: computeMoveDirection(),
    paddleX: appState.mouseX,
    launch: appState.launchRequested,
  });

  appState.launchRequested = false;
  for (const event of appState.game.events) {
    if (event.type === "powerup") setStatus(`${POWERUPS[event.powerup].label}!`);
  }
  reactTo(appState.game.events);
  stepFx(dt);
  draw();

  requestAnimationFrame(animate);
}

function requestLaunch() {
  if (appState.game.isGameOver || appState.game.isLevelCleared) {
    return;
  }

  appState.launchRequested = true;
  setStatus("Ball launched. Keep the combo alive.");
}

function resetRun() {
  appState.game = createInitialState({ width: GAME_WIDTH, height: GAME_HEIGHT });
  resetRuntimeState();
  setStatus("New run started. Break every brick to clear the level.");
  draw();
}

function goToNextLevel() {
  if (!appState.game.isLevelCleared) {
    return;
  }

  appState.game = advanceLevel(appState.game);
  appState.launchRequested = false;
  appState.lastFrameAt = 0;
  setStatus(`Level ${appState.game.level} ready. Launch when ready.`);
  draw();
}

elements.launchBtn.addEventListener("click", requestLaunch);
elements.resetBtn.addEventListener("click", resetRun);
elements.nextLevelBtn.addEventListener("click", goToNextLevel);

elements.overlayButton.addEventListener("click", () => {
  if (appState.game.isGameOver) {
    resetRun();
    return;
  }

  if (appState.game.isLevelCleared) {
    goToNextLevel();
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    event.preventDefault();
    appState.keyState.left = true;
  }

  if (key === "arrowright" || key === "d") {
    event.preventDefault();
    appState.keyState.right = true;
  }

  if (key === " " || key === "enter") {
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (appState.paused) setPaused(false);
    requestLaunch();
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    appState.keyState.left = false;
  }

  if (key === "arrowright" || key === "d") {
    appState.keyState.right = false;
  }
});

function pointerToGameX(event) {
  const bounds = elements.canvas.getBoundingClientRect();
  return ((event.clientX - bounds.left) / bounds.width) * GAME_WIDTH;
}

// Pointer events cover mouse, pen and touch, so the paddle follows a finger
// on a phone too. touch-action: none on the canvas keeps the page still.
elements.canvas.addEventListener("pointermove", (event) => {
  appState.mouseX = pointerToGameX(event);
});

elements.canvas.addEventListener("pointerdown", (event) => {
  appState.mouseX = pointerToGameX(event);
  if (event.pointerType !== "mouse") {
    elements.canvas.setPointerCapture(event.pointerId);
  }
  // Tap or click the board to launch.
  if (appState.game.ballLocked) {
    requestLaunch();
  }
});

elements.canvas.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") {
    appState.mouseX = null;
  }
});

function setPaused(paused) {
  if (appState.game.isGameOver || appState.game.isLevelCleared) return;
  appState.paused = paused;
  appState.lastFrameAt = 0;
  appState.keyState.left = false;
  appState.keyState.right = false;
  setStatus(paused ? "Paused. Press P or come back to the tab to carry on." : "Back in play.");
}

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "p") {
    setPaused(!appState.paused);
  }
});

// A hidden tab or a window that lost focus pauses the ball, so a
// notification does not cost a life.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPaused(true);
});
window.addEventListener("blur", () => {
  if (!appState.game.ballLocked) setPaused(true);
});
window.addEventListener("focus", () => {
  if (appState.paused && !document.hidden) setPaused(false);
});

draw();
requestAnimationFrame(animate);
