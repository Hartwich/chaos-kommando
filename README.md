# Chaos-Kommando

Turn-based cartoon artillery game for Open Party Lab with mercenaries, wild weapons, and destructible terrain.

![In-game screenshot](docs/screenshots/host.png)

## Status

Alpha. Marshmallow artillery overhaul with true 2D destructible terrain (craters, tunnels, overhangs), 16 weapons (incl. dynamite, holy grenade, banana bomb, air strike, baseball bat, minigun), proximity mines, supply crates, per-turn wind, retreat time, sudden death rising water, a dynamic zoom camera, and a continuous toasted-marshmallow animation rig covering locomotion, aiming, charging, attacks, hits, victory, and defeat.

Character rendering uses a fixed world pivot with separate torso, arm, foot, face, gear, and weapon layers. Eyes track the live aim direction, limbs move on continuous curves, and weapon-specific grip points keep both hands attached while aiming. All 16 weapons have dedicated host carry art; gadgets remain intentionally separate from the current movement-and-weapon polish pass.

## Run Through Open Party Lab

This repo is not a standalone app. Run it through the Open Party Lab platform.

Recommended layout:

```text
Open-Party-Lab/
  local-games/
    chaos-kommando/
```

From the Platform repo:

```bash
npm install
npm run games:sync-local
npm run dev:all
```

The Platform loads this game only when the repo exists locally and `npm run games:sync-local` links it. Missing optional games are skipped.

## GitHub Metadata

Description:

```text
Turn-based cartoon artillery game for Open Party Lab with mercenaries, wild weapons, and destructible terrain.
```

Suggested topics:

```text
open-party-lab party-game browser-game phaser typescript local-multiplayer artillery-game
```

## Package Entrypoints

- `@open-party-lab/game-chaos-kommando/manifest`
- `@open-party-lab/game-chaos-kommando/protocol`
- `@open-party-lab/game-chaos-kommando/server`
- `@open-party-lab/game-chaos-kommando/host`
- `@open-party-lab/game-chaos-kommando/controller`

The Platform should import only these public entrypoints.

## Development Checks

```bash
npm install
npm run typecheck
npm run build
npm run pack:dry-run
```

For visual checks, start Open Party Lab, add virtual controllers when needed, and capture host screenshots through a browser.

## License

Code is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

Assets, generated media, word lists, prompts, and third-party references may need separate rights review before public store distribution.
