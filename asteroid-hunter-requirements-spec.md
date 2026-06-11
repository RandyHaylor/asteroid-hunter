# Asteroid Hunter — Consolidated Requirements & Architecture Spec

Source: `asteroid-hunter-initial-design-proposal.md` + requirements interview 2026-06-10.

## Confirmed decisions (from interview)

| # | Decision |
|---|----------|
| D1 | Tech stack: **Three.js web app** (Vite + TypeScript), touch-first, runs in desktop/mobile browser |
| D2 | Game loop: **staged waves**; each wave must be fully cleared (all enemies eliminated, no time limit) to advance |
| D3 | v1 scope: flight + tractor cover, weapons + destructibles, 3D spherical radar. **Upgrades deferred** (stats still data-driven so upgrades plug in later) |
| D4 | Single-player. **No friendlies in v1**; radar contact model supports a friendly type for later |
| D5 | Locomotion: **free flight** — on-screen joystick rotates the ship, a **fixed movable throttle lever** (plane/boat style) sets speed, plus tap-asteroid-to-cover / tap-to-switch-cover |
| D6 | Aiming: **auto-aim within a 10° nose cone** (cone angle expandable later); the targeted closest enemy is visually highlighted |
| D7 | Player damage: **hull HP + regenerating shield** (shield regens when not under fire; hull damage persists for the wave; death = restart wave) |
| D8 | Enemy AI mix by progression: early waves **dumb patrol**, later waves add **orbit-and-strafe**, then **cover-using hunters** |
| D9 | Camera: **third-person chase default, cockpit view toggleable** |
| D10 | Play area: **bounded sphere with soft edge** (gentle push-back at boundary), procedurally scattered asteroids |
| D11 | Enemy weapons: **lasers + missiles**; enemy fire **chips/deforms asteroids** (cover degrades, forcing relocation) |
| D12 | Throttle physics: **throttle = target speed**; ship applies thrust (limited by acceleration stat) to reach/hold it; inertia still felt in turns |
| D13 | Lighting: **single light source** — a nearby sun providing hard directional light (no ambient fill); emissive materials (engine glows, lasers, sun disk) are self-lit |
| D14 | Cover hold: the beam pulls the ship onto a **hold shell** around the asteroid (never through it) and holds it there; tapping zeroes the throttle; **joystick slides position around the shell**; escape = move throttle or tap another asteroid; held ship faces its asteroid |
| D15 | Turn feel: joystick turn rates **ease in** (~0.17 s time constant) instead of snapping to max; chase camera **up follows the ship's banked up axis** so controls never invert upside down |
| D16 | Tractor grab range: asteroids only tappable within **350 m** (stat-driven; later raised by upgrades, reduced by ship damage); cover grids only show on in-range asteroids |
| D17 | Lock = **lead prediction**: locked shots aim at the intercept point computed from the weapon's projectile speed (generic solver — upgrades changing speed change the lead); player missiles also get **weak homing** toward the lock, turn rate is a missile stat (`homingTurnRateRadiansPerSecond`, base 0.7 rad/s) |
| D18 | Cover UX: chase camera **zooms out ~2.6×** while tractored; **no auto-facing** — the right joystick rotates the ship at all times; a **strafe joystick appears beside the throttle** while on an asteroid (IJKL on keyboard) and slides the ship around the shell; auto re-solve of the cover point only runs while enemies threaten the asteroid (so rotating never drags the parked ship) |
| D19 | Tractor grab range extended 50% (350 → **525 m**); asteroid field packed tighter (scatter radius 0.9 → 0.62 of play radius, ~3× denser); **thrust plume**: fixed red diamond out the ship's tail, size scales with throttle, only animation is a red↔yellow sine color fade |
| D20 | Cover strafe = **latitude/longitude** on the asteroid sphere: pole axis is the ship's current up; stick up/down climbs/descends latitude (clamped ~6° short of the poles, never flips); stick left/right travels around the current latitude line. Replaces the compounding two-axis rotations that caused gimbal drift |
| D21 | Enemies get a **shield pool** (40) over hull (60), shield-first like the player; once hit, **blue shield + red hull bars** float above the enemy, billboarded to the player camera. Jitter buffer: thrust **deadband** (engines coast under 0.25 m/s velocity error) + light visual smoothing of the ship mesh (~25/s stiffness) |
| D23 | **Procedural 8-bit techno audio** (lifts A2's audio deferral). All sound is synthesized at runtime via the Web Audio API — **no asset files** (A1): a looping ~128 BPM chiptune (square/pulse bass + lead, sine kick, noise hats/snare, four-on-the-floor) and synth SFX (laser, missile, enemy hit, explosion, player hit, wave-start/cleared/destroyed stings). Browser autoplay policy: the AudioContext stays suspended until the **first user gesture**, then resumes + starts the loop. A **SOUND on/off** button (top-right, `M` key) toggles a master-gain mute. Pure note/timing/pattern math is unit-tested |
| D22 | **Weak idle aim-assist**: when the player is *not actively steering* (rotation input under a small deadband), the ship gently turns toward the currently locked target. Driven by a new player flight stat `aimAssistMaxTurnRateRadiansPerSecond` (base 0.5, ~1/3 of manual turn rate; upgradeable, 0 disables). Implemented as proportional pitch/yaw inputs in the ship's local frame, fed through the existing eased rotation step and clamped to the assist rate. The lock only exists inside the 10° nose cone (D6), so the assist only fine-tunes a near-aligned shot. Applies in **both free flight and cover** |
| D24 | Enemy shield/hull bars now show over **every live enemy**, not just damaged ones (drops D21's "after first hit" gate) — they double as always-on spot markers that make distant enemies easier to find |
| D25 | Ship silhouette readability: **longer slimmer nose cone** (height 4.2 → 7.0) so facing is obvious, and **swept delta wings that flare outward toward the tail** (flat per-side triangles) replacing the old square box wing |
| D26 | Third-person chase camera raised to a **slight top-down angle** (local offset y 3.5 → 7.5) so you see the ship's planform instead of sitting on its tail |
| D27 | Player condition bars **tucked against the very top** as one wide strip — cyan SHIELD on the left (drains left), amber HULL on the right (drains right) — inside the iPhone safe area |
| D28 | **Off-screen enemy edge markers**: enemies not currently on screen get a marker pinned to the screen rim in their bearing. Driven by radar readings — RED for a live (visible) contact, YELLOW for a last-seen (obscured) contact; marker **size scales with proximity** (closer = bigger) |
| D29 | **Green targeting-cone ring**: the circle where the 10° auto-aim cone (D6) intersects the plane through the **closest enemy** (a flat annulus centered on the nose axis at that enemy's depth, radius = depth·tan(coneHalfAngle)). Lining an enemy up inside the ring = inside the lock cone. Hidden when no enemy is ahead |
| D30 | **Procedural colored-nebula skybox** (no asset files, A1): a seeded canvas equirectangular texture of exaggerated colored clouds + stars set as `scene.background`, lifting the formerly near-black void. Plus a **weak hemisphere fill light** to lift the dark/shadow side (a deliberate softening of D13's strict single-light rule, at the user's request to lighten the scene) |
| D31 | **Faux sun lens flare**: a hazy yellow ring on the sun's projected screen position plus a fainter ghost ring mirrored across screen center, so it slides like a real lens flare. DOM overlay, hidden when the sun is behind the camera or off screen |
| D32 | **Compact iPhone-oriented HUD layout**: replaced the huge lower-third fire zones with two small fixed buttons low-center (lasers left / missiles right), shrank the joysticks/throttle, pinned everything inside `env(safe-area-inset-*)` (added `viewport-fit=cover`), keeping touch targets ≥ Apple's 44pt minimum |

## Requirements from the design doc

### Rendering & physics
- R1: Fully rendered 3D with lighting, but very basic/simple visuals
- R2: Player ship vs alien ships moving around an asteroid field
- R3: Simple but realistic acceleration physics (mass, thrust, momentum)
- R10: Medium/small asteroids physically react to tractor grapple forces and ship acceleration

### Tractor beam / cover
- R4: Tap a large asteroid → tractor beam pulls the ship behind it for stealth/safety
- R5: While in cover, tap another asteroid → quick transition to the new cover
- R6: Only large asteroids are grabbable/cover-eligible
- R7: Cover position defaults to best cover for the player's facing direction; otherwise solved from in-range enemies' average position, weighted/clamped to guarantee hiding from the closest enemies first
- R8: Tappable asteroids show a wire-mesh grid overlay — **red** = full cover impossible vs in-range enemies; **yellow** = cover impossible vs in-sight/long-range enemies
- R9: Lasers are short range; missiles are long range (travel time, no hard distance limit)

### Weapons
- R11: Lower third of screen = fire zones; left button = lasers, right button = missiles

### Destructibility
- R12: Asteroids shrink/deform under laser/missile fire, losing chunks (destructible-terrain style) with simple particle effects

### Radar
- R13: Spherical 3D radar showing nearby contacts; sphere rotates with player rotation
- R14: Enemy obscured by an asteroid → its red dot becomes a fading yellow "last seen here" dot
- R15: Radar tracks a per-contact signature; if the enemy is re-detected, its stale yellow dot is removed
- R16: HUD shows "recent active enemies: n"; radar outline blinks red while unresolved enemies exist

### Upgrades (deferred, design for it)
- R17: Ship upgrades (thrust, tractor beam power) affect acceleration and turning speed
- R18: Weapon upgrades affect fire rate, explosion radius, laser count and spread, etc.

## Stated assumptions (correct me if wrong)
- A1: Art = procedural low-poly geometry, flat/simple materials, no external asset files
- A2: ~~Audio deferred from v1~~ — superseded by D23 (procedural Web Audio music + SFX, no asset files)
- A3: Desktop input parity for dev/testing: mouse drag = joystick, click = tap, on-screen throttle draggable by mouse, keyboard fallback (WASD rotate, Shift/Ctrl throttle, Space/X fire)
- A4: No save/persistence in v1 (no upgrades yet)
- A5: Destructible asteroids implemented as chunk-removal + radius shrink (not true CSG mesh carving) — matches "loses chunks" at prototype cost
- A6: Target 60 fps on desktop browser; mobile performance tuned later

## Architecture (module map)

```
src/
  main.ts                          — bootstrap, renderer, fixed-timestep game loop
  gameSimulation/
    gameWorld.ts                   — entity collections, spawn/despawn, wave state
    newtonianShipPhysics.ts        — thrust/mass/rotation integration (ships, reactive asteroids)
    boundedPlayAreaSoftEdge.ts     — soft boundary push-back force
  tractorCover/
    coverPositionSolver.ts         — hide-point math from facing dir / weighted enemy set (R7) [unit-tested]
    tractorBeamPullForce.ts        — PD-controller pull to solved cover point (R4, R5)
    coverQualityEvaluator.ts       — LOS checks → grid color red/yellow/normal (R8)
  asteroids/
    asteroidFieldSpawner.ts        — procedural field in bounded sphere, size classes (D10)
    asteroidDestructibleBody.ts    — HP, chunk loss, shrink, damage particles (R12)
  weapons/
    noseConeAutoAim.ts             — 10° cone target selection + highlight (D6) [unit-tested]
    idleAimAssistTowardTarget.ts   — weak turn-toward-lock when not steering (D22) [unit-tested]
    laserFire.ts / missileFire.ts  — short-range bolts / slow AOE projectiles (R9)
  enemies/
    enemyAlienShipBehavior.ts      — patrol / orbit-strafe / cover-hunter states (D8)
  radar/
    radarSignatureTracker.ts       — contact signatures, last-seen fade, active count (R13–R16) [unit-tested]
    radarSphereDisplay.ts          — HUD sphere rendering, rotates with ship
  player/
    playerShipCondition.ts         — hull HP + regen shield, death/restart (D7)
  hud/
    touchFlightControls.ts         — joystick, throttle lever, fire zones (D5, R11)
    cameraChaseAndCockpit.ts       — third-person chase + cockpit toggle (D9)
  audio/
    chiptuneMusicTheory.ts         — note→freq, step timing, techno loop pattern (D23) [unit-tested]
    proceduralGameAudio.ts         — Web Audio engine: music loop scheduler + synth SFX + mute (D23)
  scene/
    proceduralSpaceSkybox.ts       — seeded canvas nebula equirectangular background (D30)
  (additional hud/) 
    offscreenEnemyIndicators.ts    — edge-of-screen markers for off-screen enemies (D28)
    sunLensFlare.ts                — faux lens flare overlay when the sun is in view (D31)
  (additional weapons/)
    targetingConeRing.ts           — green aim-cone cross-section ring at closest enemy depth (D29)
  shipStats.ts                     — data-driven stat table (upgrade-ready, R17/R18)
```

## Testing approach
- Pure-logic modules (cover solver, auto-aim cone, radar tracker, throttle physics) get vitest unit tests
- Visual/gameplay verified in a tight loop with playwright-browser-emulation (per solid-developer TDD override)
