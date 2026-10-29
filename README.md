# Strikepoint

A browser-based 3D first-person tactical shooter prototype. It uses Three.js and a Node.js WebSocket server for multiplayer.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` and choose **Host Private Match**.
5. Share the generated room code. Friends open the same address and choose **Join Code**.

Rooms hold up to 10 players. Hosts can start with any count from 1 to 10. Teams auto-balance.

## Controls

- **W A S D:** move
- **Shift:** walk slowly
- **Mouse:** aim
- **Left click:** fire or knife attack
- **V:** switch between carbine and selected knife
- **E:** plant at site A or B as Terrorists, or defuse as Counter-Terrorists
- **Enter:** open chat; **Enter** sends, **Escape** closes
- **Settings:** configure FOV, sensitivity, crosshair, graphics, sound, fullscreen, and invert mouse

## Profiles and ranking

Profiles, skins, knives, ELO, and levels save in the current browser on the current device. The 10-level ladder updates after first-to-13 matches using an Elo calculation. It is inspired by FACEIT-style levels but is not connected to FACEIT. Profiles do not sync between devices.

## Map and assets

Mirage is the current custom map layout, with A and B bomb sites. Weapon and player models are original procedural models. Counter-Strike 2 game assets are not included.

## Deploy free on Render

The included `render.yaml` configures a free Node.js web service in Frankfurt. Push this project to GitHub, create a Render account, choose **New > Blueprint**, and connect the repository. Render builds with `npm install` and starts the game with `npm start`. Share the `onrender.com` address Render provides.

Free Render services can sleep after 15 minutes without activity and take about a minute to wake. Game rooms and matches live in server memory, so a restart clears them.
