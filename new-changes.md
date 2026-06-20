We need a small 3d 'trajectory' arrow in the bottom right corner of the ship view screen area that points in the direction of ship travel, and says 'trajectory'
the ship speed should just be a small horizontal bar under this.
the ship speed seems to never change, even if you turn and use thrust to go in the opposite direction, which would obviously be a slow and speed up procedure. The speed meter bar should show full when max current speed is acheived, now it shows always just in the middle of a large bar. the speed in m/s should show underneath, so when user upgrades speed, they'll see the m/s be higher at max speed but the speed meter shouldn't change, and hsould just be a simple, 'full when at ships max speed' bar.


when in level 3 forced ai pilot mode, the red EXIT AI PILOT button should be grey if unavailable

Sound button should become a hamburger menu button that opens a settings menu that covers the ship view and pauses gameplay. it should have music and sound effects volume levels (no more on/off feature, volume at 0 is 'off')

the drag to look feature in ai mode should do a smoothed return to the aim circle direction after not being moved by player for 3 seconds.
sometimes the drag and look in ai mode with my mouse gest stuck in 'mouse look' mode even with mouse button no longer down. resolve this by having it check for the mouse button state every second to ensure it's still down and if not, act as if a mouse up event came in.

move thrust button to bottom right, tucked in the bottom right corner of the square the radar takes up and the sphere of the actual radar. The round AI button should be in the bottom left of this sphere square. THis way we do not have the thrust and ai buttons outside of the ai panel to the right of the sphere, but tuckied in the same sphere ui square, using the dead space in the bottom corners of that square (outside of the radar circle). The AI round button will be unavailable in ai mode, requiring the 'exit ai pilot' button to be pressed to exit.
I was able to drag th radar sphere in ai mode, and I should NOT be able to.  I should ONLY be able to drag the actual ship view panel to look - it should use a smoothed return curve after not being used to 'look' for 2 seconds.



AI updates:
90 degrees approach angle should be the highest, you aren't approaching otherwise
add a default unchecked box for the feature 'ai auto-chooses upgrades' and implement. should show the updates, flash the selected update for 2 seconds, then continue.

currently the ai seems to 'feather' the thrust and it looks odd. the thrust is weak on purpose (game mechanic). restrict it to using bursts of at least 1 second in duration.


auto asteroid avoidance updates:
the avoided asteroid ring and line should be red (ship still only white ring). make the ship ring and theconnecting lines half as thick as they are now.
once 'clear of the asteroid ( astroid is 'behind' plane perpendicular to ship travel direction vector)' the effect stops. the effect is smoothed and brief to simply guide the ship around the asteroid in a 'strafing' motion (so the ship direction isn't altered after the correction, it's just 'slid sideways). the push out happens when the ship gets very close to the asteroid.

NEW STATUS LOG FOR SHIELD/HULL DAMAGE TAKEN, SHIELD RECHARGED, ENEMIES SPOTTED (start of level, single message, "n enemies spotted"), enemy destroyed, enemy locked. In manual mode, only the latest message will show for 4 seconds and then fade in place of the 'ai pilot active - ..' message location. The AI mode will have a visible small status log at the bottom - a couple lines of a status output where it enters what action it's taking: "orbiting to limit in range enemies for engagement..." "evading for shield recharge..." - etc - have it update that as a two line running mini status log - AND if user taps it, it opens the full wave log that can be scrolled to view history. Lets add in messages for when enemies are targeted, destroyed, when damage is taken (if laser damage is taken, only report when the 'barrage' is complete with the 'took x shield damage from n successive laser beam strikes' - a barrage is just when the delay between laser strikes exceeds just over twice the delay between the charge time for the laser weapon, which basically means one shot could miss and it's still' this barrage' but if two or more miss (i.e. the time reuqired for that to happen passes) then the barrage is complete and reported to user.  The log should always exist and be updated even in manual mode, but only visible in ai mode (i.e. switching to ai mode the user will see the updates from manual mode in the log).


asteroid grappling updates:
- asteroids that are 'ahead' of user trajectory (NOT aim/view) can not be grappled now. instead the user must be within 5 degrees of perpendicular of 'passing by' the asteroid OR ahead of it and in range, within a 45 degree angle of having passed it by - this makes the 'slingshot' mechanics more believable and reasonable. asteoids that are coming within grapple range on approach should show up as grey, and blink in their appropriate distance based color when getting close (not tappable yet). the radius of tappability needs to be increased for the asteroid icons, they are hard to tap. the closer asteroids icons should layer over the farther ones when they bunchup, both visually and regarding their touch interface.
to restate: imagine the ships path of travel is a line, and there's a plane perpendicular to that line of travel. asteroids in FRONT of that line CANNOT be grappled, asteroids at or behind that line CAN be grappled if in range and if the angle of the line from the ship to the asteroid is less than 45 degrees vs the plane perpendicular to ship travel direction.

when asteroid orbit engages, the curve to enter the asteroid path needs to be smoothed
