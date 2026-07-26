# Marshmallow-Rig Assets

Einzige Quelle dieser Dateien ist `tools/marshmallow-motion-lab/assets` im Plattform-Repo.
Sie wurden unveraendert uebernommen; Aenderungen gehoeren zuerst ins Motion Lab.

| Zielpfad | Quelle im Motion Lab |
| --- | --- |
| `rig/torso-wide.png` | `assets/rig/torso-wide.png` |
| `rig/torso-square.png` | `assets/rig/torso-square.png` |
| `rig/torso-tall.png` | `assets/rig/torso-tall.png` |
| `limbs/hand-knob.png` | `assets/limbs/hand-knob.png` |
| `limbs/foot-knob.png` | `assets/limbs/foot-knob.png` |
| `accessories/helmet.png` | `assets/accessories/helmet.png` |
| `accessories/headband.png` | `assets/accessories/headband.png` |
| `accessories/headbands/*` | `assets/accessories/headbands/*` |

Die zugehoerigen Rig-Profile sind nach `src/host/character/marshmallowRig.ts` portiert
(Quelle: `tools/marshmallow-motion-lab/presets/marshmallow-rig-presets.json`,
formatVersion 2). Die Bewegungsgleichungen stammen aus dem kanonischen Renderer
`tools/marshmallow-motion-lab/motion-lab.js` und liegen in
`src/host/character/ChaosKommandoCharacterAnimator.ts`.

`rig/torso.png`, `rig/arm.png`, `rig/foot.png` sowie `../gear/*.svg` stammen aus dem
alten Rig und werden nicht mehr geladen. Sie koennen geloescht werden.
