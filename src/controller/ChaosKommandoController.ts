import type { SupportedLanguage } from "@open-party-lab/game-core";
import type { ChaosKommandoState, ChaosKommandoWeaponId } from "../protocol.js";
import {
  createChaosKommandoAimInput,
  createChaosKommandoFireReleaseInput,
  createChaosKommandoFireStartInput,
  createChaosKommandoJumpInput,
  createChaosKommandoMoveInput,
  createChaosKommandoSelectMercenaryInput,
  createChaosKommandoSelectWeaponInput
} from "./chaosKommandoBindings.js";

interface LayoutStat {
  label: string;
  value: string;
  highlighted?: boolean;
}

interface ChaosKommandoMercenaryOptionModel {
  id: string;
  label: string;
  subtitle: string;
  hpLabel: string;
  iconPath?: string;
  teamColor?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ChaosKommandoWeaponOptionModel {
  id: string;
  label: string;
  subtitle: string;
  ammoLabel: string;
  iconPath?: string;
  accentColor?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ChaosKommandoLayoutModel {
  kind: "chaos_kommando_controls";
  title: string;
  subtitle?: string;
  helperText?: string;
  language?: SupportedLanguage;
  disabled: boolean;
  accentColor?: string;
  resetKey: string;
  countdownEndsAtMs?: number;
  stats?: LayoutStat[];
  turnOwnerLabel: string;
  windLabel: string;
  fireLabel: string;
  fireHint?: string;
  fireMode: "charged" | "instant";
  isLocalPlayersTurn: boolean;
  mercenaries: ChaosKommandoMercenaryOptionModel[];
  weapons: ChaosKommandoWeaponOptionModel[];
  onMoveChange: (moveX: number, moveY: number) => void;
  onAimChange: (aimX: number, aimY: number) => void;
  onBackflip?: () => void;
  onEndTurn?: () => void;
  fuseSeconds?: number;
  onSetFuse?: (seconds: number) => void;
  fireDisabled?: boolean;
  onJump: () => void;
  onFireStart: () => void;
  onFireEnd: () => void;
}

interface ControllerGameRenderContext {
  state: {
    preferredLanguage?: SupportedLanguage;
    room?: {
      code?: string;
      language?: SupportedLanguage;
    } | null;
    player?: {
      id: string;
      color?: string;
    } | null;
    game?: {
      phase?: string;
      roundNumber?: number;
      state?: unknown;
    } | null;
  };
  onInput(input: unknown): void;
}

function formatSeconds(untilMs: number | undefined): string {
  if (!untilMs) {
    return "-";
  }

  return `${Math.max(0, Math.ceil((untilMs - Date.now()) / 1000))}s`;
}

function resolveCurrentPlayer(state: ChaosKommandoState | null, playerId: string | undefined) {
  return state?.players.find((player) => player.playerId === playerId) ?? null;
}

function resolveActiveMercenary(state: ChaosKommandoState | null) {
  if (!state) {
    return null;
  }

  for (const player of state.players) {
    const mercenary = player.mercenaries.find((entry) => entry.id === state.turn.activeMercenaryId);

    if (mercenary) {
      return mercenary;
    }
  }

  return null;
}

function buildStats(state: ChaosKommandoState | null, en: boolean): LayoutStat[] {
  if (!state) {
    return [];
  }

  return [
    { label: en ? "Time" : "Zeit", value: state.turn.resolvingShot ? (state.turn.retreatEndsAt !== null && Date.now() < state.turn.retreatEndsAt ? formatSeconds(state.turn.retreatEndsAt) : "—") : formatSeconds(state.turn.turnEndsAt), highlighted: true }
  ];
}

export function buildChaosKommandoControllerModel(
  context: ControllerGameRenderContext
): ChaosKommandoLayoutModel {
  const playerId = context.state.player?.id ?? "";
  const language = context.state.room?.language;
  const en = language === "en";
  const gameState = (context.state.game?.state ?? null) as ChaosKommandoState | null;
  const currentPlayer = resolveCurrentPlayer(gameState, playerId);
  const activeMercenary = resolveActiveMercenary(gameState);
  const currentWeapon =
    gameState?.weapons.find((weapon) => weapon.id === gameState.turn.currentWeaponId) ?? null;
  const isLocalPlayersTurn =
    context.state.game?.phase === "playing" &&
    gameState !== null &&
    gameState.turn.currentPlayerId === playerId &&
    currentPlayer !== null &&
    !currentPlayer.eliminated &&
    !gameState.winnerPlayerId;
  const now = Date.now();
  const preparing = gameState !== null && now < gameState.turn.prepEndsAt;
  const retreating = gameState?.turn.resolvingShot && gameState.turn.retreatEndsAt !== null && now < gameState.turn.retreatEndsAt;
  const resolving = Boolean(gameState?.turn.resolvingShot && !retreating);
  const disabled = !isLocalPlayersTurn || preparing || resolving || !activeMercenary?.alive;
  const fireDisabled = disabled || Boolean(gameState?.turn.hasFired) || (!activeMercenary?.grounded && !gameState?.rope);
  const status = preparing ? (en ? "Get ready" : "Bereitmachen")
    : retreating ? (en ? "Retreat!" : "Rueckzug!")
    : resolving ? (en ? "Resolving consequences" : "Folgen abwarten")
    : isLocalPlayersTurn ? (en ? "Your turn" : "Dein Zug")
    : (en ? "Watching" : "Zuschauen");
  const title = currentPlayer?.name ? `${currentPlayer.name} Kommando` : "Chaos-Kommando";
  const subtitle = status;
  const helperText = en
    ? "Walk, aim, attack once. Then 3 seconds to retreat. Hop forward for distance; backflip for height. Injury ends your turn."
    : "Laufen, zielen, einmal angreifen. Danach 3 Sekunden Rueckzug. Vorwaertssprung fuer Weite, Salto fuer Hoehe. Schaden beendet deinen Zug.";
  const fireMode = currentWeapon?.fireMode ?? "charged";
  const fireHint =
    currentWeapon?.description ??
    (fireMode === "instant"
      ? en ? "Fire immediately. No charging needed." : "Direkt feuern. Kein Aufladen noetig."
      : en ? "Hold for more power, release to fire." : "Halten = mehr Wumms, loslassen = Feuer.");

  return {
    kind: "chaos_kommando_controls",
    title,
    subtitle,
    helperText,
    language,
    disabled,
    fireDisabled,
    fuseSeconds: currentWeapon?.fuseMs !== null && currentWeapon?.fuseMs !== undefined && currentWeapon.id !== "dynamit" ? gameState?.turn.fuseSeconds : undefined,
    onSetFuse: (seconds) => context.onInput({ type: "set-fuse", playerId, seconds, sentAt: Date.now() }),
    onBackflip: () => context.onInput(createChaosKommandoJumpInput(playerId, "backflip")),
    onEndTurn: gameState?.turn.hasFired ? undefined : () => context.onInput({ type: "end-turn", playerId, sentAt: Date.now() }),
    accentColor: currentPlayer?.color ?? context.state.player?.color ?? "#22d3ee",
    resetKey: `${context.state.game?.roundNumber ?? 0}:${context.state.game?.phase ?? "idle"}:${gameState?.turn.activeMercenaryId ?? "none"}`,
    countdownEndsAtMs: retreating ? gameState?.turn.retreatEndsAt ?? undefined : resolving || preparing ? undefined : gameState?.turn.turnEndsAt,
    stats: buildStats(gameState, en),
    turnOwnerLabel: activeMercenary
      ? `${activeMercenary.playerName} | ${activeMercenary.name}`
      : en ? "No active mercenary" : "Kein aktiver Soeldner",
    windLabel: gameState?.wind.label ?? (en ? "Calm wind" : "Wind ruhig"),
    fireLabel: currentWeapon?.displayName ?? "FIRE",
    fireHint,
    fireMode,
    isLocalPlayersTurn,
    mercenaries:
      currentPlayer?.mercenaries.map((mercenary) => ({
        id: mercenary.id,
        label: mercenary.name,
        subtitle: mercenary.alive ? (en ? "Ready" : "Einsatzbereit") : (en ? "Knocked out" : "Ausgeschaltet"),
        hpLabel: `${Math.max(0, Math.round(mercenary.hp))}/${mercenary.maxHp} HP`,
        iconPath: mercenary.portraitPath,
        teamColor: currentPlayer.color,
        selected: mercenary.id === gameState?.turn.activeMercenaryId,
        disabled: !mercenary.alive || !isLocalPlayersTurn,
        onSelect: () => {
          if (!playerId) {
            return;
          }

          context.onInput(createChaosKommandoSelectMercenaryInput(playerId, mercenary.id));
        }
      })) ?? [],
    weapons:
      gameState?.weapons.map((weapon) => {
        const ammo = activeMercenary?.ammo[weapon.id as ChaosKommandoWeaponId] ?? 0;
        return {
          id: weapon.id,
          label: weapon.displayName,
          subtitle: weapon.description,
          ammoLabel: `${Math.max(0, ammo)}`,
          iconPath: weapon.iconPath,
          accentColor: weapon.accentColor,
          selected: weapon.id === gameState.turn.currentWeaponId,
          disabled: ammo <= 0 || !isLocalPlayersTurn || Boolean(gameState.turn.hasFired),
          onSelect: () => {
            if (!playerId) {
              return;
            }

            context.onInput(createChaosKommandoSelectWeaponInput(playerId, weapon.id));
          }
        };
      }) ?? [],
    onMoveChange: (moveX, moveY) => {
      if (!playerId) {
        return;
      }

      context.onInput(createChaosKommandoMoveInput(playerId, moveX, moveY));
    },
    onAimChange: (aimX, aimY) => {
      if (!playerId) {
        return;
      }

      context.onInput(createChaosKommandoAimInput(playerId, aimX, aimY));
    },
    onJump: () => {
      if (!playerId) {
        return;
      }

      context.onInput(createChaosKommandoJumpInput(playerId));
    },
    onFireStart: () => {
      if (!playerId) {
        return;
      }

      context.onInput(createChaosKommandoFireStartInput(playerId));
    },
    onFireEnd: () => {
      if (!playerId) {
        return;
      }

      context.onInput(createChaosKommandoFireReleaseInput(playerId));
    }
  };
}
