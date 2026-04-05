import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Users,
  Video,
  VideoOff,
  PhoneOff,
  Radio,
} from "lucide-react";
import { motion } from "framer-motion";
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

const ControlButton: React.FC<ControlButtonProps> = ({
  icon,
  activeIcon,
  isActive = false,
  isDanger = false,
  disabled = false,
  onClick,
  label,
}) => {
  const baseClasses =
    "w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const colorClasses = isDanger
    ? "bg-red-500 hover:bg-red-600"
    : isActive
      ? "bg-gray-600 hover:bg-gray-500"
      : "bg-gray-700 hover:bg-gray-600";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${colorClasses}`}
      title={label}
    >
      {isActive && activeIcon ? activeIcon : icon}
    </button>
  );
};

const VoiceTile: React.FC<{
  participant: RoomVoiceParticipantState;
  isCurrentUser: boolean;
  videoTrack?: Track;
  audioTrack?: Track;
}> = ({ participant, isCurrentUser, videoTrack, audioTrack }) => {
  const initials = (participant.name || participant.username || "?").slice(0, 1).toUpperCase();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!videoRef.current || !videoTrack || participant.is_screen_sharing) {
      return undefined;
    }

    const track = videoTrack as VideoTrack;
    track.attach(videoRef.current);

    return () => {
      track.detach(videoRef.current!);
    };
  }, [participant.is_screen_sharing, videoTrack]);

  useEffect(() => {
    if (!videoRef.current || !videoTrack || !participant.is_screen_sharing) {
      return undefined;
    }

    const track = videoTrack as VideoTrack;
    track.attach(videoRef.current);

    return () => {
      track.detach(videoRef.current!);
    };
  }, [participant.is_screen_sharing, videoTrack]);

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

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video shadow-lg">
      {!isCurrentUser && <audio ref={audioRef} autoPlay playsInline />}
      {videoTrack && (participant.is_camera_enabled || participant.is_screen_sharing) ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isCurrentUser}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{initials}</span>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <div className="font-medium">{isCurrentUser ? "You" : participant.username}</div>
            <div className="text-xs text-white/70">
              {participant.is_screen_sharing
                ? "Screen sharing"
                : participant.is_camera_enabled
                  ? "Camera on"
                  : "Voice only"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {participant.is_mic_enabled ? (
              <Mic className="w-4 h-4 text-green-300" />
            ) : (
              <MicOff className="w-4 h-4 text-red-400" />
            )}
            {participant.is_camera_enabled ? (
              <Video className="w-4 h-4 text-green-300" />
            ) : (
              <VideoOff className="w-4 h-4 text-white/50" />
            )}
            {participant.is_screen_sharing && <Monitor className="w-4 h-4 text-blue-300" />}
          </div>
        </div>
      </div>

      {isCurrentUser && (
        <div className="absolute top-2 right-2 bg-primary rounded px-2 py-0.5">
          <span className="text-xs font-medium text-white">You</span>
        </div>
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
  } = useRoomVoice();

  const routeRoomName =
    (location.state as { roomName?: string } | null)?.roomName ??
    (roomID ? decodeURIComponent(roomID) : "");
  const roomIdentifier = String(roomID ?? "");

  const [roomState, setRoomState] = useState<RoomStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const roomName = roomState?.room.name || routeRoomName;
  const voiceParticipants = roomState?.voice_participants ?? [];
  const members = roomState?.members ?? [];
  const isCurrentRoomSession =
    roomVoiceState.roomId === roomIdentifier && roomVoiceState.status !== "idle";
  const inVoice = Boolean(roomState?.in_voice) || isCurrentRoomSession;
  const liveParticipantsByUserId = useMemo(
    () =>
      new Map(
        roomVoiceState.participants.map((participant) => [participant.identity, participant])
      ),
    [roomVoiceState.participants]
  );
  const myVoiceState = useMemo(
    () => voiceParticipants.find((participant) => participant.user_id === user?.user_id) ?? null,
    [voiceParticipants, user?.user_id]
  );

  const canToggleMedia = isCurrentRoomSession && roomVoiceState.status === "active" && !isSubmitting;

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

  const getGridClass = () => {
    const count = Math.max(displayedVoiceParticipants.length, 1);
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    return "grid-cols-4";
  };

  const displayedVoiceParticipants = voiceParticipants.length > 0
    ? voiceParticipants
    : isCurrentRoomSession && user
      ? [{
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
        }]
      : [];

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-600">Loading room...</p>
      </div>
    );
  }

  if (error && !roomState) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Room Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded bg-primary text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">Room: {roomName}</h1>
            <p className="text-sm text-white/70">
              {members.length} members, {displayedVoiceParticipants.length} in voice
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white/80">
            <Users className="w-4 h-4" />
            <span className="text-sm">{members.length}</span>
          </div>
          {inVoice ? (
            <button
              onClick={handleLeaveVoice}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <PhoneOff className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium">Leave Voice</span>
            </button>
          ) : (
            <button
              onClick={handleJoinVoice}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <Radio className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium">Join Voice</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="flex-1 p-4 overflow-auto">
              {displayedVoiceParticipants.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md p-8">
                  <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-6">
                    <Radio className="w-10 h-10 text-gray-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Voice channel is empty</h2>
                  <p className="text-gray-400 mb-6">
                    Join the room voice channel to start talking, turn on camera, or share your screen.
                  </p>
                  {!inVoice && (
                    <button
                      onClick={handleJoinVoice}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover rounded-lg transition-colors mx-auto disabled:opacity-50"
                    >
                      <Radio className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Join Voice</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={`grid ${getGridClass()} gap-4 h-full`}>
                {displayedVoiceParticipants.map((participant) => (
                  <VoiceTile
                    key={participant.user_id}
                    participant={participant}
                    isCurrentUser={participant.user_id === user?.user_id}
                    videoTrack={liveParticipantsByUserId.get(participant.user_id)?.videoTrack}
                    audioTrack={liveParticipantsByUserId.get(participant.user_id)?.audioTrack}
                  />
                ))}
              </div>
            )}
          </div>

          <section className="px-4 py-3 bg-gray-850 border-t border-gray-700">
            <h2 className="text-sm font-semibold text-white/80 mb-2">Room Members</h2>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const isInVoice = displayedVoiceParticipants.some(
                  (participant) => participant.user_id === member.user_id
                );
                return (
                  <div
                    key={member.user_id}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      isInVoice ? "bg-blue-500/20 text-blue-200" : "bg-gray-800 text-white/75"
                    }`}
                  >
                    {member.username}
                    {member.user_id === user?.user_id ? " (you)" : ""}
                    {isInVoice ? " • in voice" : ""}
                  </div>
                );
              })}
            </div>
          </section>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-4 p-4 bg-gray-800 border-t border-gray-700"
          >
            <ControlButton
              icon={<Mic className="w-5 h-5 text-white" />}
              activeIcon={<MicOff className="w-5 h-5 text-red-400" />}
              isActive={isCurrentRoomSession ? roomVoiceState.localMuted : !myVoiceState?.is_mic_enabled}
              disabled={!canToggleMedia}
              onClick={() => void handleToggleMic()}
              label={isCurrentRoomSession && roomVoiceState.localMuted ? "Unmute" : "Mute"}
            />

            <ControlButton
              icon={<Video className="w-5 h-5 text-white" />}
              activeIcon={<VideoOff className="w-5 h-5 text-red-400" />}
              isActive={isCurrentRoomSession ? roomVoiceState.localCameraOff : !myVoiceState?.is_camera_enabled}
              disabled={!canToggleMedia}
              onClick={() => void handleToggleCamera()}
              label={
                isCurrentRoomSession && roomVoiceState.localCameraOff
                  ? "Turn on camera"
                  : "Turn off camera"
              }
            />

            <ControlButton
              icon={<Monitor className="w-5 h-5 text-white" />}
              activeIcon={<MonitorOff className="w-5 h-5 text-red-400" />}
              isActive={isCurrentRoomSession ? roomVoiceState.screenSharing : Boolean(myVoiceState?.is_screen_sharing)}
              disabled={!canToggleMedia}
              onClick={() => void handleToggleScreenShare()}
              label={
                isCurrentRoomSession && roomVoiceState.screenSharing
                  ? "Stop sharing"
                  : "Share screen"
              }
            />

            <ControlButton
              icon={<PhoneOff className="w-5 h-5 text-white" />}
              isDanger
              disabled={!inVoice || isSubmitting}
              onClick={() => void handleLeaveVoice()}
              label="Leave voice"
            />
          </motion.div>

          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-400/30 text-red-200 text-sm">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
