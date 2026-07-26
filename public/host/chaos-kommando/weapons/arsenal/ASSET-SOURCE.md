# Marshmallow Comic Arsenal in Chaos-Kommando

Quelle: `tools/marshmallow-motion-lab/assets/weapons/arsenal` (`weapon-pack.json`, formatVersion 1).
Die PNGs sind auf halbe Kantenlaenge herunterskaliert und palettenquantisiert; die
hochaufloesenden Originale bleiben im Motion Lab. Aenderungen gehoeren zuerst dorthin.

Griff-, Lauf- und Abwurfpunkte sind laut Paket-README bewusst **nicht** Teil des Packs.
Sie liegen spielseitig in `src/host/character/ChaosKommandoCharacterAssets.ts`
(`chaosKommandoArsenalArt`), normiert auf die volle Canvasflaeche, Blickrichtung rechts.

## Zuordnung Spielwaffe -> Arsenal-Grafik

| Waffe | Klasse | Grafik | Haltung | Helm |
| --- | --- | --- | --- | --- |
| kicher-bazooka | launcher | rocket-launcher | zweihand | ja |
| regenbogen-rakete | launcher | marshmallow-blaster | zweihand | ja |
| bohrer-rakete | launcher | grenade-launcher | zweihand | ja |
| konfetti-schrot | two-handed | confetti-cannon | zweihand | nein |
| keks-moerser | two-handed | plunger-launcher | zweihand | nein |
| minigun | two-handed | minigun | zweihand | nein |
| plunder-pistole | pistol | revolver | einhand | nein |
| splitter-granate | throwable | frag-grenade | wurf | ja |
| heilige-granate | throwable | cluster-grenade | wurf | ja |
| banane | throwable | banana-bomb | wurf | ja |
| gummi-huhn | throwable | sticky-grenade | wurf | ja |
| seifenblasen-bombe | throwable | smoke-grenade | wurf | ja |
| baseball-schlaeger | melee | frying-pan | einhand | nein |
| enten-granate | throwable | frag-grenade *(geteilt)* | wurf | ja |
| dynamit | placeable | sticky-grenade *(geteilt)* | wurf | ja |
| luftschlag | remote | smoke-grenade *(geteilt)* | wurf | ja |

## Offene Grafiken

Fuer diese vier Waffen fehlt im Arsenal ein eigenes Motiv; sie teilen sich
vorerst die oben markierte Grafik:

- **Ente** (`enten-granate`)
- **Dynamitbuendel** (`dynamit`)
- **Luftschlag-Marker** (`luftschlag`) — Funkgeraet, Leuchtrakete oder Signalpfeife
- **Baseballschlaeger** (`baseball-schlaeger`) — laeuft auf der Bratpfanne

Ausserdem nicht abgedeckt: Naeherungsmine und Nachschubkiste. Beide werden
weiterhin vektoriell in `ChaosKommandoRenderer.ts` gezeichnet.

## Ungenutzte Arsenal-Grafiken

`pistol`, `smg`, `assault-rifle`, `shotgun`, `machine-gun`, `flamethrower`,
`sword` und `axe` sind im Pack vorhanden, aber keiner Spielwaffe zugeordnet.
Sie stehen fuer neue Waffen bereit. Schwert und Axt brauchen laut Pack-README
eine eigene Nahkampfbewegung; das Rig hat aktuell keinen `melee`-Zustand.
