import { chaosKommandoManifest } from "../manifest.js";
import { ChaosKommandoHostScene } from "./ChaosKommandoHostScene.js";

export const hostGame = {
  id: chaosKommandoManifest.id,
  displayName: chaosKommandoManifest.displayName,
  sceneKey: chaosKommandoManifest.hostView,
  scene: ChaosKommandoHostScene
} as const;

export { ChaosKommandoHostScene };
