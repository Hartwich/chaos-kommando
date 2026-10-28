import Phaser from "phaser";
import type { ChaosKommandoState } from "../protocol.js";
import { ChaosKommandoAudioRig } from "./ChaosKommandoAudio.js";
import { preloadChaosKommandoCharacterAssets } from "./character/ChaosKommandoCharacterAssets.js";
import {
  createChaosKommandoRenderState,
  resolveChaosKommandoBanner,
  destroyChaosKommandoRenderState,
  renderChaosKommandoFrame,
  renderChaosKommandoIdleFrame,
  snapChaosKommandoCamera,
  type ChaosKommandoRenderState
} from "./ChaosKommandoRenderer.js";
import { renderRoundScreens } from "./roundScreens.js";
import { tokens } from "./platformTheme.js";

const hostTheme = {
  titleFont: '"Oxanium", "Arial", sans-serif',
  bodyFont: '"Nunito Sans", "Arial", sans-serif'
} as const;

interface HostAppStateLike {
  game?: {
    state?: unknown;
  } | null;
}

interface HostClientLike {
  getServerTime?(): number;
  subscribe(callback: (state: HostAppStateLike) => void): () => void;
}

export class ChaosKommandoHostScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private renderState?: ChaosKommandoRenderState;
  private serverNow: () => number = Date.now;
  private latestGameState: ChaosKommandoState | null = null;
  private audioRig = new ChaosKommandoAudioRig();
  private headerText?: Phaser.GameObjects.Text;
  private turnText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private bannerText?: Phaser.GameObjects.Text;
  private hudGraphics?: Phaser.GameObjects.Graphics;
  private miniMapGraphics?: Phaser.GameObjects.Graphics;
  private miniMapBacking?: Phaser.GameObjects.Graphics;
  private miniMapImage?: Phaser.GameObjects.Image;
  private hudCamera?: Phaser.Cameras.Scene2D.Camera;
  private teamLabels: Phaser.GameObjects.Text[] = [];
  constructor() {
    super("ChaosKommandoHostScene");
  }

  preload(): void {
    preloadChaosKommandoCharacterAssets(this);
    this.load.image("chaos-coastal-background", "/chaos-kommando/environment/v2/coastal-background.png");
    this.load.image("chaos-sandstone", "/chaos-kommando/environment/v2/sandstone.png");
    this.load.image("chaos-coastal-palm", "/chaos-kommando/environment/v3/palm.png");
    this.load.image("chaos-coastal-grass", "/chaos-kommando/environment/v3/grass-fringe.png");
  }

  create(): void {
    const client = this.registry.get("hostClient") as HostClientLike;
    this.serverNow = () => client.getServerTime?.() ?? Date.now();

    this.cameras.main.setBackgroundColor(tokens().color.background);
    this.renderState = createChaosKommandoRenderState(this);
    this.hudGraphics = this.add.graphics().setDepth(39).setScrollFactor(0);
    this.headerText = this.add
      .text(24, 14, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "26px",
        fontStyle: "bold",
        color: "#fff3d9"
      })
      .setDepth(40)
      .setScrollFactor(0);
    this.turnText = this.add.text(this.scale.width / 2, 18, "", {
      fontFamily: hostTheme.titleFont, fontSize: "20px", fontStyle: "bold", color: "#9edee7"
    }).setOrigin(0.5, 0).setDepth(40).setScrollFactor(0);
    this.infoText = this.add
      .text(this.scale.width - 24, 15, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "24px",
        color: "#fde68a",
        stroke: "#10283c",
        strokeThickness: 2,
        wordWrap: { width: Math.max(320, this.scale.width - 68) },
        lineSpacing: 5
      })
      .setDepth(40)
      .setScrollFactor(0);
    this.infoText.setOrigin(1, 0);
    this.bannerText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "58px",
        color: tokens().color.text,
        stroke: tokens().color.surface,
        strokeThickness: 8,
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScrollFactor(0)
      .setVisible(false);
    this.miniMapGraphics = this.add.graphics().setDepth(43).setScrollFactor(0);
    this.miniMapBacking = this.add.graphics().setDepth(41).setScrollFactor(0);
    this.input.keyboard?.on("keydown-M", this.toggleOverview, this);
    this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, "hud");
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    this.unsubscribe = client.subscribe((state) => {
      // Intro and result screens belong to this game, not the platform.
      if (renderRoundScreens(this, state)) {
        return;
      }

      const previousGameState = this.latestGameState;
      this.latestGameState = (state.game?.state ?? null) as ChaosKommandoState | null;

      if (this.latestGameState && this.renderState && (!previousGameState || previousGameState.terrain.mapId !== this.latestGameState.terrain.mapId)) {
        snapChaosKommandoCamera(this, this.renderState, this.latestGameState);
      }

      this.audioRig.syncState(previousGameState, this.latestGameState);
      this.syncOverlay();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      if (this.renderState) {
        destroyChaosKommandoRenderState(this.renderState);
        this.renderState = undefined;
      }
      this.audioRig.destroy();
      this.headerText?.destroy();
      this.headerText = undefined;
      this.turnText?.destroy();
      this.turnText = undefined;
      this.infoText?.destroy();
      this.infoText = undefined;
      this.hudGraphics?.destroy();
      this.input.keyboard?.off("keydown-M", this.toggleOverview, this);
      this.miniMapGraphics?.destroy(); this.miniMapBacking?.destroy(); this.miniMapImage?.destroy(); this.miniMapImage = undefined;
      this.teamLabels.forEach((label) => label.destroy());
      this.teamLabels = [];
      this.bannerText?.destroy();
      this.bannerText = undefined;
    });
  }

  update(time: number): void {
    if (!this.renderState) {
      return;
    }

    if (this.latestGameState) {
      renderChaosKommandoFrame(this, this.renderState, this.latestGameState, time);
      this.audioRig.updateChargeLoop(this.latestGameState);
      this.syncBanner(time);
    } else {
      renderChaosKommandoIdleFrame(this, this.renderState, time);
      this.audioRig.updateChargeLoop(null);
    }

    this.syncOverlay();
    this.syncHudCamera();
  }

  private syncHudCamera(): void {
    if (!this.hudCamera) return;
    this.hudCamera.setSize(this.scale.width, this.scale.height);
    const hudObjects = [this.hudGraphics, this.headerText, this.turnText, this.infoText, this.bannerText, this.miniMapGraphics, this.miniMapBacking, this.miniMapImage, ...this.teamLabels]
      .filter((object): object is Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Image => Boolean(object));
    this.cameras.main.ignore(hudObjects);
    this.hudCamera.ignore(this.children.list.filter((object) => !hudObjects.includes(object as Phaser.GameObjects.Text)));
  }

  private toggleOverview(): void {
    if (this.renderState) this.renderState.overviewMode = !this.renderState.overviewMode;
  }

  private syncMiniMap(state: ChaosKommandoState): void {
    const texture = this.renderState?.terrainImage?.texture.key;
    const graphics = this.miniMapGraphics;
    if (!texture || !graphics) return;
    const width = Math.min(196, this.scale.width * 0.25), height = width * state.terrain.height / state.terrain.width;
    const x = this.scale.width - width - 14, y = 72;
    graphics.clear();
    this.miniMapBacking?.clear().fillStyle(0x10283c, 0.88).fillRoundedRect(x - 5, y - 5, width + 10, height + 10, 6);
    if (!this.miniMapImage) {
      this.miniMapImage = this.add.image(x, y, texture).setOrigin(0).setScrollFactor(0).setDepth(42)
        .setInteractive({ useHandCursor: true }).on("pointerdown", this.toggleOverview, this);
    }
    this.miniMapImage.setTexture(texture).setPosition(x, y).setDisplaySize(width, height).setAlpha(0.9);
    // The backing stays below the terrain image; dots and camera frame go in front.
    graphics.setDepth(43);
    const sx = width / state.terrain.width, sy = height / state.terrain.height;
    const camera = this.cameras.main;
    const vx = Math.max(0, camera.worldView.x), vy = Math.max(0, camera.worldView.y);
    graphics.lineStyle(2, 0xfff1c9, 1).strokeRect(x + vx * sx, y + vy * sy,
      Math.min(state.terrain.width - vx, camera.worldView.width) * sx,
      Math.min(state.terrain.height - vy, camera.worldView.height) * sy);
    for (const p of state.players) for (const m of p.mercenaries) if (m.alive) {
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, 1).fillCircle(x + m.x * sx, y + m.y * sy, m.id === state.turn.activeMercenaryId ? 3.5 : 2);
    }
  }

  /** Namensbanner der Kameraregie mit kurzem Ein- und Ausblenden. */
  private syncBanner(timeMs: number): void {
    if (!this.bannerText || !this.renderState) {
      return;
    }

    const text = resolveChaosKommandoBanner(this.renderState, timeMs);

    if (!text) {
      this.bannerText.setVisible(false);
      return;
    }

    this.bannerText
      .setVisible(true)
      .setText(text)
      .setPosition(this.scale.width / 2, this.scale.height * 0.34);
  }

  private handleResize(): void {
    this.infoText?.setWordWrapWidth(Math.max(320, this.scale.width - 68), true);

    if (this.latestGameState && this.renderState) {
      snapChaosKommandoCamera(this, this.renderState, this.latestGameState);
    }
  }

  private syncOverlay(): void {
    if (!this.headerText || !this.infoText) {
      return;
    }

    const gameState = this.latestGameState;

    if (!gameState) {
      this.headerText.setText("Chaos-Kommando");
      this.infoText.setText("");
      return;
    }

    const currentPlayer = gameState.players.find((player) => player.playerId === gameState.turn.currentPlayerId);
    const activeMercenary = currentPlayer?.mercenaries.find(
      (mercenary) => mercenary.id === gameState.turn.activeMercenaryId
    );
    const nowMs = this.serverNow();
    // Waehrend der Kamerafahrt steht die Uhr; sie startet erst mit dem Zug.
    const preparing = nowMs < gameState.turn.prepEndsAt;
    const en = gameState.language === "en";
    const retreating = gameState.turn.resolvingShot && gameState.turn.retreatEndsAt !== null && nowMs < gameState.turn.retreatEndsAt;
    const deadline = retreating ? gameState.turn.retreatEndsAt! : gameState.turn.turnEndsAt;
    const turnSeconds = Math.max(0, Math.ceil((deadline - nowMs) / 1000));
    const phaseLabel = preparing ? (en ? "Get ready…" : "Bereitmachen…")
      : retreating ? `${en ? "Retreat" : "Rueckzug"} · ${turnSeconds}s`
      : gameState.turn.resolvingShot ? (en ? "Resolving consequences…" : "Folgen abwarten…")
      : `${turnSeconds}s · ${gameState.wind.label}`;
    const headline = gameState.winnerName
      ? gameState.winnerName
      : currentPlayer
        ? activeMercenary
          ? `${currentPlayer.name} · ${activeMercenary.name}`
          : currentPlayer.name
        : "Chaos-Kommando";
    const compact = this.scale.width < 1080;
    this.headerText.setText("CHAOS-KOMMANDO").setPosition(24, compact ? 7 : 14).setFontSize(compact ? 18 : 26);
    this.turnText?.setOrigin(compact ? 0 : 0.5, 0).setFontSize(compact ? 15 : 20)
      .setPosition(compact ? 24 : this.scale.width / 2, compact ? 32 : 18)
      .setText(headline.length > (compact ? 28 : 32) ? `${headline.slice(0, compact ? 27 : 31)}…` : headline);
    this.infoText.setPosition(this.scale.width - 24, 16).setFontSize(compact ? 18 : 24).setWordWrapWidth(this.scale.width * 0.44, true);
    this.syncMiniMap(gameState);
    const hud = this.hudGraphics;
    if (hud) {
      hud.clear().fillStyle(0x10283c, 0.94).fillRect(0, 0, this.scale.width, 58);
      hud.fillStyle(0x10283c, 0.92).fillRect(0, this.scale.height - 54, this.scale.width, 54);
      const width = this.scale.width / Math.max(1, gameState.players.length);
      gameState.players.forEach((player, index) => {
        const hp = player.mercenaries.reduce((sum, unit) => sum + unit.hp, 0);
        const maximum = player.mercenaries.reduce((sum, unit) => sum + unit.maxHp, 0);
        const x = index * width + 14;
        const y = this.scale.height - 42;
        const color = Phaser.Display.Color.HexStringToColor(player.color).color;
        hud.fillStyle(color, player.eliminated ? 0.18 : 0.85).fillRect(x, y + 26, (width - 28) * hp / maximum, 6);
        if (!this.teamLabels[index]) this.teamLabels[index] = this.add.text(x, y, "", {
          fontFamily: hostTheme.bodyFont, fontSize: "17px", fontStyle: "bold", color: "#fff5df"
        }).setDepth(40).setScrollFactor(0);
        const nameLimit = width < 150 ? 8 : 13;
        const name = player.name.length > nameLimit ? `${player.name.slice(0, nameLimit - 1)}…` : player.name;
        this.teamLabels[index].setFontSize(width < 150 ? 12 : 17).setPosition(x, y).setText(`${name}  ${hp}`).setAlpha(player.eliminated ? 0.4 : 1);
        this.teamLabels[index].setColor(player.playerId === gameState.turn.currentPlayerId ? player.color : "#fff5df");
      });
    }
    this.infoText.setText(
      gameState.winnerName ? "" : phaseLabel
    );
  }
}
