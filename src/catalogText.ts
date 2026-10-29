import type { LocalizedGameTextMap } from "@open-party-lab/game-core";

export const chaosKommandoText = {
  "de": {
    "displayName": "Chaos-Kommando",
    "description": "Marshmallow-Runden-Artillerie: geroestete Kommandos, sechs Teams, Inselarenen, Minen, Kisten und komplett zerstoerbares Terrain mit Tunneln.",
    "visual": {
      "eyebrow": "Artillerie"
    }
  },
  "en": {
    "displayName": "Chaos Squad",
    "description": "Turn-based marshmallow artillery: six teams, island arenas, mines, crates and fully destructible terrain with tunnels.",
    "visual": {
      "eyebrow": "Artillery"
    }
  }
} as const satisfies LocalizedGameTextMap;
