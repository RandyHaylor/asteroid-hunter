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
| D33 | **Between-wave power-ups** (implements R17/R18). After each wave clears, the wave machine enters a `powerUpSelection` phase showing **two distinct power-ups randomized** from a pool of eight — speed boost, tractor range, laser damage, missile damage, missile speed, auto-aim power (lock cone), missile fire rate, missile tracking turn — each with a unique inline-SVG icon. Picking one mutates the relevant **live data-driven stat singleton** (effect is immediate and stacks across waves) and advances to the next wave. No persistence (A4). The two-of-eight selector is pure/unit-tested |

| D34 | **Zoom-out + non-overlapping HUD**: chase camera pulled ~1.6× farther back (offset z 11.5→18, y 5.5→8.5 keeping the tilt) so the ship/asteroids read smaller and less crowded (world scale/physics unchanged). Fire buttons moved into one flex-centered `.fireZoneGroup` raised into a row **above** the corner controls (throttle/joysticks), so they structurally cannot overlap the corners or each other at any width/orientation |

| D35 | **Square game view + margin controls**: the 3D view renders into a centered SQUARE (camera aspect 1), pinned to the top of the window. The leftover space is the control margin — the **bottom strip in portrait** (buttons under the view) and the **two side strips in landscape** (buttons split left/right), placed via `orientation` media queries. DOM split: `#viewHudOverlay` (sized to the square; holds condition strip, radar, edge markers, lens flare, banner, VIEW/SOUND) vs `#controlsOverlay` (full-window; throttle/joysticks/fire + the power-up modal). Edge markers & lens flare project against the square's pixel size, not the window |
| D36 | **Radar readability**: radar inset made smaller (preferred 220→140 px, max 0.30→0.26 of view width); added a **horizontal reference disc** through the sphere center (the ship's local horizontal plane), and each contact dot drops a **vertical stem line** to its projection on the disc so above/below depth reads at a glance |

| D37 | **Portrait deck + non-overlapping controls**: in portrait the square is capped to 60% of screen height (top), leaving a roomy bottom control deck. Controls live in two flex **clusters** — LEFT (throttle, strafe, lasers) and RIGHT (rotation joystick, missiles) — that occupy the bottom-half columns in portrait and the side margins in landscape. Flexbox + opposite-side clusters mean controls can never overlap each other or the screen; `clamp()`/`vmin` item sizing makes them **shrink first** on small screens |
| D38 | **Richer techno music**: replaced the single one-bar loop with a library of longer multi-bar tracks (`TECHNO_TRACKS`) — *Acid Drive*, *Rave Stabs*, *Deep Dark* — with per-bar variation/fills, distinct tempos, a new **chord-stab voice**, acid 16th basslines and arps. The engine plays each track for several loops then rotates. These are original genre-faithful 8-bit compositions, not transcriptions of copyrighted records (can't legally bundle / reliably source those). Pure track data is unit-tested |

| D39 | **Real licensed background music**: three royalty-free Pixabay techno tracks (*Surviving*, *Aggressive*, *Nightmare on Vinyl*) downloaded, **ffmpeg-normalized (loudnorm) and attenuated to volume 0.3**, output as OGG into `game/public/music/`. Played as a **looping Web Audio playlist** through a dedicated gain node (so the SOUND/M toggle mutes it); the D38 procedural synth music remains only as a **fallback** if the files fail to load. Pixabay Content License (royalty-free, no attribution required) — this supersedes A1's no-asset-files rule for music |

| D40 | **Radar IS the steering control**: the 3D spherical radar is now a large element in the right control cluster (replacing the rotation joystick) and renders to its **own canvas/renderer** (no longer a scissor inset on the main canvas). **Dragging the radar steers the ship** — drag offset from the grab point maps to pitch/yaw rate (same convention the joystick used: drag right = yaw right, drag up = pitch up), merged over the keyboard fallback and fed through the existing eased-rotation + idle-aim-assist path. The radar still rotates with the ship and shows the disc + contact stems |

| D41 | **Side-by-side view layout** (one JS layout fn = single source of geometry, applied as inline styles). LANDSCAPE: a wide **right-aligned block** of two equal squares — **ship view (left) + radar (right)** — with all action buttons in a **left strip** (throttle/strafe/lasers upper, missiles lower). PORTRAIT: ship square on top; below it the **radar square sits on the right with the button column to its left** (throttle/strafe/lasers upper, missiles lower). The radar became its own JS-positioned square region (out of the control cluster); ship camera stays square. Replaces D35's centered-square + margin model |

| D42 | **Radar trackball steering + visible stems.** (a) The dot→disc stems are now **solid vertical cylinders** (the old 1px lines were invisible — WebGL ignores line width). (b) Dragging the radar now rotates the radar's **own commanded orientation directly, 1:1, with no damping** (it's a trackball); the radar renders that commanded frame so it responds immediately. The **ship's heading then slews toward the commanded orientation at its max turn rate** (`Quaternion.rotateTowards`, no ease-in) — "catches up on its own". When not dragging, the radar mirrors the ship (so keyboard + idle aim-assist heading still show). Replaces D40's grab-offset rate control |

| D43 | **Camera aligns to the radar; ship lags.** The chase/cockpit camera's ORIENTATION now follows the **commanded (radar) orientation directly and snaps to it instantly** when the radar is rotated (camera orientation smoothing removed; only camera *position* is still smoothed). The radar shows the same commanded frame, so radar == camera. The **ship's heading follows at its smoothed turn speed** — an eased slerp toward the commanded orientation, capped at the ship's max turn rate — so during a turn the ship visibly rotates within the view and re-centers as it catches up. When not dragging, commanded == ship |

| D44 | **Radar sphere surface visibly rotates** with the player's heading (the wireframe is set to inverse(commanded) each frame, with a bright pole marker riding it so the spin is obvious); the center disc + forward tick stay fixed as the heading reference, and contacts ride the same frame. Confirmed/kept the **thin vertical red stem** (cylinder) from each red contact dot to the center disc (radius 0.009) |

| D45 | **Lasers/missiles are armed TOGGLES with auto-fire.** Tapping LASERS / MISSILES (or Space / KeyX) toggles each weapon's *armed* state (green-glow + "●" indicator); replaces the old hold-to-fire. While armed, the weapon **auto-fires only when an enemy is targeted (nose-cone lock, D6) AND visible** (clear line of sight via `isLineOfSightBlockedByAsteroids`), gated by the weapon cooldown. No locked/visible target → holds fire (never shoots into empty space) |

| D46 | Tuning: enemies **turn more slowly** (max turn rate 2.4 → 1.2 rad/s) and **fly away/travel farther** between turns (patrol wander sphere 700 → 1300 m, orbit standoff 220 → 380 m) for longer passes. Enemy **shield/HP bars are now a constant on-screen size** at any distance (world size scaled by distanceToCamera / 90 m so perspective shrink is cancelled). Radar **rotation is more sensitive** (0.006 → 0.011 rad per drag pixel) |

| D47 | Steering model unified to fix the **drag-release camera snap**: the COMMANDED orientation is the single heading target (steered by radar drag, keyboard, or idle aim-assist); the camera = commanded (instant), and the ship eases toward commanded. We no longer snap commanded back to the ship on release (that was the bug) — so on release the camera holds and the ship finishes catching up. **Weapons are now ALWAYS ON** (removed the D45 toggle buttons): lasers + missiles auto-fire at any locked + visible target on cooldown. Replaced the fire buttons with **tiny on-view cooldown indicators** (bottom-center of the view, not controls) that fill as each weapon recharges and glow when ready |

| D48 | Radar/HUD polish + cockpit. (a) Removed the radar sphere's white **pole dot**. (b) Drew the **auto-aim cone** as a flat green wedge on the radar's horizontal disc (from center toward the forward tick, ±coneHalfAngle). (c) Weapon **cooldown indicators are now thin horizontal bars along the bottom edge** of the view (fill left→right, glow when ready). (d) **Ship view is 4:3** (wider) instead of square — radar stays square; screen-space HUD projection now uses the view's width+height. (e) **Cockpit view shows a canopy frame** (SVG: A-pillars, top arch, center strut, dashboard console) so it reads as looking out from inside the ship |

| D49 | Unified target/aim reticles. (a) The **aim ring** is now a **fixed, thin, always-on green reticle at the view center** (≈ the 10° cone's on-screen size) — replaces D29's depth-scaled green cone ring (which jumped/hid). (b) **Every live enemy gets a rotating RED target reticle** (ring + 4 ticks, CSS-spun): on screen it encircles the enemy at a constant size; off screen it **shrinks and clamps to the view rim as the direction indicator**. The locked enemy's ring gets a brighter "locked" style. This replaces the D28 edge dot markers and the D6 single lock-highlight ring (both removed). Driven off `gameWorld.enemyShips` so it covers all enemies, not just radar-detected ones |

| D50 | Restored the visible/last-seen mechanic the D49 ring rework had dropped. The per-enemy rotating rings are again driven by the **radar contact readings** (not the raw enemy list), so: **RED ring = visible (clear-sight) contact**, **YELLOW ring = last-seen (obscured/fading) contact** at its last-known spot (opacity fades with the contact), same rotating-ring visual + on/off-screen shrink-to-edge. Locked enemy's ring glows (color preserved). (D49's "all enemies incl. undetected" was the unintended change — detected/last-seen is the intended set) |

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
  upgrades/
    powerUpDefinitions.ts          — 8 power-ups (icon + stat mutation) + 2-of-8 selector (D33) [unit-tested]
  (additional hud/, cont.)
    powerUpSelectionOverlay.ts     — between-wave upgrade picker overlay (D33)
  shipStats.ts                     — data-driven stat table (upgrade-ready, R17/R18)
```

## Testing approach
- Pure-logic modules (cover solver, auto-aim cone, radar tracker, throttle physics) get vitest unit tests
- Visual/gameplay verified in a tight loop with playwright-browser-emulation (per solid-developer TDD override)
