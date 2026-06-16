# Plan: Grapple / slingshot movement system (replaces the cover mechanic)

## Context
The "take cover behind an asteroid" tractor mechanic is being **replaced** by a momentum-based
grapple/slingshot system as the game's primary movement. New feel: ships always carry forward
momentum (turning is "expensive"); you slingshot around asteroids to change direction fast. This
swaps the movement model, the controls (throttle lever + strafe joystick → a single hold-to-thrust
button), adds tappable asteroid-orbit icons around the radar rim, and gives enemies three escalating
grapple tiers.

Note: there is **no `new-grapple-mechanic-and-changes.md`** in the repo — this plan body is the
source of truth. The mechanic spec lives in the confirmed decisions below plus the existing ledger
`asteroid-hunter-requirements-spec.md` (D1–D53).

**Confirmed decisions (carried + this session):**
- Orbit and ship-facing are **fully independent** — latching/orbiting only moves position/velocity;
  facing stays under radar drag-steer.
- Radar asteroid icons = **DOM icons around the radar rim** by bearing; the sphere center keeps
  drag-to-steer.
- Player rotates the ship via the existing **radar drag-steer**.
- **Phased build, deploy after each phase.**
- Orbit physics model = **kinematic arc** (locked radius, advance along circle at constant speed).
- A **simple start screen** ("ASTEROID HUNTER" title + tagline + basic control instructions) is added.
- Grapple-based auto-avoidance (fuzzy white deflection line) is out of scope.

## Grounded facts from exploration (paths verified)
- `stepShipFlightSimulation` — `game/src/gameSimulation/newtonianShipPhysics.ts:85`; current pipeline:
  rotation → throttle-target velocity → thrust accel (gain 1.5/s, deadband 0.25 m/s) → integrate.
- `ShipFlightControlInput = { pitchInput, yawInput, throttleFraction }` — same file `:17`.
- Reusable, kept as-is: `getShipForwardDirection` (`:56`), `stepShipRotationFromJoystick` (`:61`).
- `ShipFlightStats` — `game/src/shipStats.ts:3`: `shipMassKg, maxThrustNewtons,
  maxTurnRateRadiansPerSecond, maxForwardSpeedMetersPerSecond, enemyTrackTurnRateRadiansPerSecond`.
  Literals built in: `shipStats.ts:13` (player base), the enemy stats in `enemies/enemyAlienShipBehavior.ts`,
  and the test fixture `newtonianShipPhysics.test.ts:11`.
- `updatePlayerMovement` — `main.ts:897`: (1) commanded heading from radar/keyboard `:898`, (2)
  `rotatePlayerShipTowardAimGoal` `:914` (def `:857`), (3a) tractor-cover branch `:917`, (3b) free
  flight `stepShipFlightSimulation(...)` `:979`. Engine exhaust `updatePlayerEngineExhaust(...throttleFraction...)` `:1048`.
- Cover code to delete: dir `game/src/tractorCover/` (coverPositionSolver, tractorBeamPullForce,
  coverQualityEvaluator, coverGridOverlayDisplay, asteroidTapTargeting + `.test.ts`). In `main.ts`:
  state `:318–339`, `engageTractorPullTowardAsteroid` `:343`, `releaseTractorPull` `:363`,
  `adjustCoverHoldPointFromStrafeInput` `:778`, tap-to-cover `pointerdown` `:373`, cover branch `:917`,
  render-sync tractor line + grid recolor `:1053–1086`, cover debug hooks `:392`/`:451`. Camera:
  `setCoverZoomActive` calls `:360`/`:368` (def in `cameraChaseAndCockpit.ts`).
- Radar: `game/src/radar/radarSphereDisplay.ts`; `radarControlZone` created `:76`; contact projection
  `:252–257` (`worldDir − playerPos → applyQuaternion(inverseCommandedOrientation) → /RADAR_DETECTION_RANGE_METERS`,
  clamp to unit sphere); drag-to-steer `:99–124`; styles in `game/src/radar/radarHud.css`.
- `AsteroidBody` (`gameWorldTypes.ts`): `positionMeters`, `currentRadiusMeters`, `sizeClass`, `isDestroyed`, `renderObject`.
- `EnemyShipBehaviorTier = 'dumbPatrol' | 'orbitStrafe' | 'coverHunter'` (`gameWorldTypes.ts:20`);
  behavior in `enemies/enemyAlienShipBehavior.ts`; wave mapping `composeWaveEnemyBehaviorTiers` (`main.ts:488`).
- Debug hooks exist as `(window as unknown as Record<string, unknown>).debugX = ...` (`main.ts:392,411,432,451,472`) — reuse this pattern for new verification hooks.
- Build/test/deploy: `cd game; npx tsc --noEmit; npx vitest run; npm run dev` (vite :5173); deploy via README's gh-pages script.

## Movement model (the core change — player AND enemies)
- **Constant speed.** Velocity magnitude is held at a `cruiseSpeedMetersPerSecond` stat; seed
  `velocity = forward * cruiseSpeed` at spawn. Speed never changes.
- **Thrust steers the velocity vector.** While thrust is held, rotate the *velocity direction* toward
  the *ship facing* (`getShipForwardDirection`) at `thrustTurnRateRadiansPerSecond` (slow). Not held →
  straight line.
- **Facing is independent** of velocity (free radar drag-steer), unchanged from today's rotation path.

```
            BEFORE (throttle)                        AFTER (constant momentum)
  facing ──► forward·throttle = target v      radar drag ──► facing (independent)
  thrust accel toward target v (mass/gain)     thrust held? rotate |v|-vector toward facing
  speed varies 0..maxForwardSpeed              speed fixed = cruiseSpeed; integrate position
```

`ShipFlightStats` change (`shipStats.ts`): rename `maxForwardSpeedMetersPerSecond` →
`cruiseSpeedMetersPerSecond`; add `thrustTurnRateRadiansPerSecond`; keep `maxTurnRateRadiansPerSecond`
and `enemyTrackTurnRateRadiansPerSecond` (both drive facing). The new flight sim no longer reads
`maxThrustNewtons`/`shipMassKg` — grep for other consumers (collisions may use `shipMassKg`); remove a
field from the type only if it has no remaining reader. Update all 3 literal sites + the test fixture.

---

## Phase 1 — Movement model + control swap + remove cover + start screen → deploy

**Physics** (`newtonianShipPhysics.ts`): rewrite `stepShipFlightSimulation` to the constant-speed +
thrust-steers-velocity model; replace `ShipFlightControlInput.throttleFraction` with
`thrustActive: boolean`. Keep `stepShipRotationFromJoystick` / `getShipForwardDirection` untouched.
Rewrite `newtonianShipPhysics.test.ts` to assert: speed constant across steps; thrust rotates velocity
toward facing; no thrust = straight line; facing rotation still works.

**Controls** (`hud/touchFlightControls.ts`): remove throttle lever, strafe joystick,
`readStrafeControlInput`, `setStrafeJoystickVisible`, `setThrottleFraction`, and keyboard throttle/strafe
(IJKL/Shift/Ctrl). Add a **thrust button** widget (hold = thrust) bottom-left relative to the radar;
expose `isThrustActive()`. `readFlightControlInput()` returns keyboard pitch/yaw only. Update the
`TouchFlightControls` type accordingly.

**Remove cover**: delete `game/src/tractorCover/` entirely. In `main.ts` remove all cover state,
the tap-to-cover `pointerdown` handler, the cover branch in `updatePlayerMovement`, render-sync tractor
line + grid recolor, and cover debug hooks (`debugEngageNearestGrabbableAsteroid`, `debugReadTractorState`).
Remove `setCoverZoomActive` calls (and the now-unused camera method in `cameraChaseAndCockpit.ts`).
Also remove `playerShipBaseTractorBeamStats`/`TractorBeamStats` from `shipStats.ts` if unreferenced.

**main.ts wiring**: `updatePlayerMovement` becomes — facing from radar drag-steer (unchanged), then
`stepShipFlightSimulation(state, { pitchInput:0, yawInput:0, thrustActive: thrustButton.isThrustActive() }, stats, dt)`.
Engine exhaust (`updatePlayerEngineExhaust` `:1048`) keyed off thrust-active instead of throttle.

**Start screen**: add an overlay div + CSS shown at boot before gameplay: title **ASTEROID HUNTER**,
a tagline (placeholder: *"Momentum is everything — slingshot the rocks, hunt the swarm."* — easy to edit),
and control instructions (*Hold THRUST to steer your momentum · Drag the radar to aim · Tap an asteroid
icon to slingshot · Fire is automatic*). Dismiss on first tap/Enter → begin Wave 1; this also covers the
existing audio resume-on-first-gesture (`main.ts:283`).

**Verify (deploy + playwright)**: ship drifts at constant speed; holding thrust curves the path toward
facing; radar drag rotates facing independently; no throttle/strafe UI; no cover grids; start screen
shows then dismisses into Wave 1.

## Phase 2 — Radar asteroid-orbit icons + latch/slingshot → deploy

**Radar rim icons** (new `game/src/radar/asteroidOrbitIcons.ts` + CSS, mounted on `radarControlZone`
by `radarSphereDisplay.ts`): each frame, for asteroids within an outer range, place a DOM icon on the
radar **rim** at the asteroid's bearing — reuse the exact contact-projection transform (`radarSphereDisplay.ts:252`),
then snap to the rim (normalize the projected x/y). Color by proximity: yellow→orange→red as it gets
closer/stronger; **black + untappable** when too close; **hidden** when too far. Icons set
`pointer-events:auto`; sphere-center drag-steer is unaffected (icons sit on the rim).

**Latch/orbit interaction** (small `game/src/grappleOrbit/grappleOrbitController.ts` + state in `main.ts`):
tap icon = latch→orbit; tap again = release; tap-and-hold >1s then lift = end-orbit-on-release; while
orbiting, tapping another icon switches target instantly.

**Orbit physics — kinematic arc** (new pure helper `computeOrbitStep` in the grappleOrbit module,
unit-tested): on latch lock `orbitRadius = currentDistance` and the orbit plane (from velocity + radius
vector); each frame advance the ship along the circle at constant `cruiseSpeed`
(angular rate = speed/radius → closer = faster heading change = stronger slingshot); on release keep
the tangential velocity (slingshot exit). **Ship facing/camera untouched** throughout. Add a
`(window as ...).debugLatchNearestAsteroid()` hook (mirrors the removed cover debug hook) for
deterministic verification.

**Verify (deploy + playwright)**: in-range asteroids show rim icons colored by distance; tap latches and
the ship arcs around it (facing stays drag-controlled); release flings tangentially; hold>1s releases on
lift; tapping another switches target.

## Phase 3 — Three enemy grapple tiers → deploy

Enemies adopt the same constant-momentum model. Repurpose the existing three `EnemyShipBehaviorTier`s
(`gameWorldTypes.ts:20`, `enemies/enemyAlienShipBehavior.ts`) into grapple tiers (rename or remap the
three string literals; update `composeWaveEnemyBehaviorTiers` `main.ts:488` to map waves to the new tiers):
- **Tier 1**: steers OK, **no grapple** (straight momentum + turning only).
- **Tier 2**: steers a little + **weak grapple** (gentle asteroid arcs; hard to auto-track during grapple).
- **Tier 3**: **fast + strong grapple, weak turning**.

Parameterize per tier: `turnRate`, `canGrapple`/`grappleStrength`, `cruiseSpeed`. Reuse `computeOrbitStep`
from Phase 2 for enemy grapples. Confirm player auto-aim lead/track (`rotatePlayerShipTowardAimGoal` `:857`,
`enemyTrackTurnRateRadiansPerSecond`) still works against grappling enemies — hard, not impossible, to lock.
Add a per-tier params unit test.

**Verify (deploy + playwright)**: observe the three tiers — one never grapples, one weakly arcs, one fast
with strong arcs; confirm grappling enemies are harder to keep locked.

---

## Cross-cutting
- **Docs/SoT**: log decisions **D54+** in `asteroid-hunter-requirements-spec.md` (follow the
  D51–D53 format: bold change + parenthesized file/stat refs), capturing the grapple-spec instruction and
  the session Q&A. Update the module map + README controls section each phase.
- Each phase ends with `tsc` + `vitest` green, README/spec updated, commit + push, deploy to gh-pages,
  verify live.

## Verification (per phase)
- `cd game && npx tsc --noEmit` clean; `npx vitest run` green (new pure helpers covered: momentum/thrust
  step, orbit step, enemy-tier params).
- Playwright against `npm run dev` (`:5173`); use/extend the `(window as ...).debugX` hooks to force-latch
  / place asteroids and verify orbit + slingshot deterministically.
- Manual on-device feel pass after each deploy (thrust curve rate, orbit tightness, enemy difficulty) —
  all tuning constants, easy to adjust.
