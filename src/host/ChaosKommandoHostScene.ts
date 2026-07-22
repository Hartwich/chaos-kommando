import Phaser from "phaser";
import type { ChaosKommandoState } from "../protocol.js";
import { ChaosKommandoAudioRig } from "./ChaosKommandoAudio.js";
import { preloadChaosKommandoCharacterAssets } from "./character/ChaosKommandoCharacterAssets.js";
import {
  createChaosKommandoRenderState,
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
        fontSize: "34px",
        color: "#f8fafc"
      })
      .setDepth(40)
      .setScrollFactor(0);
    this.infoText = this.add
      .text(34, 72, "", {
        fontFamily: hostTheme.bodyFont,
        fontSize: "19px",
        color: "#dbeafe",
        wordWrap: { width: Math.max(320, this.scale.width - 68) },
        lineSpacing: 5
      })
      .setDepth(40)
      .setScrollFactor(0);

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
    });
  }

  update(time: number): void {
    if (!this.renderState) {
      return;
    }

    if (this.latestGameState) {
      renderChaosKommandoFrame(this, this.renderState, this.latestGameState, time);
      this.audioRig.updateChargeLoop(this.latestGameState);
    } else {
      renderChaosKommandoIdleFrame(this, this.renderState, time);
      this.audioRig.updateChargeLoop(null);
    }

    this.syncOverlay();
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
    const turnSeconds = Math.max(0, Math.ceil((gameState.turn.turnEndsAt - Date.now()) / 1000));
    const headline = gameState.winnerName
      ? gameState.winnerName
      : currentPlayer
        ? currentPlayer.name
        : "Chaos-Kommando";

    this.headerText.setText(headline);
    this.infoText.setText(`${turnSeconds}s`);
  }
}
