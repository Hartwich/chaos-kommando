import type { GameManifest } from "@open-party-lab/game-core";

export const chaosKommandoManifest = {
  id: "chaos-kommando",
  displayName: "Chaos-Kommando",
  description: "Marshmallow-Runden-Artillerie: geroestete Kommandos, 16 Waffen, Minen, Kisten und komplett zerstoerbares Terrain mit Tunneln.",
  minPlayers: 2,
  maxPlayers: 4,
  hostView: "ChaosKommandoHostScene",
  controllerView: "chaos-kommando",
  controllerLayout: "chaos_kommando_controls",
  supportsTeams: false,
  estimatedRoundDurationMs: 180_000,
  roundCompletionMode: "wait_for_ready",
  phaseDurations: {
    roundIntroMs: 1_800,
    countdownMs: 2_200,
    resultMs: 5_200,
    scoreboardMs: 5_000
  }
} as const satisfies GameManifest;

export const manifest = chaosKommandoManifest;
