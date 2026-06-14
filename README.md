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
| Arm lasers / missiles (auto-fire toggle) | tap the LASERS / MISSILES button | Space / X |
| Take cover | tap a grid-marked asteroid (within tractor range) | click it |
| Strafe around the asteroid in cover | green joystick beside the throttle | IJKL |
| Leave cover | move the throttle, or tap another asteroid | Shift |
| Toggle chase/cockpit camera | VIEW button | C |
| Mute / unmute sound | SOUND button (top-right) | M |

Cover grids: **cyan** = full cover available, **yellow** = long-range enemies can still see the cover spot, **red** = short-range enemies can see it. Radar: red dots = visible enemies; fading yellow dots = last-seen positions of enemies that slipped behind asteroids.

On-screen aids: a **green ring** shows the auto-aim cone at the closest enemy's range — line an enemy up inside it to lock. Enemies you can't see show as **edge-of-screen markers** (red = live, yellow = last-known before they hid; bigger = closer). Every enemy carries a floating shield/health bar (kept a constant on-screen size at any range, so distant enemies are still easy to spot). The HUD is laid out for phones (safe-area aware, compact controls). Weapons are **armed toggles**: tap LASERS / MISSILES (they glow green) and that weapon auto-fires at any locked, visible enemy — no holding.

Background music is a looping playlist of three royalty-free Pixabay techno tracks (normalized and level-balanced); synthesized 8-bit SFX play over it. Mute with the SOUND button or `M`. Music: "Surviving" & "Nightmare on Vinyl" by LandOfTheRisen, "Aggressive" by FreeMusicPro — via Pixabay (Pixabay Content License).

The game renders into a **square view** with the controls in the margin around it — under the view in portrait, on either side in landscape. The corner **radar** is a spherical 3D scope with a horizontal reference disc; enemy dots drop a stem line to the disc so you can read their height.

Between waves you **choose one of two random power-ups** (speed, tractor range, laser/missile damage, missile speed/fire-rate/tracking, auto-aim cone) — upgrades stack across the run.

Aim assist: when you're **not steering**, the ship gently noses toward the locked target (the enemy in the targeting ring). It's a weak nudge driven by an upgradeable ship stat, not autopilot — any rotation input takes back full control.

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
