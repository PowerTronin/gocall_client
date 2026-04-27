import React from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Monitor, MonitorOff, PhoneOff, Video, VideoOff } from "lucide-react";

import { useRoomVoice } from "../context/RoomVoiceContext";

const buttonClass =
  "flex h-9 w-9 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40";

const RoomVoiceDock: React.FC = () => {
  const navigate = useNavigate();
  const {
    state,
    toggleRoomVoiceMic,
    toggleRoomVoiceCamera,
    toggleRoomVoiceScreenShare,
    leaveRoomVoiceSession,
  } = useRoomVoice();

  if (state.status === "idle" || !state.roomId) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[320px] border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] text-[var(--pc-text)] shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b-2 border-[var(--pc-border)] px-4 py-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Room Voice
          </div>
          <div className="text-sm font-semibold text-[var(--pc-text)]">{state.roomName || state.roomId}</div>
          <div className="text-xs text-[var(--pc-text-soft)]">
            {state.status === "connecting"
              ? "Connecting..."
              : `${state.participants.length} connected`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/room/${state.roomId}`, { state: { roomName: state.roomName } })}
          className="border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)]"
        >
          Open
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleRoomVoiceMic()}
            disabled={state.status !== "active"}
            className={buttonClass}
            title={state.localMuted ? "Unmute" : "Mute"}
          >
            {state.localMuted ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleRoomVoiceCamera()}
            disabled={state.status !== "active"}
            className={buttonClass}
            title={state.localCameraOff ? "Turn on camera" : "Turn off camera"}
          >
            {state.localCameraOff ? (
              <Video className="h-4 w-4" />
            ) : (
              <VideoOff className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleRoomVoiceScreenShare()}
            disabled={state.status !== "active"}
            className={buttonClass}
            title={state.screenSharing ? "Stop sharing" : "Share screen"}
          >
            {state.screenSharing ? (
              <MonitorOff className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void leaveRoomVoiceSession()}
          className="flex h-10 w-10 items-center justify-center bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)]"
          title="Leave voice"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>

      {state.error && (
        <div className="border-t-2 border-[var(--pc-border)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text)]">
          {state.error}
        </div>
      )}
    </div>
  );
};

export default RoomVoiceDock;
