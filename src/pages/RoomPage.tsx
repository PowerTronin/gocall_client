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
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from "lucide-react";
import { AudioTrack, Track, VideoTrack } from "livekit-client";

import { useAuth } from "../context/AuthContext";
import { useRoomVoice } from "../context/RoomVoiceContext";
import {
  fetchRoomState,
  joinRoomAsMember,
  RoomStateResponse,
  RoomVoiceParticipantState,
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
  icon?: React.ReactNode;
}

interface VisualTile {
  id: string;
  kind: "camera" | "screen-share";
  participant: RoomVoiceParticipantState;
  track: Track;
  audioTrack?: Track;
}

const shellClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-bg)]";
const monoMetaClass = "font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--pc-text-muted)]";

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

const TileActionButton: React.FC<TileActionButtonProps> = ({ label, onClick, icon }) => {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex h-8 items-center gap-1 border border-[var(--pc-border)] bg-[var(--pc-surface-strong)] px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-action-inverse-bg)] hover:text-[var(--pc-action-inverse-text)]"
      title={label}
    >
      {icon}
      <span>{label}</span>
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
  isSpeaking?: boolean;
  onFocusToggle?: () => void;
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
  isSpeaking = false,
  onFocusToggle,
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
      className={`relative flex flex-col overflow-hidden border-[3px] border-[var(--pc-border)] bg-[var(--pc-surface)] p-[3px] ${getSpeakingTileClasses(isSpeaking)} ${
        className ?? "min-h-[16rem]"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}

      {(canFocus || canFullscreen) && (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
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
  isSpeaking?: boolean;
  onFocusToggle?: () => void;
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
  isSpeaking = false,
  onFocusToggle,
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
      className={`relative flex flex-col overflow-hidden border-[3px] border-[var(--pc-border)] bg-[var(--pc-surface)] p-[3px] ${getSpeakingTileClasses(isSpeaking)} ${
        className ?? "min-h-[16rem]"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}

      {(canFocus || canFullscreen) && (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
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
          <StatusBadge label="S" enabled />
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--pc-text)]">
            {isSpeaking ? "Share audio" : "Share live"}
          </div>
        </div>
      </div>
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
  const autoRejoinAttemptRef = useRef<string | null>(null);

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
    if (!token || !roomIdentifier) return;

    const interval = setInterval(() => {
      void loadRoomState();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadRoomState, roomIdentifier, token]);

  const roomName = getRoomDisplayName(roomState?.room.name || routeRoomName, roomState?.members ?? []);
  const voiceParticipants = roomState?.voice_participants ?? [];
  const members = roomState?.members ?? [];
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
          {focusedTile ? (
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
