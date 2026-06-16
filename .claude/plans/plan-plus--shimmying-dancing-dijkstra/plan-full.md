# Plan: Grapple / slingshot movement system (replaces the cover mechanic)

> Source: refined Ultraplan, teleported to `/media/aikenyon/NVME_Data_Part/claude-proj/asteroidhunter/ultraplan.md`. This is the canonical plan.

## Context
The "take cover behind an asteroid" tractor mechanic is being **replaced** by a momentum-based
grapple/slingshot system as the game's primary movement. New feel: ships always carry forward
momentum (turning is "expensive"); you slingshot around asteroids to change direction fast. This
swaps the movement model, the controls (throttle lever + strafe joystick → a single hold-to-thrust
button), adds tappable asteroid-orbit icons around the radar rim, and gives enemies three escalating
grapple tiers.

**Confirmed decisions:**
- Orbit and ship-facing are **fully independent** — latching/orbiting only moves position/velocity; facing stays under radar drag-steer.
- Radar asteroid icons = **DOM icons around the radar rim** by bearing; the sphere center keeps drag-to-steer.
- Player rotates the ship via the existing **radar drag-steer**.
- **Phased build, deploy after each phase.**
- Orbit physics model = **kinematic arc** (locked radius, advance along circle at constant speed).
- A **simple start screen** (ASTEROID HUNTER title + tagline + basic control instructions) is added.
- Grapple-based auto-avoidance (fuzzy white deflection line) is out of scope.

## Grounded facts (paths verified)
- `stepShipFlightSimulation` — `game/src/gameSimulation/newtonianShipPhysics.ts:85`; current: rotation → throttle-target velocity → thrust accel (gain 1.5/s, deadband 0.25) → integrate.
- `ShipFlightControlInput = { pitchInput, yawInput, throttleFraction }` — same file `:17`. Keep `getShipForwardDirection` (`:56`), `stepShipRotationFromJoystick` (`:61`).
- `ShipFlightStats` — `shipStats.ts:3`; literals at `shipStats.ts:13` (player), enemy stats in `enemies/enemyAlienShipBehavior.ts`, test fixture `newtonianShipPhysics.test.ts:11`.
- `updatePlayerMovement` — `main.ts:897`; `rotatePlayerShipTowardAimGoal` def `:857`; cover branch `:917`; free-flight `stepShipFlightSimulation` `:979`; engine exhaust `:1048`.
- Cover code to delete: dir `game/src/tractorCover/` (+ tests). In `main.ts`: state `:318–339`, `engageTractorPullTowardAsteroid` `:343`, `releaseTractorPull` `:363`, `adjustCoverHoldPointFromStrafeInput` `:778`, tap-to-cover `pointerdown` `:373`, cover branch `:917`, render-sync tractor line + grid recolor `:1053–1086`, cover debug hooks `:392`/`:451`; `setCoverZoomActive` `:360`/`:368` (def `cameraChaseAndCockpit.ts`).
- Radar: `radar/radarSphereDisplay.ts`; `radarControlZone` `:76`; contact projection `:252–257`; drag-to-steer `:99–124`; styles `radar/radarHud.css`.
- `AsteroidBody`: `positionMeters`, `currentRadiusMeters`, `sizeClass`, `isDestroyed`, `renderObject`.
- `EnemyShipBehaviorTier` (`gameWorldTypes.ts:20`); behavior `enemies/enemyAlienShipBehavior.ts`; wave map `composeWaveEnemyBehaviorTiers` (`main.ts:488`).
- Debug hooks: `(window as unknown as Record<string,unknown>).debugX = ...` (`main.ts:392,411,432,451,472`).

## Movement model (player AND enemies)
- **Constant speed**: velocity magnitude held at `cruiseSpeedMetersPerSecond`; seed `velocity = forward * cruiseSpeed` at spawn.
- **Thrust steers velocity**: while held, rotate the velocity direction toward ship facing at `thrustTurnRateRadiansPerSecond`; not held → straight line.
- **Facing independent** (radar drag-steer), unchanged.

`ShipFlightStats` change (`shipStats.ts`): rename `maxForwardSpeedMetersPerSecond` → `cruiseSpeedMetersPerSecond`; add `thrustTurnRateRadiansPerSecond`; keep the two turn-rate fields. New sim drops `maxThrustNewtons`/`shipMassKg` reads — grep for other consumers (collisions may use `shipMassKg`); only remove a field if it has no remaining reader. Update all 3 literal sites + the test fixture.

---

## Phase 1 — Movement model + control swap + remove cover + start screen → deploy
- **Physics** (`newtonianShipPhysics.ts`): rewrite `stepShipFlightSimulation` to constant-speed + thrust-steers-velocity; replace `throttleFraction` with `thrustActive: boolean`. Keep rotation helpers. Rewrite `newtonianShipPhysics.test.ts`: speed constant; thrust rotates velocity toward facing; no thrust = straight; facing rotation still works.
- **Controls** (`hud/touchFlightControls.ts`): remove throttle lever, strafe joystick, `readStrafeControlInput`, `setStrafeJoystickVisible`, `setThrottleFraction`, keyboard throttle/strafe. Add a **hold-to-thrust button** bottom-left of the radar; expose `isThrustActive()`. `readFlightControlInput()` → keyboard pitch/yaw only. Update the `TouchFlightControls` type.
- **Remove cover**: delete `game/src/tractorCover/`; strip all cover state/handlers/branch/render-sync/debug hooks in `main.ts`; remove `setCoverZoomActive` (+ unused camera method); remove `playerShipBaseTractorBeamStats`/`TractorBeamStats` if unreferenced.
- **Wiring**: `updatePlayerMovement` = facing from radar drag-steer, then `stepShipFlightSimulation(state, {pitchInput:0,yawInput:0,thrustActive: thrustButton.isThrustActive()}, stats, dt)`. Engine exhaust keyed off thrust-active.
- **Start screen**: boot overlay div + CSS — title ASTEROID HUNTER, tagline (placeholder, editable), controls (Hold THRUST to steer momentum · Drag radar to aim · Tap asteroid icon to slingshot · Fire is automatic). Dismiss on first tap/Enter → Wave 1; also covers audio resume-on-first-gesture (`main.ts:283`).
- **Verify**: constant-speed drift; thrust curves path toward facing; radar drag rotates facing independently; no throttle/strafe UI; no cover grids; start screen → Wave 1.

## Phase 2 — Radar asteroid-orbit icons + latch/slingshot → deploy
- **Rim icons** (new `radar/asteroidOrbitIcons.ts` + CSS, mounted on `radarControlZone`): per frame, for in-range asteroids, place a DOM icon on the radar **rim** at the asteroid bearing (reuse projection at `radarSphereDisplay.ts:252`, snap to rim). Color yellow→orange→red by closeness; black+untappable too-close; hidden too-far. `pointer-events:auto`; sphere-center drag-steer unaffected.
- **Interaction** (`grappleOrbit/grappleOrbitController.ts` + main.ts state): tap = latch→orbit; tap again = release; tap-and-hold >1s then lift = end-on-release; tapping another switches instantly.
- **Orbit physics — kinematic arc** (pure `computeOrbitStep`, unit-tested): on latch lock `orbitRadius = currentDistance` + orbit plane (velocity + radius vector); advance along the circle at `cruiseSpeed` (angular = speed/radius); on release keep tangential velocity. Facing/camera untouched. Add `debugLatchNearestAsteroid()` hook.
- **Verify**: rim icons by distance; tap arcs the ship (facing still drag-controlled); release flings tangentially; hold>1s releases on lift; tap another switches.

## Phase 3 — Three enemy grapple tiers → deploy
Enemies adopt the constant-momentum model. Repurpose the 3 `EnemyShipBehaviorTier`s + update `composeWaveEnemyBehaviorTiers`:
- **Tier 1**: steers OK, no grapple. **Tier 2**: steers a little + weak grapple. **Tier 3**: fast + strong grapple, weak turning.
Per-tier params: `turnRate`, `canGrapple`/`grappleStrength`, `cruiseSpeed`. Reuse `computeOrbitStep`. Confirm player auto-aim still tracks (hard, not impossible). Per-tier params unit test.
- **Verify**: one never grapples, one weakly arcs, one fast/strong; grappling enemies harder to lock.

---

## Cross-cutting
- Log **D54+** in `asteroid-hunter-requirements-spec.md` (D51–D53 format), capture grapple spec + session Q&A in SoT, update module map + README controls each phase.
- Each phase ends: `tsc` + `vitest` green, docs updated, commit + push master, deploy gh-pages (pre-approved by the `Bash(git push:*)` rule), verify live.

## Verification (per phase)
- `cd game && npx tsc --noEmit` clean; `npx vitest run` green (momentum/thrust step, orbit step, enemy-tier params covered).
- Playwright vs `npm run dev` (:5173); use `(window as ...).debugX` hooks to force-latch / place asteroids.
- Manual on-device feel pass after each deploy (tuning constants).
