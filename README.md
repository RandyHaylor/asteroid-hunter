# Asteroid Hunter

A 3D touch-first space combat prototype: tractor-beam cover mechanics behind destructible asteroids, a spherical 3D radar with last-seen contact tracking, simple Newtonian flight, staged enemy waves, and a procedural 8-bit techno soundtrack + synth SFX (no audio files — all generated at runtime via Web Audio). Built with Three.js + TypeScript + Vite.

## ▶ Play it now

**https://randyhaylor.github.io/asteroid-hunter/**

Works in desktop and mobile browsers.

## Controls

| Input | Touch | Desktop |
|---|---|---|
| Rotate ship (always, even in cover) | **drag the radar sphere** (right half of the view in landscape, under the view in portrait) | WASD / arrow keys |
| Throttle (sets target speed) | left lever | Shift up / Ctrl down |
| Fire lasers / missiles | **automatic** — always on, fires at any locked, visible enemy | (automatic) |
| Take cover | tap a grid-marked asteroid (within tractor range) | click it |
| Strafe around the asteroid in cover | green joystick beside the throttle | IJKL |
| Leave cover | move the throttle, or tap another asteroid | Shift |
| Toggle chase/cockpit camera | VIEW button | C |
| Mute / unmute sound | SOUND button (top-right) | M |

Cover grids: **cyan** = full cover available, **yellow** = long-range enemies can still see the cover spot, **red** = short-range enemies can see it. Radar: red dots = visible enemies; fading yellow dots = last-seen positions of enemies that slipped behind asteroids.

On-screen aids: a **green ring** shows the auto-aim cone at the closest enemy's range — line an enemy up inside it to lock. Enemies you can't see show as **edge-of-screen markers** (red = live, yellow = last-known before they hid; bigger = closer). Every enemy carries a floating shield/health bar (kept a constant on-screen size at any range, so distant enemies are still easy to spot). The HUD is laid out for phones (safe-area aware, compact controls). Weapons are **always on**: lasers and missiles auto-fire at any locked, visible enemy. Two tiny on-screen cooldown indicators (bottom of the view) show each weapon recharging.

Background music is a looping playlist of three royalty-free Pixabay techno tracks (normalized and level-balanced); synthesized 8-bit SFX play over it. Mute with the SOUND button or `M`. Music: "Surviving" & "Nightmare on Vinyl" by LandOfTheRisen, "Aggressive" by FreeMusicPro — via Pixabay (Pixabay Content License).

The game renders into a **square view** with the controls in the margin around it — under the view in portrait, on either side in landscape. The **radar** is a spherical 3D scope with a horizontal reference disc; enemy dots drop a stem line to the disc, ending in a small **circle on the disc** where they intersect it, so you can read their height at a glance.

Between waves you **choose one of two random power-ups** (speed, tractor range, laser/missile damage, missile speed/fire-rate/tracking, auto-aim tracking speed, ship handling) — upgrades stack across the run.

Auto-aim: whenever an enemy is **locked** (inside the targeting reticle), the ship automatically turns to aim **ahead** of it (lead prediction) — decoupled from the camera, so it keeps tracking the target even while you drag the radar to look elsewhere. A small **red crosshair** marks your true weapon bore (it drifts off the fixed center reticle as the ship aims ahead). Lasers hold fire until the hull has swung within 5° of the firing solution; missiles fire and home. The turn-to-track speed is an upgradeable ship stat.

## Develop

```
cd game
npm install
npm run dev     # http://localhost:5173
npm test        # vitest unit tests
npm run build   # production build (base path /asteroid-hunter/)
```

Design history: see [asteroid-hunter-initial-design-proposal.md](asteroid-hunter-initial-design-proposal.md) and the consolidated [requirements spec](asteroid-hunter-requirements-spec.md) (decisions D1–D53, requirements R1–R18 — referenced throughout the code comments).

## Redeploy to GitHub Pages

```
cd game
npm run build
cd dist
git init; git add -A; git commit -m "deploy"; git branch -M gh-pages
git push -f git@github.com:RandyHaylor/asteroid-hunter.git gh-pages
cd ..; Remove-Item -Recurse -Force dist/.git
```
