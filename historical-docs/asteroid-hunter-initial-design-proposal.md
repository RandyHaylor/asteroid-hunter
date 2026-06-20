3d game idea

asteroid hunter - tractor-grappler beam mechanics - cover behind destructible asteroids - 3d radar - physics based movements

alien ship, moving around asteroid field

you can 'grab' the large asteroids via tractor beam to quickly position yourself behind them for stealth and safety
you can tap another asteroid to make a quick transition from being behind cover of one to the other
	if you tap the lower third of the screen (the fire buttons) you'll shoot lasers (left button) or missiles (right button)
	

game is full rendered 3d with lighting, but very basic.
uses simple but realistic acceleration physics
upgrades to ship thrust, tractor beam power affect acceleration, turning speed
upgrades to lasers and missiles affect fire rate, explosion radius, laser count and spread, etc.


spherical radar shows you enemies and friendlies nearby. sphere rotates with player rotation
	if an enemy is obscured by an asteroid, the enemy color dot shifts from red to yellow that fades as time goes on (indicating it's a 'last seen here' representation)
	yellow last-seen fading dots DO disappear if that enemy causing it becomes visible on radar again (logic being radar tracks a signature for each detected thing so it knows if that last-seen enemy re-appears and we can therefore know 1: how many enemies have we seen recently that have not been eliminated (our radar has a 'recent active enemies: n' count) so we'll remain aware, and the radar ui outline is blinking red.
	
tapping on an asteroid takes cover there 
	defaults to best cover based on direction you're facing
	otherwise it takes enemies within range and positions you to hide from their average position, weighted/clamped to guarantee hiding from closest enemies first
	asteroids have a wire mesh grid around them showing tappable for tractor-beam grabbing
		grid is colored red if full cover is not fully possible from in-range enemies
		grid is colored yellow if cover is not fully possible from in-sight/in-long-range enemies
		lasers are considered short range, missiles long range (time to travel but no real limit)
		
	can only tractor/take cover behind larger asteroids
	consider medium/smaller asteroids that move in response to the physics demands of grappling and accelerating your ship
	consider asteroids can shrink/deform from missile or laser attacks when taking cover behind them
		simple particle effects can denote asteroid damage
		asteroids lose chunks like destructible terrain games
