import type { ChaosKommandoCraterState, ChaosKommandoPlatformState } from "../protocol.js";

export interface TerrainPreset {
  id: string;
  name: string;
  controlPoints: { x: number; y: number }[];
  initialCraters: ChaosKommandoCraterState[];
  platforms: ChaosKommandoPlatformState[];
}

// Flat fighting shelves, jump-height steps, and low stepping stones replace
// the tall sinusoidal hills and inaccessible floating saucers.
export const terrainPresets: TerrainPreset[] = [
  {
    id: "korallenriff", name: "Korallenriff",
    controlPoints: [
      { x: 0, y: 1000 }, { x: 45, y: 1000 }, { x: 85, y: 610 }, { x: 235, y: 610 },
      { x: 250, y: 555 }, { x: 395, y: 555 }, { x: 410, y: 500 }, { x: 570, y: 500 },
      { x: 585, y: 610 }, { x: 610, y: 1000 }, { x: 690, y: 1000 },
      { x: 725, y: 600 }, { x: 870, y: 600 }, { x: 885, y: 545 }, { x: 1035, y: 545 },
      { x: 1050, y: 490 }, { x: 1190, y: 490 }, { x: 1210, y: 545 }, { x: 1245, y: 1000 },
      { x: 1340, y: 1000 }, { x: 1375, y: 590 }, { x: 1520, y: 590 },
      { x: 1535, y: 535 }, { x: 1680, y: 535 }, { x: 1695, y: 480 }, { x: 1850, y: 480 },
      { x: 1870, y: 600 }, { x: 1915, y: 1000 }, { x: 1920, y: 1000 }
    ],
    initialCraters: [{ x: 280, y: 765, r: 97 }, { x: 365, y: 805, r: 100 },
      { x: 920, y: 755, r: 110 }, { x: 1020, y: 785, r: 120 }, { x: 1110, y: 760, r: 88 }],
    platforms: [{ x: 654, y: 621, rx: 40, ry: 24 }, { x: 1292, y: 586, rx: 38, ry: 23 }]
  },
  {
    id: "brueckenbucht", name: "Brueckenbucht",
    controlPoints: [
      { x: 0, y: 1000 }, { x: 55, y: 1000 }, { x: 90, y: 520 }, { x: 240, y: 520 },
      { x: 255, y: 575 }, { x: 410, y: 575 }, { x: 425, y: 630 }, { x: 580, y: 630 },
      { x: 600, y: 1000 }, { x: 690, y: 1000 }, { x: 725, y: 610 }, { x: 870, y: 610 },
      { x: 885, y: 555 }, { x: 1035, y: 555 }, { x: 1050, y: 500 }, { x: 1200, y: 500 },
      { x: 1215, y: 610 }, { x: 1250, y: 1000 }, { x: 1340, y: 1000 },
      { x: 1375, y: 630 }, { x: 1520, y: 630 }, { x: 1535, y: 575 }, { x: 1680, y: 575 },
      { x: 1695, y: 520 }, { x: 1850, y: 520 }, { x: 1880, y: 730 }, { x: 1920, y: 1000 }
    ],
    initialCraters: [{ x: 850, y: 770, r: 106 }, { x: 955, y: 765, r: 118 },
      { x: 1060, y: 765, r: 115 }, { x: 1150, y: 785, r: 90 }, { x: 1620, y: 810, r: 98 }],
    platforms: [{ x: 650, y: 635, rx: 43, ry: 25 }, { x: 1295, y: 637, rx: 40, ry: 25 }]
  },
  {
    id: "splitterinseln", name: "Splitterinseln",
    controlPoints: [
      { x: 0, y: 1000 }, { x: 45, y: 1000 }, { x: 80, y: 560 }, { x: 240, y: 560 },
      { x: 255, y: 505 }, { x: 410, y: 505 }, { x: 425, y: 610 }, { x: 600, y: 610 },
      { x: 605, y: 1000 }, { x: 690, y: 1000 }, { x: 725, y: 630 }, { x: 870, y: 630 },
      { x: 885, y: 575 }, { x: 1030, y: 575 }, { x: 1045, y: 630 }, { x: 1195, y: 630 },
      { x: 1235, y: 1000 }, { x: 1340, y: 1000 }, { x: 1375, y: 555 }, { x: 1520, y: 555 },
      { x: 1535, y: 500 }, { x: 1680, y: 500 }, { x: 1695, y: 555 }, { x: 1850, y: 555 },
      { x: 1880, y: 750 }, { x: 1920, y: 1000 }
    ],
    initialCraters: [{ x: 270, y: 760, r: 92 }, { x: 350, y: 810, r: 90 },
      { x: 1530, y: 785, r: 110 }, { x: 1640, y: 805, r: 100 }],
    platforms: [{ x: 650, y: 633, rx: 42, ry: 25 }, { x: 1287, y: 623, rx: 44, ry: 26 }]
  }
];
