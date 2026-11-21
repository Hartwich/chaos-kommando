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
  onRopeToggle?: () => void;
  onReelChange?: (direction: -1 | 0 | 1) => void;
  ropeAttached?: boolean;
  ropeReeling?: boolean;
  ropeDisabled?: boolean;
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
    getServerTime?: () => number;
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

function formatSeconds(untilMs: number | undefined, now: number): string {
  if (!untilMs) {
    return "-";
  }

  return `${Math.max(0, Math.ceil((untilMs - now) / 1000))}s`;
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

function buildStats(state: ChaosKommandoState | null, language: SupportedLanguage, now: number): LayoutStat[] {
  if (!state) {
    return [];
  }

  return [
    { label: ({ de: "Zeit", en: "Time", es: "Tiempo", fr: "Temps", "pt-BR": "Tempo" })[language], value: state.turn.resolvingShot ? (state.turn.retreatEndsAt !== null && now < state.turn.retreatEndsAt ? formatSeconds(state.turn.retreatEndsAt, now) : "—") : formatSeconds(state.turn.turnEndsAt, now), highlighted: true }
  ];
}

export function buildChaosKommandoControllerModel(
  context: ControllerGameRenderContext
): ChaosKommandoLayoutModel {
  const playerId = context.state.player?.id ?? "";
  const language = context.state.room?.language;
  const lang = language ?? "de";
  const words = {
    de: { ready: "Bereitmachen", retreat: "Rückzug!", resolving: "Folgen abwarten", turn: "Dein Zug", watching: "Zuschauen", squad: "Kommando", chaos: "Chaos-Kommando", helper: "Der Haken greift an Decken und Überhängen. Hochziehen halten, mit dem Stick schwingen und mit Sprung abspringen. Ein Angriff, danach 3 Sekunden Rückzug.", fireInstant: "Sofort feuern. Kein Aufladen nötig.", fireCharge: "Halten = mehr Wumms, loslassen = Feuer.", noMerc: "Kein aktiver Söldner", wind: "Wind ruhig", readyState: "Einsatzbereit", out: "Ausgeschaltet" },
    en: { ready: "Get ready", retreat: "Retreat!", resolving: "Resolving consequences", turn: "Your turn", watching: "Watching", squad: "Squad", chaos: "Chaos Squad", helper: "Hook grips ceilings and overhangs. Hold Pull up; move to swing, jump to launch off. One attack, then 3 seconds to retreat.", fireInstant: "Fire immediately. No charging needed.", fireCharge: "Hold for more power, release to fire.", noMerc: "No active mercenary", wind: "Calm wind", readyState: "Ready", out: "Knocked out" },
    es: { ready: "Prepárate", retreat: "¡Retirada!", resolving: "Resolviendo consecuencias", turn: "Tu turno", watching: "Observando", squad: "Escuadrón", chaos: "Escuadrón del Caos", helper: "El gancho se agarra a techos y salientes. Mantén Tirar para subir; muévete para balancearte y salta para soltarte. Un ataque y luego 3 segundos para retirarte.", fireInstant: "Dispara de inmediato. No hace falta cargar.", fireCharge: "Mantén para cargar y suelta para disparar.", noMerc: "Sin mercenario activo", wind: "Viento en calma", readyState: "Listo", out: "Fuera de combate" },
    fr: { ready: "Prépare-toi", retreat: "Retraite !", resolving: "Résolution des conséquences", turn: "À toi de jouer", watching: "Observation", squad: "Escouade", chaos: "Escouade du chaos", helper: "Le grappin s’accroche aux plafonds et aux surplombs. Maintiens Tirer pour monter, bouge pour te balancer et saute pour lâcher. Une attaque, puis 3 secondes pour battre en retraite.", fireInstant: "Tire immédiatement, sans charger.", fireCharge: "Maintiens pour charger, relâche pour tirer.", noMerc: "Aucun mercenaire actif", wind: "Vent calme", readyState: "Prêt", out: "Éliminé" },
    "pt-BR": { ready: "Prepare-se", retreat: "Recuar!", resolving: "Resolvendo consequências", turn: "Sua vez", watching: "Observando", squad: "Esquadrão", chaos: "Esquadrão do Caos", helper: "O gancho prende em tetos e saliências. Segure Puxar para subir; mova para balançar e pule para soltar. Um ataque, depois 3 segundos para recuar.", fireInstant: "Atire imediatamente, sem carregar.", fireCharge: "Segure para carregar e solte para atirar.", noMerc: "Sem mercenário ativo", wind: "Vento calmo", readyState: "Pronto", out: "Nocauteado" }
  }[lang];
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
  const now = context.state.getServerTime?.() ?? Date.now();
  const preparing = gameState !== null && now < gameState.turn.prepEndsAt;
  const retreating = gameState?.turn.resolvingShot && gameState.turn.retreatEndsAt !== null && now < gameState.turn.retreatEndsAt;
  const expired = Boolean(gameState && !gameState.turn.resolvingShot && now >= gameState.turn.turnEndsAt);
  const resolving = expired || Boolean(gameState?.turn.resolvingShot && !retreating);
  const disabled = !isLocalPlayersTurn || preparing || resolving || !activeMercenary?.alive;
  const fireDisabled = disabled || Boolean(gameState?.turn.hasFired) || (!activeMercenary?.grounded && !gameState?.rope);
  const status = preparing ? words.ready : retreating ? words.retreat : resolving ? words.resolving : isLocalPlayersTurn ? words.turn : words.watching;
  const title = currentPlayer?.name ? `${currentPlayer.name} ${words.squad}` : words.chaos;
  const subtitle = status;
  const helperText = words.helper;
  const fireMode = currentWeapon?.fireMode ?? "charged";
  const fireHint =
    currentWeapon?.description ??
    (fireMode === "instant"
      ? words.fireInstant
      : words.fireCharge);

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
    onRopeToggle: () => context.onInput({ type: "rope:toggle", playerId, sentAt: Date.now() }),
    onReelChange: (direction) => context.onInput({ type: "rope:reel", playerId, direction, sentAt: Date.now() }),
    ropeAttached: gameState?.rope?.mercenaryId === activeMercenary?.id && Boolean(gameState?.rope),
    ropeReeling: gameState?.rope?.reelInput === -1,
    ropeDisabled: disabled || Boolean(gameState?.turn.hasFired) || gameState?.turn.chargeStartedAt !== null || (!gameState?.rope && (activeMercenary?.ammo.seilzug ?? 0) <= 0),
    onBackflip: () => context.onInput(createChaosKommandoJumpInput(playerId, "backflip")),
    onEndTurn: gameState?.turn.hasFired ? undefined : () => context.onInput({ type: "end-turn", playerId, sentAt: Date.now() }),
    accentColor: currentPlayer?.color ?? context.state.player?.color ?? "#22d3ee",
    resetKey: `${context.state.game?.roundNumber ?? 0}:${context.state.game?.phase ?? "idle"}:${gameState?.turn.activeMercenaryId ?? "none"}`,
    countdownEndsAtMs: retreating ? gameState?.turn.retreatEndsAt ?? undefined : resolving || preparing ? undefined : gameState?.turn.turnEndsAt,
    stats: buildStats(gameState, lang, now),
    turnOwnerLabel: activeMercenary
      ? `${activeMercenary.playerName} | ${activeMercenary.name}`
      : words.noMerc,
    windLabel: gameState?.wind.label ?? words.wind,
    fireLabel: currentWeapon?.displayName ?? "FIRE",
    fireHint,
    fireMode,
    isLocalPlayersTurn,
    mercenaries:
      currentPlayer?.mercenaries.map((mercenary) => ({
        id: mercenary.id,
        label: mercenary.name,
        subtitle: mercenary.alive ? words.readyState : words.out,
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
