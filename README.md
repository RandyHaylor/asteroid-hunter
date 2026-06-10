# Asteroid Hunter

A 3D touch-first space combat prototype: tractor-beam cover mechanics behind destructible asteroids, a spherical 3D radar with last-seen contact tracking, simple Newtonian flight, and staged enemy waves. Built with Three.js + TypeScript + Vite.

## ▶ Play it now

**https://randyhaylor.github.io/asteroid-hunter/**

Works in desktop and mobile browsers.

## Controls

| Input | Touch | Desktop |
|---|---|---|
| Rotate ship | right joystick | WASD / arrow keys |
| Throttle (sets target speed) | left lever | Shift up / Ctrl down |
| Fire lasers / missiles | lower-left / lower-right zones | Space / X |
| Take cover | tap a grid-marked asteroid (within tractor range) | click it |
| Adjust position in cover | joystick slides you around the asteroid | WASD |
| Leave cover | move the throttle, or tap another asteroid | Shift |
| Toggle chase/cockpit camera | VIEW button | C |

Cover grids: **cyan** = full cover available, **yellow** = long-range enemies can still see the cover spot, **red** = short-range enemies can see it. Radar: red dots = visible enemies; fading yellow dots = last-seen positions of enemies that slipped behind asteroids.

## Develop

```
cd game
npm install
npm run dev     # http://localhost:5173
npm test        # vitest unit tests
npm run build   # production build (base path /asteroid-hunter/)
```

Design history: see [asteroid-hunter-initial-design-proposal.md](asteroid-hunter-initial-design-proposal.md) and the consolidated [requirements spec](asteroid-hunter-requirements-spec.md) (decisions D1–D16, requirements R1–R18 — referenced throughout the code comments).

## Redeploy to GitHub Pages

```
cd game
npm run build
cd dist
git init; git add -A; git commit -m "deploy"; git branch -M gh-pages
git push -f git@github.com:RandyHaylor/asteroid-hunter.git gh-pages
cd ..; Remove-Item -Recurse -Force dist/.git
```
