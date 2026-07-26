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
  subscribe(callback: (state: HostAppStateLike) => void): () => void;
}

export class ChaosKommandoHostScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private renderState?: ChaosKommandoRenderState;
  private latestGameState: ChaosKommandoState | null = null;
  private audioRig = new ChaosKommandoAudioRig();
  private headerText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private bannerText?: Phaser.GameObjects.Text;

  constructor() {
    super("ChaosKommandoHostScene");
  }

  preload(): void {
    preloadChaosKommandoCharacterAssets(this);
  }

  create(): void {
    const client = this.registry.get("hostClient") as HostClientLike;

    this.cameras.main.setBackgroundColor("#04111f");
    this.renderState = createChaosKommandoRenderState(this);
    this.headerText = this.add
      .text(34, 24, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "40px",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 5
      })
      .setDepth(40)
      .setScrollFactor(0);
    this.infoText = this.add
      .text(34, 78, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "44px",
        color: "#fde68a",
        stroke: "#0f172a",
        strokeThickness: 5,
        wordWrap: { width: Math.max(320, this.scale.width - 68) },
        lineSpacing: 5
      })
      .setDepth(40)
      .setScrollFactor(0);

    this.bannerText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.34, "", {
        fontFamily: hostTheme.titleFont,
        fontSize: "58px",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 8,
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScrollFactor(0)
      .setVisible(false);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    this.unsubscribe = client.subscribe((state) => {
      const previousGameState = this.latestGameState;
      this.latestGameState = (state.game?.state ?? null) as ChaosKommandoState | null;

      if (this.latestGameState && this.renderState) {
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
      this.infoText?.destroy();
      this.infoText = undefined;
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
    const nowMs = Date.now();
    // Waehrend der Kamerafahrt steht die Uhr; sie startet erst mit dem Zug.
    const preparing = nowMs < gameState.turn.prepEndsAt;
    const turnSeconds = Math.max(0, Math.ceil((gameState.turn.turnEndsAt - nowMs) / 1000));
    const headline = gameState.winnerName
      ? gameState.winnerName
      : currentPlayer
        ? activeMercenary
          ? `${currentPlayer.name} · ${activeMercenary.name}`
          : currentPlayer.name
        : "Chaos-Kommando";

    this.headerText.setText(headline);
    this.infoText.setText(
      gameState.winnerName ? "" : preparing ? "Bereitmachen ..." : `${turnSeconds}s`
    );
  }
}
