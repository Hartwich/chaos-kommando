# AI Agent Guide

Chaos-Kommando is an optional Open Party Lab game package. It is loaded by the platform through generated local registries.

## Boundaries

- Gameplay rules, scoring, timers, turn order, terrain, and weapon simulation live in `src/server`.
- Host rendering and Phaser asset loading live in `src/host`.
- Phone/controller layout mapping lives in `src/controller`.
- Shared game-specific payloads and state live in `src/protocol.ts`.
- Export only the documented package entrypoints from `package.json`.
- Do not import files from the Open Party Lab platform repo directly.

## Verification

Run:

```bash
npm run typecheck
npm run build
```

Then run the platform from `Open-Party-Lab`:

```bash
npm run games:sync-local
npm run typecheck
npm run build
```
