import type { ControllerLayoutKey } from "@open-party-lab/game-core";
import { chaosKommandoManifest } from "../manifest.js";
import { buildChaosKommandoControllerModel } from "./ChaosKommandoController.js";

export const controllerGame = {
  id: chaosKommandoManifest.id,
  layoutKey: "chaos_kommando_controls" as ControllerLayoutKey,
  buildLayout: buildChaosKommandoControllerModel
} as const;

export { buildChaosKommandoControllerModel };
