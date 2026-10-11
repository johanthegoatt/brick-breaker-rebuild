# Brick Breaker Rebuild

## Description
Brick Breaker Rebuild is a modernized browser remake of the arcade classic with combo scoring, tougher bricks, and progressive levels.

## Features
- Canvas-rendered brick breaker gameplay
- Keyboard, mouse and touch paddle control (pointer events); tap the board to launch
- Pauses itself when the tab is hidden or the window loses focus, P to pause by hand
- Combo multiplier scoring loop
- Multi-hit bricks on higher levels
- Life system, game over flow, and level clear state
- Hardened restart flow + overlay visibility contract to prevent sticky end states
- Next-level progression with increasing ball speed
- Ball moves in 1/240 s slices and is pushed out of a brick on contact, so multi-hit bricks take one hit per bounce
- Unit-tested game engine for collisions and progression
- Static Vercel-ready deployment config

## Run
```bash
cd brick-breaker-rebuild
npm run dev
```
Open `http://127.0.0.1:8103/brick-breaker-rebuild/index.html`.

## Test
```bash
cd brick-breaker-rebuild
npm test
```

## Deploy (Vercel)
```bash
cd brick-breaker-rebuild
npx vercel --prod
```

## Inspiration Repos
- https://github.com/end3r/Gamedev-Canvas-workshop
- https://gafferongames.com/post/fix_your_timestep/
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- https://github.com/llop/classic-tetris-js
- https://github.com/collidingScopes/manual-brick-breaker

## Project Structure
```text
brick-breaker-rebuild/
  index.html
  styles.css
  app.js
  src/
    gameEngine.js
  tests/
    gameEngine.test.js
  package.json
  vercel.json
  README.md
```
