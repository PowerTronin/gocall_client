import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  Pin,
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from "lucide-react";
import { AudioTrack, Track, VideoTrack } from "livekit-client";

import { getStageLayoutPreference, type StageLayoutPreference } from "../app-preferences";
import { useAuth } from "../context/AuthContext";
import { useRoomVoice } from "../context/RoomVoiceContext";
import {
  fetchRoomState,
  joinRoomAsMember,
  RoomStateResponse,
  RoomVoiceParticipantState,
  updateRoomSharedStageLayout,
  updateRoomSharedStageLayoutLock,
} from "../services/rooms-api";
interface ControlButtonProps {
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  isActive?: boolean;
  isDanger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}

interface TileActionButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  isActive?: boolean;
  disabled?: boolean;
}

interface VisualTile {
  id: string;
  kind: "camera" | "screen-share";
  participant: RoomVoiceParticipantState;
  track: Track;
  audioTrack?: Track;
}

type RoomLayoutMode = "grid" | "stage";

interface StageTileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

type StageLayoutMap = Record<string, StageTileLayout>;

interface StageViewportOffset {
  x: number;
  y: number;
}

interface StageStorageState {
  layoutMode?: RoomLayoutMode;
  personalStageLayouts?: StageLayoutMap;
  personalPinnedTileIds?: string[];
  stageLayouts?: StageLayoutMap;
  pinnedTileIds?: string[];
  showStageGrid?: boolean;
  stageViewOffset?: StageViewportOffset;
  stageZoom?: number;
}

const shellClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-bg)]";
const monoMetaClass = "font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--pc-text-muted)]";
const defaultStageSize = { width: 2200, height: 1400 };
const defaultStageViewportSize = { width: 1280, height: 720 };
const stageGridSize = 20;
const minStageZoom = 0.6;
const maxStageZoom = 1.6;

const getStageStorageKey = (roomIdentifier: string) => `power-call:room-layout:${roomIdentifier}`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampStageViewOffset = (
  offset: StageViewportOffset,
  stageSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  zoom = 1
): StageViewportOffset => {
  const scaledWidth = stageSize.width * zoom;
  const scaledHeight = stageSize.height * zoom;
  const minX = Math.min(viewportSize.width - scaledWidth, 0);
  const minY = Math.min(viewportSize.height - scaledHeight, 0);

  return {
    x: clamp(offset.x, minX, 0),
    y: clamp(offset.y, minY, 0),
  };
};

const getCenteredStageViewOffset = (
  stageSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  zoom = 1
): StageViewportOffset =>
  clampStageViewOffset(
    {
      x: Math.round((viewportSize.width - stageSize.width * zoom) / 2),
      y: Math.round((viewportSize.height - stageSize.height * zoom) / 2),
    },
    stageSize,
    viewportSize,
    zoom
  );

const getZoomAnchoredStageViewOffset = (
  anchor: { x: number; y: number },
  currentOffset: StageViewportOffset,
  currentZoom: number,
  nextZoom: number
): StageViewportOffset => {
  const worldX = (anchor.x - currentOffset.x) / currentZoom;
  const worldY = (anchor.y - currentOffset.y) / currentZoom;

  return {
    x: anchor.x - worldX * nextZoom,
    y: anchor.y - worldY * nextZoom,
  };
};

const snapValue = (value: number, targets: number[], threshold = 10) => {
  for (const target of targets) {
    if (Math.abs(value - target) <= threshold) {
      return target;
    }
  }

  return value;
};

const snapToGrid = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

const areStageLayoutsEqual = (left: StageLayoutMap, right: StageLayoutMap): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftLayout = left[key];
    const rightLayout = right[key];
    return (
      Boolean(leftLayout) &&
      Boolean(rightLayout) &&
      leftLayout.x === rightLayout.x &&
      leftLayout.y === rightLayout.y &&
      leftLayout.w === rightLayout.w &&
      leftLayout.h === rightLayout.h &&
      leftLayout.z === rightLayout.z
    );
  });
};

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

const clampStageLayout = (
  layout: StageTileLayout,
  stageSize: { width: number; height: number }
): StageTileLayout => {
  const maxX = Math.max(stageSize.width - layout.w, 0);
  const maxY = Math.max(stageSize.height - layout.h, 0);

  return {
    ...layout,
    x: clamp(layout.x, 0, maxX),
    y: clamp(layout.y, 0, maxY),
  };
};

const snapStageLayout = (
  layout: StageTileLayout,
  stageSize: { width: number; height: number },
  options?: { enabled?: boolean; snapWidth?: boolean; snapHeight?: boolean }
): StageTileLayout => {
  const clampedLayout = clampStageLayout(layout, stageSize);
  if (options?.enabled === false) {
    return clampedLayout;
  }
  const maxX = Math.max(stageSize.width - clampedLayout.w, 0);
  const maxY = Math.max(stageSize.height - clampedLayout.h, 0);

  const snappedX = snapValue(
    snapToGrid(clampedLayout.x, stageGridSize),
    [0, maxX],
    12
  );
  const snappedY = snapValue(
    snapToGrid(clampedLayout.y, stageGridSize),
    [0, maxY],
    12
  );
  const snappedW = options?.snapWidth ? snapToGrid(clampedLayout.w, stageGridSize) : clampedLayout.w;
  const snappedH = options?.snapHeight ? snapToGrid(clampedLayout.h, stageGridSize) : clampedLayout.h;

  return clampStageLayout(
    {
      ...clampedLayout,
      x: snappedX,
      y: snappedY,
      w: snappedW,
      h: snappedH,
    },
    stageSize
  );
};

const getDefaultStageTileLayout = (
  tile: {
    id: string;
    kind: "camera" | "screen-share";
    participant: RoomVoiceParticipantState;
  },
  visualTiles: Array<{
    id: string;
    kind: "camera" | "screen-share";
    participant: RoomVoiceParticipantState;
  }>,
  stageSize: { width: number; height: number }
): StageTileLayout => {
  const margin = 32;
  const gap = 20;
  const screenShareTiles = visualTiles.filter((visualTile) => visualTile.kind === "screen-share");
  const cameraTiles = visualTiles.filter((visualTile) => visualTile.kind === "camera");
  const screenShareIndex = screenShareTiles.findIndex((visualTile) => visualTile.id === tile.id);
  const cameraIndex = cameraTiles.findIndex((visualTile) => visualTile.id === tile.id);

  if (tile.kind === "screen-share") {
    const w = Math.min(840, Math.max(560, Math.floor(stageSize.width * 0.62)));
    const h = Math.round(w * 9 / 16);
    return clampStageLayout(
      {
        x: margin + screenShareIndex * 28,
        y: margin + screenShareIndex * 28,
        w,
        h,
        z: 100 + screenShareIndex,
      },
      stageSize
    );
  }

  const hasVideo = Boolean(tile.participant.is_camera_enabled);
  const w = hasVideo ? 280 : 220;
  const h = hasVideo ? 350 : 220;
  const hasScreenShare = screenShareTiles.length > 0;

  let baseX = margin;
  let baseY = margin;

  if (hasScreenShare) {
    const rightRailSlots = 2;
    const rightRailX = Math.max(stageSize.width - w - margin, margin);

    if (cameraIndex < rightRailSlots) {
      baseX = rightRailX;
      baseY = margin + cameraIndex * (h + gap);
    } else {
      const stripIndex = cameraIndex - rightRailSlots;
      const usableWidth = Math.max(stageSize.width - margin * 2 - gap - (w + gap), w);
      const columns = Math.max(1, Math.floor((usableWidth + gap) / (w + gap)));
      const column = stripIndex % columns;
      const row = Math.floor(stripIndex / columns);
      baseX = margin + column * (w + gap);
      baseY = Math.max(stageSize.height - margin - h - row * (h + gap), margin);
    }
  } else {
    const usableWidth = Math.max(stageSize.width - margin * 2, w);
    const columns = Math.max(1, Math.floor((usableWidth + gap) / (w + gap)));
    const column = cameraIndex % columns;
    const row = Math.floor(cameraIndex / columns);
    baseX = margin + column * (w + gap);
    baseY = margin + row * (h + gap);
  }

  return clampStageLayout(
    {
      x: baseX,
      y: baseY,
      w,
      h,
      z: 10 + cameraIndex,
    },
    stageSize
  );
};

const getStageTileAspectRatio = (tileKind: "camera" | "screen-share", hasVisual?: boolean) => {
  if (tileKind === "screen-share") {
    return 16 / 9;
  }

  return hasVisual ? 4 / 5 : 1;
};

const orderStageTiles = <
  T extends {
    id: string;
    kind: "camera" | "screen-share";
  },
>(
  tiles: T[],
  pinnedTileIds: string[]
) => {
  const pinnedSet = new Set(pinnedTileIds);

  return [...tiles].sort((left, right) => {
    const pinDelta = Number(pinnedSet.has(right.id)) - Number(pinnedSet.has(left.id));
    if (pinDelta !== 0) {
      return pinDelta;
    }

    const kindDelta = Number(left.kind === "screen-share") - Number(right.kind === "screen-share");
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return left.id.localeCompare(right.id);
  });
};

const getFullscreenToggleError = (error: unknown): string => {
  return error instanceof Error ? error.message : "Failed to toggle fullscreen";
};

const getSpeakingTileClasses = (isSpeaking: boolean): string => {
  return isSpeaking
    ? "shadow-[0_0_0_2px_rgba(74,222,128,0.95),0_0_24px_rgba(74,222,128,0.28)]"
    : "";
};

const isParticipantHighlighted = (
  participant: RoomVoiceParticipantState,
  liveIdentity: string | undefined,
  activeIds: Set<string>
): boolean => {
  return (
    activeIds.has(participant.user_id) ||
    activeIds.has(participant.username) ||
    Boolean(liveIdentity && activeIds.has(liveIdentity))
  );
};

const formatOnlineCount = (count: number): string => {
  return `${String(Math.max(count, 0)).padStart(2, "0")} ONLINE`;
};

const getParticipantTileStateLabel = (
  participant: RoomVoiceParticipantState,
  options: {
    isCurrentUser: boolean;
    showVideo: boolean;
    isSpeaking: boolean;
  }
): string => {
  if (participant.is_screen_sharing) {
    return "Sharing screen";
  }

  if (options.isSpeaking) {
    return "Speaking";
  }

  if (!participant.is_mic_enabled && !options.showVideo) {
    return "Voice only";
  }

  if (!participant.is_mic_enabled) {
    return "Muted";
  }

  if (!options.showVideo) {
    return "Listening";
  }

  return options.isCurrentUser ? "Camera live" : "Connected";
};

const getParticipantStripLabel = (
  participant: RoomVoiceParticipantState,
  options: {
    showVideo: boolean;
    isSpeaking: boolean;
  }
): string => {
  if (participant.is_screen_sharing) {
    return "Share live";
  }

  if (options.isSpeaking) {
    return "Speaking";
  }

  if (!participant.is_mic_enabled && !options.showVideo) {
    return "Voice only";
  }

  if (!participant.is_mic_enabled && options.showVideo) {
    return "Muted / Cam On";
  }

  if (participant.is_mic_enabled && !options.showVideo) {
    return "Listening";
  }

  return "Live";
};

const ControlButton: React.FC<ControlButtonProps> = ({
  icon,
  activeIcon,
  isActive = false,
  isDanger = false,
  disabled = false,
  onClick,
  label,
}) => {
  const colorClasses = isDanger
    ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]"
    : "bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-action-bg)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex h-11 w-11 items-center justify-center border-2 border-[var(--pc-border)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${colorClasses}`}
    >
      {isActive && activeIcon ? activeIcon : icon}
    </button>
  );
};

const TileActionButton: React.FC<TileActionButtonProps> = ({
  label,
  onClick,
  icon,
  isActive = false,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center border border-[var(--pc-border)] backdrop-blur-sm transition-colors ${
        isActive
          ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)]"
          : "bg-[color-mix(in_srgb,var(--pc-surface)_82%,transparent)] text-[var(--pc-text)] hover:bg-[var(--pc-action-inverse-bg)] hover:text-[var(--pc-action-inverse-text)]"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
    </button>
  );
};

const StatusBadge: React.FC<{
  label: string;
  enabled: boolean;
}> = ({ label, enabled }) => {
  return (
    <div
      className={`flex min-w-[30px] items-center justify-center border-2 px-2 py-1 font-mono text-[10px] font-bold uppercase ${
        enabled ? "border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)]" : "border-[var(--pc-border)] text-[var(--pc-text)]"
      }`}
    >
      {label}
    </div>
  );
};

const VoiceTile: React.FC<{
  participant: RoomVoiceParticipantState;
  isCurrentUser: boolean;
  cameraTrack?: Track;
  audioTrack?: Track;
  isCameraOff?: boolean;
  className?: string;
  isFocused?: boolean;
  canFocus?: boolean;
  canFullscreen?: boolean;
  canPin?: boolean;
  isPinned?: boolean;
  isSpeaking?: boolean;
  onFocusToggle?: () => void;
  onPinToggle?: () => void;
  onFullscreenError?: (message: string) => void;
  onSelect?: () => void;
}> = ({
  participant,
  isCurrentUser,
  cameraTrack,
  audioTrack,
  isCameraOff = true,
  className,
  isFocused = false,
  canFocus = false,
  canFullscreen = false,
  canPin = false,
  isPinned = false,
  isSpeaking = false,
  onFocusToggle,
  onPinToggle,
  onFullscreenError,
  onSelect,
}) => {
  const initials = (participant.name || participant.username || "?").slice(0, 1).toUpperCase();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasVideoTrack = Boolean(cameraTrack);
  const showVideo = hasVideoTrack && !isCameraOff;
  const stateLabel = getParticipantTileStateLabel(participant, {
    isCurrentUser,
    showVideo,
    isSpeaking,
  });
  const stripLabel = getParticipantStripLabel(participant, { showVideo, isSpeaking });

  useEffect(() => {
    if (!videoRef.current || !cameraTrack || !showVideo) {
      return undefined;
    }

    const track = cameraTrack as VideoTrack;
    track.attach(videoRef.current);

    return () => {
      track.detach(videoRef.current!);
    };
  }, [cameraTrack, showVideo]);

  useEffect(() => {
    if (isCurrentUser || !audioRef.current || !audioTrack) {
      return undefined;
    }

    const track = audioTrack as AudioTrack;
    track.attach(audioRef.current);

    return () => {
      track.detach(audioRef.current!);
    };
  }, [audioTrack, isCurrentUser]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === containerRef.current) {
        if (!document.exitFullscreen) {
          onFullscreenError?.("Fullscreen exit is not available in this browser");
          return;
        }
        await document.exitFullscreen();
        return;
      }

      const requestFullscreen = containerRef.current.requestFullscreen?.bind(containerRef.current);
      if (!requestFullscreen) {
        onFullscreenError?.("Fullscreen is not available in this browser");
        return;
      }

      await requestFullscreen();
    } catch (error) {
      onFullscreenError?.(getFullscreenToggleError(error));
    }
  }, [onFullscreenError]);

  return (
    <div
      ref={containerRef}
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden border-[3px] border-[var(--pc-border)] bg-[var(--pc-surface)] p-[3px] ${getSpeakingTileClasses(isSpeaking)} ${
        className ?? "min-h-[16rem]"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}

      {(canFocus || canFullscreen || (canPin && onPinToggle)) && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 border border-[var(--pc-border)] bg-[color-mix(in_srgb,var(--pc-bg)_74%,transparent)] p-1 opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {canPin && onPinToggle && (
            <TileActionButton
              label={isPinned ? "Unpin" : "Pin"}
              onClick={onPinToggle}
              icon={<Pin className="h-3.5 w-3.5" />}
              isActive={isPinned}
            />
          )}
          {canFocus && onFocusToggle && (
            <TileActionButton
              label={isFocused ? "Exit focus" : "Expand"}
              onClick={onFocusToggle}
              icon={
                isFocused ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )
              }
            />
          )}
          {canFullscreen && (
            <TileActionButton
              label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void handleFullscreen()}
              icon={
                isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )
              }
            />
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--pc-surface)]">
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isCurrentUser}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] font-mono text-[30px] font-bold text-[var(--pc-text)]">
            {initials}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t-2 border-[var(--pc-border)] bg-[var(--pc-surface-2)] px-[10px] py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--pc-text)]">
            {isCurrentUser ? "You" : participant.username}
          </div>
          <div className="font-mono text-[10px] text-[var(--pc-text)]">{stateLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          {isPinned && <StatusBadge label="P" enabled />}
          <StatusBadge label="M" enabled={participant.is_mic_enabled} />
          <StatusBadge label="C" enabled={showVideo} />
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--pc-text)]">
            {stripLabel}
          </div>
        </div>
      </div>
    </div>
  );
};

const ScreenShareTile: React.FC<{
  participant: RoomVoiceParticipantState;
  screenShareTrack?: Track;
  screenShareAudioTrack?: Track;
  isCurrentUser?: boolean;
  className?: string;
  isFocused?: boolean;
  canFocus?: boolean;
  canFullscreen?: boolean;
  canPin?: boolean;
  isPinned?: boolean;
  isSpeaking?: boolean;
  onFocusToggle?: () => void;
  onPinToggle?: () => void;
  onFullscreenError?: (message: string) => void;
  onSelect?: () => void;
}> = ({
  participant,
  screenShareTrack,
  screenShareAudioTrack,
  isCurrentUser = false,
  className,
  isFocused = false,
  canFocus = true,
  canFullscreen = true,
  canPin = false,
  isPinned = false,
  isSpeaking = false,
  onFocusToggle,
  onPinToggle,
  onFullscreenError,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !screenShareTrack) {
      return undefined;
    }

    const track = screenShareTrack as VideoTrack;
    track.attach(videoRef.current);

    return () => {
      track.detach(videoRef.current!);
    };
  }, [screenShareTrack]);

  useEffect(() => {
    if (isCurrentUser || !audioRef.current || !screenShareAudioTrack) {
      return undefined;
    }

    const track = screenShareAudioTrack as AudioTrack;
    track.attach(audioRef.current);

    return () => {
      track.detach(audioRef.current!);
    };
  }, [screenShareAudioTrack, isCurrentUser]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (!screenShareTrack) {
    return null;
  }

  const handleFullscreen = async () => {
    if (!containerRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === containerRef.current) {
        if (!document.exitFullscreen) {
          onFullscreenError?.("Fullscreen exit is not available in this browser");
          return;
        }
        await document.exitFullscreen();
        return;
      }

      const requestFullscreen = containerRef.current.requestFullscreen?.bind(containerRef.current);
      if (!requestFullscreen) {
        onFullscreenError?.("Fullscreen is not available in this browser");
        return;
      }

      await requestFullscreen();
    } catch (error) {
      onFullscreenError?.(getFullscreenToggleError(error));
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden border-[3px] border-[var(--pc-border)] bg-[var(--pc-surface)] p-[3px] ${getSpeakingTileClasses(isSpeaking)} ${
        className ?? "min-h-[16rem]"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}

      {(canFocus || canFullscreen || (canPin && onPinToggle)) && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 border border-[var(--pc-border)] bg-[color-mix(in_srgb,var(--pc-bg)_74%,transparent)] p-1 opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {canPin && onPinToggle && (
            <TileActionButton
              label={isPinned ? "Unpin" : "Pin"}
              onClick={onPinToggle}
              icon={<Pin className="h-3.5 w-3.5" />}
              isActive={isPinned}
            />
          )}
          {canFocus && onFocusToggle && (
            <TileActionButton
              label={isFocused ? "Exit focus" : "Expand"}
              onClick={onFocusToggle}
              icon={
                isFocused ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )
              }
            />
          )}
          {canFullscreen && (
            <TileActionButton
              label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void handleFullscreen()}
              icon={
                isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )
              }
            />
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--pc-surface)]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
      </div>

      <div className="flex items-center justify-between border-t-2 border-[var(--pc-border)] bg-[var(--pc-surface-2)] px-[10px] py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--pc-text)]">
            {isCurrentUser ? "You" : participant.username}
          </div>
          <div className="font-mono text-[10px] text-[var(--pc-text)]">Screen share</div>
        </div>
        <div className="flex items-center gap-2">
          {isPinned && <StatusBadge label="P" enabled />}
          <StatusBadge label="S" enabled />
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--pc-text)]">
            {isSpeaking ? "Share audio" : "Share live"}
          </div>
        </div>
      </div>
    </div>
  );
};

const StageTileShell: React.FC<{
  layout: StageTileLayout;
  stageSize: { width: number; height: number };
  aspectRatio: number;
  minWidth: number;
  zoom?: number;
  snapToGridEnabled?: boolean;
  editable?: boolean;
  isPinned?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onLayoutChange: (nextLayout: StageTileLayout) => void;
  onBringToFront: () => void;
  children: React.ReactNode;
}> = ({
  layout,
  stageSize,
  aspectRatio,
  minWidth,
  zoom = 1,
  snapToGridEnabled = true,
  editable = true,
  isPinned = false,
  isSelected = false,
  onSelect,
  onLayoutChange,
  onBringToFront,
  children,
}) => {
  const dragStateRef = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startWidth: number;
    startHeight: number;
    startX: number;
    startY: number;
    stageLeft: number;
    stageTop: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const nextLayout =
        dragState.mode === "move"
          ? snapStageLayout(
              {
                ...layout,
                x: (event.clientX - dragState.stageLeft - dragState.offsetX) / zoom,
                y: (event.clientY - dragState.stageTop - dragState.offsetY) / zoom,
              },
              stageSize,
              { enabled: snapToGridEnabled }
            )
          : (() => {
              const deltaX = (event.clientX - dragState.startX) / zoom;
              const nextWidth = clamp(
                dragState.startWidth + deltaX,
                minWidth,
                stageSize.width - layout.x
              );
              const nextHeight = Math.round(nextWidth / aspectRatio);

              return snapStageLayout(
                {
                  ...layout,
                  w: nextWidth,
                  h: clamp(nextHeight, 120, stageSize.height - layout.y),
                },
                stageSize,
                { enabled: snapToGridEnabled, snapWidth: true, snapHeight: true }
              );
            })();

      onLayoutChange(nextLayout);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [aspectRatio, layout, minWidth, onLayoutChange, snapToGridEnabled, stageSize, zoom]);

  return (
    <div
      data-stage-tile="true"
      onPointerDown={(event) => {
        if (!editable) {
          onSelect?.();
          return;
        }

        if (event.button !== 0) {
          return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) {
          return;
        }

        dragStateRef.current = {
          mode: "move",
          pointerId: event.pointerId,
          offsetX:
            event.clientX -
            ((event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().left ?? 0) -
            layout.x * zoom,
          offsetY:
            event.clientY -
            ((event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().top ?? 0) -
            layout.y * zoom,
          startWidth: layout.w,
          startHeight: layout.h,
          startX: event.clientX,
          startY: event.clientY,
          stageLeft:
            (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().left ?? 0,
          stageTop:
            (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().top ?? 0,
        };
        onBringToFront();
        onSelect?.();
      }}
      onMouseDown={editable ? onBringToFront : undefined}
      className={`group absolute touch-none select-none transition-shadow ${
        isSelected
          ? "shadow-[0_0_0_3px_var(--pc-action-inverse-bg),0_0_28px_rgba(0,0,0,0.32)]"
          : editable
            ? "hover:shadow-[0_0_0_2px_var(--pc-border)]"
            : ""
      }`}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
        zIndex: layout.z + (isPinned ? 10000 : 0),
      }}
    >
      {children}
      {editable && (
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            dragStateRef.current = {
              mode: "resize",
              pointerId: event.pointerId,
              offsetX: 0,
              offsetY: 0,
            startWidth: layout.w,
            startHeight: layout.h,
            startX: event.clientX,
            startY: event.clientY,
            stageLeft:
              (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().left ?? 0,
            stageTop:
              (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().top ?? 0,
          };
          onBringToFront();
          onSelect?.();
          }}
          className={`absolute bottom-2 right-2 z-20 flex h-5 w-5 items-center justify-center border border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] transition-opacity ${
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          title="Resize tile"
        >
          <span className="pointer-events-none font-mono text-[10px] leading-none">+</span>
        </button>
      )}
    </div>
  );
};

export default function RoomPage(): JSX.Element {
  const { roomID } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const {
    state: roomVoiceState,
    joinRoomVoiceSession,
    leaveRoomVoiceSession,
    toggleRoomVoiceMic,
    toggleRoomVoiceCamera,
    toggleRoomVoiceScreenShare,
    clearRoomVoiceError,
    getLocalVideoTrack,
    getLocalScreenShareTrack,
  } = useRoomVoice();

  const routeRoomName =
    (location.state as { roomName?: string } | null)?.roomName ??
    (roomID ? decodeURIComponent(roomID) : "");
  const roomIdentifier = String(roomID ?? "");

  const [roomState, setRoomState] = useState<RoomStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  const [selectedStageTileId, setSelectedStageTileId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<RoomLayoutMode>("grid");
  const [layoutPreference, setLayoutPreference] = useState<StageLayoutPreference>(() =>
    getStageLayoutPreference()
  );
  const [personalStageLayouts, setPersonalStageLayouts] = useState<StageLayoutMap>({});
  const [personalPinnedTileIds, setPersonalPinnedTileIds] = useState<string[]>([]);
  const [sharedStageLayouts, setSharedStageLayouts] = useState<StageLayoutMap>({});
  const [sharedPinnedTileIds, setSharedPinnedTileIds] = useState<string[]>([]);
  const [showStageGrid, setShowStageGrid] = useState(true);
  const [stageSize, setStageSize] = useState(defaultStageSize);
  const [stageViewportSize, setStageViewportSize] = useState(defaultStageViewportSize);
  const [stageViewOffset, setStageViewOffset] = useState<StageViewportOffset>({ x: 0, y: 0 });
  const [stageZoom, setStageZoom] = useState(1);
  const [sharedSyncNonce, setSharedSyncNonce] = useState(0);
  const autoRejoinAttemptRef = useRef<string | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement>(null);
  const stagePanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pendingSharedSyncRef = useRef(false);
  const sharedSyncTimeoutRef = useRef<number | null>(null);
  const sharedStageLayoutsRef = useRef<StageLayoutMap>({});
  const sharedPinnedTileIdsRef = useRef<string[]>([]);
  const lastSharedEditAtRef = useRef(0);

  const getRoomDisplayName = useCallback(
    (rawName: string, membersList: RoomStateResponse["members"]) => {
      if (!rawName.startsWith("__direct__:")) {
        return rawName;
      }

      const otherMember = membersList.find((member) => member.user_id !== user?.user_id);
      if (otherMember?.username) {
        return `Private voice with ${otherMember.username}`;
      }

      return routeRoomName || "Private voice room";
    },
    [routeRoomName, user?.user_id]
  );

  const loadRoomState = useCallback(async () => {
    if (!token || !roomIdentifier) return;

    try {
      const state = await fetchRoomState(roomIdentifier, token);
      setRoomState(state);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch room state";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [roomIdentifier, token]);

  useEffect(() => {
    if (!token || !roomIdentifier) return;

    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      try {
        await joinRoomAsMember(roomIdentifier, token);
        if (!cancelled) {
          await loadRoomState();
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to join room";
          setError(message);
          setIsLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadRoomState, roomIdentifier, token]);

  useEffect(() => {
    if (!roomIdentifier) {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(getStageStorageKey(roomIdentifier));
      if (!rawValue) {
        setLayoutMode("grid");
        setPersonalStageLayouts({});
        setPersonalPinnedTileIds([]);
        return;
      }

      const parsed = JSON.parse(rawValue) as StageStorageState;

      setLayoutMode(parsed.layoutMode === "stage" ? "stage" : "grid");
      setPersonalStageLayouts(parsed.personalStageLayouts ?? parsed.stageLayouts ?? {});
      setPersonalPinnedTileIds(parsed.personalPinnedTileIds ?? parsed.pinnedTileIds ?? []);
      setShowStageGrid(parsed.showStageGrid ?? true);
      const nextZoom = clamp(parsed.stageZoom ?? 1, minStageZoom, maxStageZoom);
      setStageZoom(nextZoom);
      setStageViewOffset(
        parsed.stageViewOffset ?? getCenteredStageViewOffset(stageSize, stageViewportSize, nextZoom)
      );
    } catch {
      setLayoutMode("grid");
      setPersonalStageLayouts({});
      setPersonalPinnedTileIds([]);
      setShowStageGrid(true);
      setStageZoom(1);
      setStageViewOffset(getCenteredStageViewOffset(stageSize, stageViewportSize, 1));
    }
  }, [roomIdentifier, stageSize, stageViewportSize]);

  useEffect(() => {
    if (!roomIdentifier) {
      return;
    }

    window.localStorage.setItem(
      getStageStorageKey(roomIdentifier),
      JSON.stringify({
        layoutMode,
        personalStageLayouts,
        personalPinnedTileIds,
        showStageGrid,
        stageViewOffset,
        stageZoom,
      })
    );
  }, [layoutMode, personalPinnedTileIds, personalStageLayouts, roomIdentifier, showStageGrid, stageViewOffset, stageZoom]);

  useEffect(() => {
    setLayoutPreference(getStageLayoutPreference());
  }, [roomIdentifier]);

  useEffect(() => {
    sharedStageLayoutsRef.current = sharedStageLayouts;
  }, [sharedStageLayouts]);

  useEffect(() => {
    sharedPinnedTileIdsRef.current = sharedPinnedTileIds;
  }, [sharedPinnedTileIds]);

  useEffect(() => {
    if (!roomState?.stage_layout || pendingSharedSyncRef.current) {
      return;
    }

    if (Date.now() - lastSharedEditAtRef.current < 1500) {
      return;
    }

    setSharedStageLayouts(roomState.stage_layout.stage_layouts ?? {});
    setSharedPinnedTileIds(roomState.stage_layout.pinned_tile_ids ?? []);
  }, [roomState?.stage_layout]);

  useEffect(() => {
    const updateStageSize = () => {
      const nextWidth = stageCanvasRef.current?.clientWidth ?? defaultStageViewportSize.width;
      const nextHeight = stageCanvasRef.current?.clientHeight ?? defaultStageViewportSize.height;
      setStageViewportSize({
        width: Math.max(nextWidth, 640),
        height: Math.max(nextHeight, 420),
      });
    };

    updateStageSize();
    window.addEventListener("resize", updateStageSize);

    return () => window.removeEventListener("resize", updateStageSize);
  }, []);

  useEffect(() => {
    setStageSize(defaultStageSize);
  }, []);

  useEffect(() => {
    setStageViewOffset((current) => {
      const currentIsZero = current.x === 0 && current.y === 0;
      const nextOffset = currentIsZero
        ? getCenteredStageViewOffset(stageSize, stageViewportSize, stageZoom)
        : clampStageViewOffset(current, stageSize, stageViewportSize, stageZoom);

      return nextOffset.x === current.x && nextOffset.y === current.y ? current : nextOffset;
    });
  }, [stageSize, stageViewportSize, stageZoom]);

  useEffect(() => {
    if (!token || !roomIdentifier) return;

    const interval = setInterval(() => {
      void loadRoomState();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadRoomState, roomIdentifier, token]);

  const roomName = getRoomDisplayName(roomState?.room.name || routeRoomName, roomState?.members ?? []);
  const voiceParticipants = roomState?.voice_participants ?? [];
  const members = roomState?.members ?? [];
  const canEditSharedStageLayout = roomState?.stage_layout.can_edit_shared ?? false;
  const isSharedStageLocked = roomState?.stage_layout.shared_locked ?? false;
  const activeStageLayouts =
    layoutPreference === "shared" ? sharedStageLayouts : personalStageLayouts;
  const activePinnedTileIds =
    layoutPreference === "shared" ? sharedPinnedTileIds : personalPinnedTileIds;
  const canEditStageLayout =
    layoutPreference === "personal" || canEditSharedStageLayout;
  const isCurrentRoomSession =
    roomVoiceState.roomId === roomIdentifier && roomVoiceState.status !== "idle";
  const inVoice = Boolean(roomState?.in_voice) || isCurrentRoomSession;
  const liveParticipantsByUserId = useMemo(
    () => new Map(roomVoiceState.participants.map((participant) => [participant.identity, participant])),
    [roomVoiceState.participants]
  );
  const localVideoTrack = getLocalVideoTrack();
  const localScreenShareTrack = getLocalScreenShareTrack();
  const myVoiceState = useMemo(
    () => voiceParticipants.find((participant) => participant.user_id === user?.user_id) ?? null,
    [voiceParticipants, user?.user_id]
  );
  const displayedVoiceParticipants =
    voiceParticipants.length > 0
      ? voiceParticipants
      : isCurrentRoomSession && user
        ? [
            {
              id: user.id,
              user_id: user.user_id,
              username: user.username,
              name: user.name,
              is_online: user.is_online,
              is_mic_enabled: !roomVoiceState.localMuted,
              is_camera_enabled: !roomVoiceState.localCameraOff,
              is_screen_sharing: roomVoiceState.screenSharing,
              joined_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        : [];

  const screenShareTiles = useMemo(
    () =>
      displayedVoiceParticipants
        .map((participant) => {
          const liveParticipant = liveParticipantsByUserId.get(participant.user_id);
          const isLocalParticipant = participant.user_id === user?.user_id;
          const isActivelySharing =
            isLocalParticipant && isCurrentRoomSession
              ? roomVoiceState.screenSharing
              : participant.is_screen_sharing;
          const screenShareTrack = isLocalParticipant
            ? localScreenShareTrack ?? liveParticipant?.screenShareTrack
            : liveParticipant?.screenShareTrack;
          const screenShareAudioTrack = liveParticipant?.screenShareAudioTrack;

          if (!isActivelySharing || !screenShareTrack) {
            return null;
          }

          return {
            participant,
            screenShareTrack,
            screenShareAudioTrack,
          };
        })
        .filter(
          (
            tile
          ): tile is {
            participant: RoomVoiceParticipantState;
            screenShareTrack: Track;
            screenShareAudioTrack: Track | undefined;
          } => tile !== null
        ),
    [
      displayedVoiceParticipants,
      isCurrentRoomSession,
      liveParticipantsByUserId,
      localScreenShareTrack,
      roomVoiceState.screenSharing,
      user?.user_id,
    ]
  );

  const visualTiles = useMemo<VisualTile[]>(
    () => [
      ...displayedVoiceParticipants.flatMap((participant) => {
        const liveParticipant = liveParticipantsByUserId.get(participant.user_id);
        const cameraTrack =
          participant.user_id === user?.user_id
            ? localVideoTrack ?? liveParticipant?.cameraTrack
            : liveParticipant?.cameraTrack;

        if (!cameraTrack || liveParticipant?.isCameraOff) {
          return [];
        }

        return [
          {
            id: `camera:${participant.user_id}`,
            kind: "camera" as const,
            participant,
            track: cameraTrack,
          },
        ];
      }),
      ...screenShareTiles.map(({ participant, screenShareTrack, screenShareAudioTrack }) => ({
        id: `screen-share:${participant.user_id}`,
        kind: "screen-share" as const,
        participant,
        track: screenShareTrack,
        audioTrack: screenShareAudioTrack,
      })),
    ],
    [displayedVoiceParticipants, liveParticipantsByUserId, localVideoTrack, screenShareTiles, user?.user_id]
  );

  const stageTiles = useMemo(
    () => [
      ...displayedVoiceParticipants.map((participant) => {
        const liveParticipant = liveParticipantsByUserId.get(participant.user_id);
        const cameraTrack =
          participant.user_id === user?.user_id
            ? localVideoTrack ?? liveParticipant?.cameraTrack
            : liveParticipant?.cameraTrack;

        return {
          id: `camera:${participant.user_id}`,
          kind: "camera" as const,
          participant,
          track: cameraTrack,
          audioTrack: liveParticipant?.audioTrack,
          isCameraOff: liveParticipant?.isCameraOff,
          hasVisual: Boolean(cameraTrack) && !liveParticipant?.isCameraOff,
        };
      }),
      ...screenShareTiles.map(({ participant, screenShareTrack, screenShareAudioTrack }) => ({
        id: `screen-share:${participant.user_id}`,
        kind: "screen-share" as const,
        participant,
        track: screenShareTrack,
        audioTrack: screenShareAudioTrack,
        isCameraOff: false,
        hasVisual: true,
      })),
    ],
    [displayedVoiceParticipants, liveParticipantsByUserId, localVideoTrack, screenShareTiles, user?.user_id]
  );
  const setActiveStageLayouts = useCallback(
    (
      next:
        | StageLayoutMap
        | ((current: StageLayoutMap) => StageLayoutMap)
    ) => {
      if (layoutPreference === "shared") {
        setSharedStageLayouts((current) => {
          const resolved = typeof next === "function" ? next(current) : next;
          if (areStageLayoutsEqual(current, resolved)) {
            return current;
          }

          lastSharedEditAtRef.current = Date.now();
          setSharedSyncNonce((value) => value + 1);
          return resolved;
        });
        return;
      }

      setPersonalStageLayouts((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        return areStageLayoutsEqual(current, resolved) ? current : resolved;
      });
    },
    [layoutPreference]
  );
  const setActivePinnedTileIds = useCallback(
    (
      next:
        | string[]
        | ((current: string[]) => string[])
    ) => {
      if (layoutPreference === "shared") {
        setSharedPinnedTileIds((current) => {
          const resolved = typeof next === "function" ? next(current) : next;
          if (areStringArraysEqual(current, resolved)) {
            return current;
          }

          lastSharedEditAtRef.current = Date.now();
          setSharedSyncNonce((value) => value + 1);
          return resolved;
        });
        return;
      }

      setPersonalPinnedTileIds((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        return areStringArraysEqual(current, resolved) ? current : resolved;
      });
    },
    [layoutPreference]
  );
  const orderedStageTiles = useMemo(
    () => orderStageTiles(stageTiles, activePinnedTileIds),
    [activePinnedTileIds, stageTiles]
  );

  const focusedTile = focusedTileId
    ? visualTiles.find((tile) => tile.id === focusedTileId) ?? null
    : null;
  const activeSpeakerIds = new Set(roomVoiceState.activeSpeakerIds);
  const activeScreenShareSpeakerIds = new Set(roomVoiceState.activeScreenShareSpeakerIds);
  const focusStripTiles = focusedTile
    ? [
        ...displayedVoiceParticipants
          .filter((participant) => `camera:${participant.user_id}` !== focusedTile.id)
          .map((participant) => ({ kind: "participant" as const, participant })),
        ...screenShareTiles
          .filter(({ participant }) => `screen-share:${participant.user_id}` !== focusedTile.id)
          .map(({ participant, screenShareTrack, screenShareAudioTrack }) => ({
            kind: "screen-share" as const,
            participant,
            screenShareTrack,
            screenShareAudioTrack,
          })),
      ]
    : [];

  const canToggleMedia = isCurrentRoomSession && roomVoiceState.status === "active" && !isSubmitting;
  const isStageMode = layoutMode === "stage";
  const isCreator = members.some(
    (member) => member.user_id === user?.user_id && member.role === "creator"
  );

  const handleResetStageLayout = () => {
    setSelectedStageTileId(null);
    setActiveStageLayouts(
      Object.fromEntries(
        orderedStageTiles.map((tile) => [
          tile.id,
          getDefaultStageTileLayout(tile, orderedStageTiles, stageSize),
        ])
      )
    );
  };

  const handleCenterStageView = () => {
    setStageViewOffset(getCenteredStageViewOffset(stageSize, stageViewportSize, stageZoom));
  };

  const handleSetStageZoom = useCallback(
    (nextZoomValue: number, anchor?: { x: number; y: number }) => {
      const nextZoom = clamp(Number(nextZoomValue.toFixed(2)), minStageZoom, maxStageZoom);
      if (nextZoom === stageZoom) {
        return;
      }

      const nextOffset = clampStageViewOffset(
        anchor
          ? getZoomAnchoredStageViewOffset(anchor, stageViewOffset, stageZoom, nextZoom)
          : stageViewOffset,
        stageSize,
        stageViewportSize,
        nextZoom
      );

      setStageZoom(nextZoom);
      setStageViewOffset(nextOffset);
    },
    [stageSize, stageViewportSize, stageViewOffset, stageZoom]
  );

  const handleAdjustStageZoom = (direction: "in" | "out", anchor?: { x: number; y: number }) => {
    handleSetStageZoom(stageZoom + (direction === "in" ? 0.1 : -0.1), anchor);
  };

  const handleResetStageZoom = () => {
    handleSetStageZoom(1);
  };

  const handleTogglePinnedTile = (tileId: string) => {
    const nextZ = Math.max(1, ...Object.values(activeStageLayouts).map((layout) => layout.z + 1));

    setActivePinnedTileIds((current) =>
      current.includes(tileId) ? current.filter((id) => id !== tileId) : [...current, tileId]
    );
    setActiveStageLayouts((current) => ({
      ...current,
      [tileId]: current[tileId]
        ? {
            ...current[tileId],
            z: nextZ,
          }
        : current[tileId],
    }));
  };

  const handleToggleSharedStageLock = async () => {
    if (!token || !roomIdentifier || !isCreator) {
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRoomSharedStageLayoutLock(roomIdentifier, !isSharedStageLocked, token);
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shared stage lock");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (layoutMode !== "stage") {
      setSelectedStageTileId(null);
      return;
    }

    setFocusedTileId(null);
  }, [layoutMode]);

  useEffect(() => {
    if (!selectedStageTileId) {
      return;
    }

    if (orderedStageTiles.some((tile) => tile.id === selectedStageTileId)) {
      return;
    }

    setSelectedStageTileId(null);
  }, [orderedStageTiles, selectedStageTileId]);

  useEffect(() => {
    if (orderedStageTiles.length === 0) {
      setActiveStageLayouts({});
      return;
    }

    setActiveStageLayouts((current) => {
      const nextLayouts: StageLayoutMap = {};

      orderedStageTiles.forEach((tile) => {
        const existing = current[tile.id];
        nextLayouts[tile.id] = existing
          ? clampStageLayout(existing, stageSize)
          : getDefaultStageTileLayout(tile, orderedStageTiles, stageSize);
      });

      return nextLayouts;
    });
  }, [orderedStageTiles, setActiveStageLayouts, stageSize]);

  useEffect(() => {
    if (sharedSyncTimeoutRef.current !== null) {
      window.clearTimeout(sharedSyncTimeoutRef.current);
      sharedSyncTimeoutRef.current = null;
    }

    if (
      sharedSyncNonce === 0 ||
      layoutPreference !== "shared" ||
      !token ||
      !roomIdentifier ||
      !canEditSharedStageLayout
    ) {
      pendingSharedSyncRef.current = false;
      return;
    }

    pendingSharedSyncRef.current = true;
    sharedSyncTimeoutRef.current = window.setTimeout(() => {
      void updateRoomSharedStageLayout(
        roomIdentifier,
        {
          stage_layouts: sharedStageLayoutsRef.current,
          pinned_tile_ids: sharedPinnedTileIdsRef.current,
        },
        token
      )
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to sync shared stage layout");
        })
        .finally(() => {
          pendingSharedSyncRef.current = false;
          sharedSyncTimeoutRef.current = null;
        });
    }, 300);

    return () => {
      if (sharedSyncTimeoutRef.current !== null) {
        window.clearTimeout(sharedSyncTimeoutRef.current);
        sharedSyncTimeoutRef.current = null;
      }
    };
  }, [
    canEditSharedStageLayout,
    layoutPreference,
    roomIdentifier,
    sharedSyncNonce,
    token,
  ]);

  useEffect(() => {
    if (
      !roomState?.in_voice ||
      !token ||
      !roomIdentifier ||
      isCurrentRoomSession ||
      roomVoiceState.status !== "idle" ||
      autoRejoinAttemptRef.current === roomIdentifier
    ) {
      return undefined;
    }

    let cancelled = false;
    autoRejoinAttemptRef.current = roomIdentifier;

    const reconnectVoice = async () => {
      try {
        await joinRoomVoiceSession(roomIdentifier, roomName || routeRoomName || roomIdentifier);
        if (!cancelled) {
          await loadRoomState();
        }
      } catch (err) {
        if (!cancelled) {
          autoRejoinAttemptRef.current = null;
          setError(err instanceof Error ? err.message : "Failed to reconnect room voice");
        }
      }
    };

    void reconnectVoice();

    return () => {
      cancelled = true;
    };
  }, [
    isCurrentRoomSession,
    joinRoomVoiceSession,
    loadRoomState,
    roomIdentifier,
    roomName,
    roomState?.in_voice,
    roomVoiceState.status,
    routeRoomName,
    token,
  ]);

  useEffect(() => {
    if (!focusedTileId) {
      return;
    }

    if (visualTiles.some((tile) => tile.id === focusedTileId)) {
      return;
    }

    setFocusedTileId(visualTiles[0]?.id ?? null);
  }, [focusedTileId, visualTiles]);

  const handleJoinVoice = async () => {
    if (!token || !roomIdentifier) return;
    setIsSubmitting(true);
    try {
      await joinRoomVoiceSession(roomIdentifier, roomName || routeRoomName || roomIdentifier);
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join voice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeaveVoice = async () => {
    if (!roomIdentifier) return;
    setIsSubmitting(true);
    try {
      await leaveRoomVoiceSession(roomIdentifier);
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave voice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleMic = async () => {
    if (!isCurrentRoomSession) return;
    setIsSubmitting(true);
    try {
      await toggleRoomVoiceMic();
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle microphone");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCamera = async () => {
    if (!isCurrentRoomSession) return;
    setIsSubmitting(true);
    try {
      await toggleRoomVoiceCamera();
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle camera");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleScreenShare = async () => {
    if (!isCurrentRoomSession) return;
    setIsSubmitting(true);
    try {
      await toggleRoomVoiceScreenShare();
      await loadRoomState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle screen share");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (roomVoiceState.error) {
      setError(roomVoiceState.error);
      clearRoomVoiceError();
    }
  }, [clearRoomVoiceError, roomVoiceState.error]);

  const stageColumnsClass = (() => {
    const tileCount = displayedVoiceParticipants.length + screenShareTiles.length;
    if (tileCount <= 1) return "grid-cols-1";
    if (tileCount === 2) return "grid-cols-1 xl:grid-cols-2";
    return "grid-cols-1 lg:grid-cols-3";
  })();

  const inVoiceMemberIds = new Set(displayedVoiceParticipants.map((participant) => participant.user_id));
  const roomTitle = `POWER-CALL ${roomName}`.toUpperCase();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] text-[var(--pc-text)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin border-2 border-[var(--pc-border)] border-t-transparent" />
          <p className="font-mono text-sm uppercase tracking-[0.2em]">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error && !roomState) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] px-4 text-[var(--pc-text)]">
        <div className={`w-full max-w-xl p-6 ${shellClass}`}>
          <div className={`${monoMetaClass} mb-3`}>Power-Call // Error</div>
          <h2 className="mb-3 text-xl font-semibold">Room Error</h2>
          <p className="mb-6 text-sm text-[var(--pc-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-4 py-2 font-mono text-sm font-bold uppercase tracking-[0.18em] text-[var(--pc-action-inverse-text)]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--pc-bg)] text-[var(--pc-text)]">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className={`flex min-h-16 items-center justify-between px-4 ${shellClass} border-l-0 border-r-0 border-t-0`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-action-bg)] transition-colors hover:bg-[var(--pc-action-hover)]"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate font-mono text-sm font-bold uppercase tracking-[0.16em]">
                {roomTitle}
              </div>
              <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--pc-text-soft)]">
                Voice channel // live session
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-[10px]">
            <div className="flex h-10 items-center border-2 border-[var(--pc-border)]">
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={`flex h-full items-center px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  layoutMode === "grid"
                    ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)]"
                    : "bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("stage")}
                className={`flex h-full items-center px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  layoutMode === "stage"
                    ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)]"
                    : "bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]"
                }`}
              >
                Stage
              </button>
            </div>
            {isStageMode && (
              <>
                <div className="hidden h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] lg:flex">
                  {layoutPreference === "shared" ? "Shared Layout" : "Personal Layout"}
                </div>
                {layoutPreference === "shared" && isCreator && (
                  <button
                    type="button"
                    onClick={() => void handleToggleSharedStageLock()}
                    disabled={isSubmitting}
                    className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:opacity-40"
                  >
                    {isSharedStageLocked ? "Unlock Shared" : "Lock Shared"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowStageGrid((current) => !current)}
                  className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)]"
                >
                  Grid {showStageGrid ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={handleCenterStageView}
                  className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)]"
                >
                  Center View
                </button>
                <div className="flex h-10 items-center border-2 border-[var(--pc-border)]">
                  <button
                    type="button"
                    onClick={() => handleAdjustStageZoom("out")}
                    className="flex h-full items-center px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[var(--pc-surface-strong)]"
                  >
                    -
                  </button>
                  <div className="flex h-full min-w-[72px] items-center justify-center border-l-2 border-r-2 border-[var(--pc-border)] px-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
                    {Math.round(stageZoom * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdjustStageZoom("in")}
                    className="flex h-full items-center px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[var(--pc-surface-strong)]"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleResetStageZoom}
                  className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)]"
                >
                  Reset Zoom
                </button>
                <button
                  type="button"
                  onClick={handleResetStageLayout}
                  disabled={!canEditStageLayout}
                  className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[14px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset
                </button>
              </>
            )}
            <div className="flex h-9 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-action-bg)] px-[10px] font-mono text-xs font-bold uppercase tracking-[0.14em]">
              {formatOnlineCount(members.length)}
            </div>
            {inVoice ? (
              <button
                type="button"
                onClick={() => void handleLeaveVoice()}
                disabled={isSubmitting}
                className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-[14px] font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)] disabled:opacity-40"
              >
                Leave
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleJoinVoice()}
                disabled={isSubmitting}
                className="flex h-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-[14px] font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)] disabled:opacity-40"
              >
                Join
              </button>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-[10px]">
          {layoutMode === "grid" && focusedTile ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1">
                {focusedTile.kind === "camera" ? (
                  <VoiceTile
                    participant={focusedTile.participant}
                    isCurrentUser={focusedTile.participant.user_id === user?.user_id}
                    isCameraOff={false}
                    cameraTrack={focusedTile.track}
                    audioTrack={liveParticipantsByUserId.get(focusedTile.participant.user_id)?.audioTrack}
                    className="h-full min-h-[24rem]"
                    isFocused
                    canFocus
                    canFullscreen
                    isSpeaking={isParticipantHighlighted(
                      focusedTile.participant,
                      liveParticipantsByUserId.get(focusedTile.participant.user_id)?.identity,
                      activeSpeakerIds
                    )}
                    onFocusToggle={() => setFocusedTileId(null)}
                    onFullscreenError={setError}
                  />
                ) : (
                  <ScreenShareTile
                    participant={focusedTile.participant}
                    screenShareTrack={focusedTile.track}
                    screenShareAudioTrack={focusedTile.audioTrack}
                    isCurrentUser={focusedTile.participant.user_id === user?.user_id}
                    className="h-full min-h-[24rem]"
                    isFocused
                    canFocus
                    canFullscreen
                    isSpeaking={isParticipantHighlighted(
                      focusedTile.participant,
                      liveParticipantsByUserId.get(focusedTile.participant.user_id)?.identity,
                      activeScreenShareSpeakerIds
                    )}
                    onFocusToggle={() => setFocusedTileId(null)}
                    onFullscreenError={setError}
                  />
                )}
              </div>

              {focusStripTiles.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {focusStripTiles.map((tile) => {
                    if (tile.kind === "participant") {
                      const liveParticipant = liveParticipantsByUserId.get(tile.participant.user_id);
                      const cameraTrack =
                        tile.participant.user_id === user?.user_id
                          ? localVideoTrack ?? liveParticipant?.cameraTrack
                          : liveParticipant?.cameraTrack;
                      const hasVisual = Boolean(cameraTrack) && !liveParticipant?.isCameraOff;

                      return (
                        <div
                          key={`participant-strip:${tile.participant.user_id}`}
                          className="w-[320px] min-w-[320px]"
                        >
                          <VoiceTile
                            participant={tile.participant}
                            isCurrentUser={tile.participant.user_id === user?.user_id}
                            isCameraOff={liveParticipant?.isCameraOff}
                            cameraTrack={cameraTrack}
                            audioTrack={liveParticipant?.audioTrack}
                            className="min-h-[13rem]"
                            isSpeaking={isParticipantHighlighted(
                              tile.participant,
                              liveParticipant?.identity,
                              activeSpeakerIds
                            )}
                            canFocus={hasVisual}
                            canFullscreen={hasVisual}
                            onFocusToggle={() => setFocusedTileId(`camera:${tile.participant.user_id}`)}
                            onSelect={hasVisual ? () => setFocusedTileId(`camera:${tile.participant.user_id}`) : undefined}
                            onFullscreenError={setError}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`screen-share-strip:${tile.participant.user_id}`}
                        className="w-[320px] min-w-[320px]"
                      >
                        <ScreenShareTile
                          participant={tile.participant}
                          screenShareTrack={tile.screenShareTrack}
                          screenShareAudioTrack={tile.screenShareAudioTrack}
                          isCurrentUser={tile.participant.user_id === user?.user_id}
                          className="min-h-[13rem]"
                          canFocus
                          canFullscreen
                          isSpeaking={isParticipantHighlighted(
                            tile.participant,
                            liveParticipantsByUserId.get(tile.participant.user_id)?.identity,
                            activeScreenShareSpeakerIds
                          )}
                          onFocusToggle={() => setFocusedTileId(`screen-share:${tile.participant.user_id}`)}
                          onSelect={() => setFocusedTileId(`screen-share:${tile.participant.user_id}`)}
                          onFullscreenError={setError}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : layoutMode === "stage" ? (
            <div
              ref={stageCanvasRef}
              onWheel={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest("[data-stage-tile='true']")) {
                  return;
                }

                event.preventDefault();

                const rect = stageCanvasRef.current?.getBoundingClientRect();
                if (!rect) {
                  return;
                }

                const anchor = {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                };

                handleAdjustStageZoom(event.deltaY < 0 ? "in" : "out", anchor);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                const target = event.target as HTMLElement | null;
                if (target?.closest("[data-stage-tile='true']") || target?.closest("button")) {
                  return;
                }

                stagePanRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: stageViewOffset.x,
                  originY: stageViewOffset.y,
                };
              }}
              onPointerMove={(event) => {
                const panState = stagePanRef.current;
                if (!panState || panState.pointerId !== event.pointerId) {
                  return;
                }

                setStageViewOffset(
                  clampStageViewOffset(
                    {
                      x: panState.originX + (event.clientX - panState.startX),
                      y: panState.originY + (event.clientY - panState.startY),
                    },
                    stageSize,
                    stageViewportSize,
                    stageZoom
                  )
                );
              }}
              onPointerUp={(event) => {
                if (stagePanRef.current?.pointerId === event.pointerId) {
                  stagePanRef.current = null;
                }
              }}
              onPointerLeave={(event) => {
                if (stagePanRef.current?.pointerId === event.pointerId) {
                  stagePanRef.current = null;
                }
              }}
              className={`relative min-h-[42rem] flex-1 overflow-hidden ${shellClass} bg-[var(--pc-bg)] p-[10px] ${
                stagePanRef.current ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[var(--pc-bg)] opacity-85" />
              {layoutPreference === "shared" && !canEditStageLayout && (
                <div className="absolute left-3 top-3 z-20 border border-[var(--pc-border)] bg-[var(--pc-panel)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
                  Shared layout locked by owner
                </div>
              )}
              {displayedVoiceParticipants.length === 0 ? (
                <div className="relative z-10 flex h-full min-h-[20rem] items-center justify-center p-8">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-[var(--pc-border)]">
                      <Radio className="h-7 w-7" />
                    </div>
                    <div className="mb-2 font-mono text-sm font-bold uppercase tracking-[0.18em]">
                      Voice channel is empty
                    </div>
                    <p className="mb-5 text-sm text-[var(--pc-text-muted)]">
                      Join the room to start talking, turn on your camera, or share your screen.
                    </p>
                    {!inVoice && (
                      <button
                        type="button"
                        onClick={() => void handleJoinVoice()}
                        disabled={isSubmitting}
                        className="border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[var(--pc-action-inverse-text)] disabled:opacity-40"
                      >
                        Join Voice
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: stageSize.width,
                    height: stageSize.height,
                    transform: `translate(${stageViewOffset.x}px, ${stageViewOffset.y}px) scale(${stageZoom})`,
                    transformOrigin: "top left",
                    border: "2px solid var(--pc-border)",
                    boxShadow: "0 0 0 1px color-mix(in_srgb,var(--pc-border)_40%,transparent) inset",
                  }}
                >
                  {showStageGrid && (
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_0,transparent_39px,var(--pc-border)_40px),linear-gradient(to_bottom,transparent_0,transparent_39px,var(--pc-border)_40px)] bg-[size:40px_40px]" />
                  )}
                  {orderedStageTiles.map((tile) => {
                    const tileLayout = activeStageLayouts[tile.id];
                    if (!tileLayout) {
                      return null;
                    }

                    return (
                      <StageTileShell
                        key={tile.id}
                        layout={tileLayout}
                        stageSize={stageSize}
                        aspectRatio={getStageTileAspectRatio(tile.kind, tile.hasVisual)}
                        minWidth={tile.kind === "screen-share" ? 420 : tile.hasVisual ? 220 : 180}
                        zoom={stageZoom}
                        snapToGridEnabled={showStageGrid}
                        editable={canEditStageLayout}
                        isPinned={activePinnedTileIds.includes(tile.id)}
                        isSelected={selectedStageTileId === tile.id}
                        onSelect={() => setSelectedStageTileId(tile.id)}
                        onBringToFront={() => {
                          const nextZ = Math.max(
                            1,
                            ...Object.values(activeStageLayouts).map((layout) => layout.z + 1)
                          );
                          setActiveStageLayouts((current) => ({
                            ...current,
                            [tile.id]: {
                              ...current[tile.id],
                              z: nextZ,
                            },
                          }));
                        }}
                        onLayoutChange={(nextLayout) => {
                          setActiveStageLayouts((current) => ({
                            ...current,
                            [tile.id]: nextLayout,
                          }));
                        }}
                      >
                        {tile.kind === "camera" ? (
                          <VoiceTile
                            participant={tile.participant}
                            isCurrentUser={tile.participant.user_id === user?.user_id}
                            isCameraOff={tile.isCameraOff}
                            cameraTrack={tile.track}
                            audioTrack={tile.audioTrack}
                            className="h-full"
                            canPin={canEditStageLayout}
                            isPinned={activePinnedTileIds.includes(tile.id)}
                            isSpeaking={isParticipantHighlighted(
                              tile.participant,
                              liveParticipantsByUserId.get(tile.participant.user_id)?.identity,
                              activeSpeakerIds
                            )}
                            onPinToggle={() => handleTogglePinnedTile(tile.id)}
                            canFullscreen={tile.hasVisual}
                            onFullscreenError={setError}
                          />
                        ) : (
                          <ScreenShareTile
                            participant={tile.participant}
                            screenShareTrack={tile.track}
                            screenShareAudioTrack={tile.audioTrack}
                            isCurrentUser={tile.participant.user_id === user?.user_id}
                            className="h-full"
                            canFocus={false}
                            canPin={canEditStageLayout}
                            isPinned={activePinnedTileIds.includes(tile.id)}
                            canFullscreen
                            isSpeaking={isParticipantHighlighted(
                              tile.participant,
                              liveParticipantsByUserId.get(tile.participant.user_id)?.identity,
                              activeScreenShareSpeakerIds
                            )}
                            onPinToggle={() => handleTogglePinnedTile(tile.id)}
                            onFullscreenError={setError}
                          />
                        )}
                      </StageTileShell>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid ${stageColumnsClass} gap-[10px]`}>
              {displayedVoiceParticipants.length === 0 ? (
                <div className={`col-span-full flex min-h-[20rem] items-center justify-center p-8 ${shellClass}`}>
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-[var(--pc-border)]">
                      <Radio className="h-7 w-7" />
                    </div>
                    <div className="mb-2 font-mono text-sm font-bold uppercase tracking-[0.18em]">
                      Voice channel is empty
                    </div>
                    <p className="mb-5 text-sm text-[var(--pc-text-muted)]">
                      Join the room to start talking, turn on your camera, or share your screen.
                    </p>
                    {!inVoice && (
                      <button
                        type="button"
                        onClick={() => void handleJoinVoice()}
                        disabled={isSubmitting}
                        className="border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[var(--pc-action-inverse-text)] disabled:opacity-40"
                      >
                        Join Voice
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {displayedVoiceParticipants.map((participant) => {
                    const liveParticipant = liveParticipantsByUserId.get(participant.user_id);
                    const cameraTrack =
                      participant.user_id === user?.user_id
                        ? localVideoTrack ?? liveParticipantsByUserId.get(participant.user_id)?.cameraTrack
                        : liveParticipantsByUserId.get(participant.user_id)?.cameraTrack;
                    const hasVisual = Boolean(cameraTrack) && !liveParticipant?.isCameraOff;

                    return (
                      <VoiceTile
                        key={participant.user_id}
                        participant={participant}
                        isCurrentUser={participant.user_id === user?.user_id}
                        isCameraOff={liveParticipant?.isCameraOff}
                        cameraTrack={cameraTrack}
                        audioTrack={liveParticipantsByUserId.get(participant.user_id)?.audioTrack}
                        className="min-h-[15rem] lg:min-h-[13.5rem] xl:min-h-[15.5rem]"
                        isSpeaking={isParticipantHighlighted(
                          participant,
                          liveParticipantsByUserId.get(participant.user_id)?.identity,
                          activeSpeakerIds
                        )}
                        canFocus={hasVisual}
                        canFullscreen={hasVisual}
                        onFocusToggle={() => setFocusedTileId(`camera:${participant.user_id}`)}
                        onSelect={hasVisual ? () => setFocusedTileId(`camera:${participant.user_id}`) : undefined}
                        onFullscreenError={setError}
                      />
                    );
                  })}
                  {screenShareTiles.map(({ participant, screenShareTrack, screenShareAudioTrack }) => (
                    <ScreenShareTile
                      key={`${participant.user_id}-screen-share`}
                      participant={participant}
                      screenShareTrack={screenShareTrack}
                      screenShareAudioTrack={screenShareAudioTrack}
                      isCurrentUser={participant.user_id === user?.user_id}
                      className="min-h-[15rem] lg:min-h-[13.5rem] xl:min-h-[15.5rem]"
                      isSpeaking={isParticipantHighlighted(
                        participant,
                        liveParticipantsByUserId.get(participant.user_id)?.identity,
                        activeScreenShareSpeakerIds
                      )}
                      canFocus
                      canFullscreen
                      onFocusToggle={() => setFocusedTileId(`screen-share:${participant.user_id}`)}
                      onSelect={() => setFocusedTileId(`screen-share:${participant.user_id}`)}
                      onFullscreenError={setError}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          <section className={`flex flex-col gap-3 p-[8px_12px] ${shellClass}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-3 text-base font-semibold">Room Members</div>
                {members.map((member) => {
                  const isInVoice = inVoiceMemberIds.has(member.user_id);
                  return (
                    <div
                      key={member.user_id}
                      className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-[10px] py-2 text-[13px] text-[var(--pc-text)]"
                    >
                      {member.username}
                      {member.user_id === user?.user_id ? " (you)" : ""}
                      {isInVoice ? " • in voice" : ""}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-[10px] xl:justify-end">
                <ControlButton
                  icon={<Mic className="h-4 w-4" />}
                  activeIcon={<MicOff className="h-4 w-4" />}
                  isActive={
                    isCurrentRoomSession
                      ? !roomVoiceState.localMuted
                      : Boolean(myVoiceState?.is_mic_enabled)
                  }
                  disabled={!canToggleMedia}
                  onClick={() => void handleToggleMic()}
                  label={isCurrentRoomSession && roomVoiceState.localMuted ? "Unmute" : "Mute"}
                />

                <ControlButton
                  icon={<Video className="h-4 w-4" />}
                  activeIcon={<VideoOff className="h-4 w-4" />}
                  isActive={
                    isCurrentRoomSession
                      ? !roomVoiceState.localCameraOff
                      : Boolean(myVoiceState?.is_camera_enabled)
                  }
                  disabled={!canToggleMedia}
                  onClick={() => void handleToggleCamera()}
                  label={
                    isCurrentRoomSession && roomVoiceState.localCameraOff
                      ? "Turn on camera"
                      : "Turn off camera"
                  }
                />

                <ControlButton
                  icon={<Monitor className="h-4 w-4" />}
                  activeIcon={<MonitorOff className="h-4 w-4" />}
                  isActive={
                    isCurrentRoomSession
                      ? roomVoiceState.screenSharing
                      : Boolean(myVoiceState?.is_screen_sharing)
                  }
                  disabled={!canToggleMedia}
                  onClick={() => void handleToggleScreenShare()}
                  label={
                    isCurrentRoomSession && roomVoiceState.screenSharing
                      ? "Stop sharing"
                      : "Share screen"
                  }
                />

                <ControlButton
                  icon={<PhoneOff className="h-4 w-4" />}
                  isDanger
                  disabled={!inVoice || isSubmitting}
                  onClick={() => void handleLeaveVoice()}
                  label="Leave voice"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-danger-bg)] px-4 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--pc-text)]">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
