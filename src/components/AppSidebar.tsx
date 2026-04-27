import React, { useEffect, useMemo, useState } from "react";
import { MessageCircle, Mic, MicOff, Monitor, MonitorOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { APP_NAME, APP_VERSION } from "../app-meta";
import logoBlue from "../assets/logos/pt-logo-fin-blue.svg";
import logoWhite from "../assets/logos/pt-logo-fin-white.svg";
import { useAuth } from "../context/AuthContext";
import { useRoomVoice } from "../context/RoomVoiceContext";
import { useTheme } from "../context/ThemeContext";
import { fetchConversations } from "../services/conversations-api";
import { fetchPinnedFriends } from "../services/friends-api";
import { ConversationInfo, Friend } from "../types";

interface MenuItem {
  title: string;
  url: string;
}

const menuItems: MenuItem[] = [
  { title: "Home", url: "/home" },
  { title: "Friends", url: "/friends" },
  { title: "Rooms", url: "/rooms" },
  { title: "Settings", url: "/settings" },
];

const AppSidebar: React.FC = () => {
  const { user, token } = useAuth();
  const {
    state: roomVoiceState,
    toggleRoomVoiceMic,
    toggleRoomVoiceCamera,
    toggleRoomVoiceScreenShare,
    leaveRoomVoiceSession,
  } = useRoomVoice();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [pinned, setPinned] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const currentLogo = theme === "light" ? logoBlue : logoWhite;
  const isRoomRoute = location.pathname.startsWith("/room/");
  const roomIdFromPath = isRoomRoute ? decodeURIComponent(location.pathname.replace("/room/", "")) : "";
  const roomNameFromState = (location.state as { roomName?: string } | null)?.roomName;
  const roomVoiceTargetId = roomVoiceState.roomId || roomIdFromPath;
  const hasRoomVoiceTarget = Boolean(roomVoiceTargetId);
  const roomVoiceName = roomVoiceState.roomName || roomNameFromState || roomIdFromPath || "No active room";
  const roomVoiceSummary = useMemo(() => {
    if (roomVoiceState.status === "connecting") return "Connecting...";
    if (roomVoiceState.status === "active") return `${roomVoiceState.participants.length} connected`;
    if (!hasRoomVoiceTarget) return "Voice idle";
    return "Voice inactive";
  }, [hasRoomVoiceTarget, roomVoiceState.participants.length, roomVoiceState.status]);
  const canControlRoomVoice = roomVoiceState.status === "active";

  useEffect(() => {
    if (!token) return;

    const loadSidebarData = async () => {
      try {
        const [pinnedList, conversationList] = await Promise.all([
          fetchPinnedFriends(token),
          fetchConversations(token),
        ]);
        setPinned(pinnedList);
        setConversations(conversationList);
      } catch (err) {
        console.error(err);
      }
    };

    void loadSidebarData();
  }, [token]);

  const handlePinnedClick = (friend: Friend) => {
    navigate(`/chat/${friend.user_id}`, {
      state: { friendUsername: friend.username },
    });
  };

  const handleConversationClick = (conversation: ConversationInfo) => {
    navigate(`/chat/${conversation.user_id}`, {
      state: { friendUsername: conversation.username },
    });
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col justify-between border-r-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-[14px_12px] text-[var(--pc-text)] lg:flex">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="-mt-2 flex h-14 w-14 items-center justify-center">
              <img src={currentLogo} alt={`${APP_NAME} logo`} className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 pt-[2px]">
              <div className="whitespace-nowrap text-[26px] leading-none">{APP_NAME}</div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
                version: {APP_VERSION}
              </div>
            </div>
          </div>

          <div className="space-y-2 px-[2px] py-1">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
              HELLO // OPERATOR
            </div>
            <div className="font-mono text-sm font-semibold">
              Welcome back, {user?.username || "Pilot"}
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--pc-border)]" />

        <nav className="space-y-[6px] py-[2px]">
          {menuItems.map((item) => {
            const active = location.pathname === item.url;
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex items-center justify-between border px-[10px] py-2 font-mono text-[13px] font-semibold text-[var(--pc-text)] ${
                  active ? "border-2 border-[var(--pc-border)] bg-[var(--pc-surface-strong)]" : "border-[var(--pc-border)]"
                }`}
              >
                <span>{item.title}</span>
                {active && <span className="text-[10px] uppercase">ACTIVE</span>}
              </Link>
            );
          })}
        </nav>

        <div className="h-px bg-[var(--pc-border)]" />

        {pinned.length > 0 && (
          <div className="space-y-2 py-[2px]">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
              Priority Links
            </div>
            <div className="space-y-1">
              {pinned.slice(0, 4).map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => handlePinnedClick(friend)}
                  className="flex w-full items-center justify-between border border-[var(--pc-border)] px-[10px] py-2 text-left text-sm text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)]"
                >
                  <span className="truncate">{friend.username}</span>
                  <MessageCircle className="h-4 w-4 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 py-[2px]">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
            Messages Summary
          </div>
          {conversations.length === 0 ? (
            <div className="border border-[var(--pc-border)] px-[10px] py-3 font-mono text-[11px] text-[var(--pc-text-muted)]">
              No active chats yet.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.slice(0, 2).map((conversation) => (
                <button
                  key={conversation.user_id}
                  type="button"
                  onClick={() => handleConversationClick(conversation)}
                  className="w-full border-2 border-[var(--pc-border)] bg-[var(--pc-surface-strong)] px-[10px] py-3 text-left transition-colors hover:bg-[var(--pc-action-hover)]"
                >
                  <div className="font-mono text-xs font-bold text-[var(--pc-text)]">
                    {conversation.username}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--pc-text-muted)]">
                    {conversation.last_message || "No messages yet"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] p-[14px]">
        <div className="space-y-1">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
            Room Voice
          </div>
          <div className="text-base font-semibold">{roomVoiceName}</div>
          <div className="text-sm text-[var(--pc-text-muted)]">{roomVoiceSummary}</div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!roomVoiceTargetId) return;
            navigate(`/room/${encodeURIComponent(roomVoiceTargetId)}`, {
              state: { roomName: roomVoiceName },
            });
          }}
          disabled={!hasRoomVoiceTarget}
          className="flex h-9 w-full items-center justify-center bg-[var(--pc-action-inverse-bg)] px-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--pc-action-inverse-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Open Room
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              onClick={() => void toggleRoomVoiceMic()}
              disabled={!canControlRoomVoice}
              className="flex h-8 w-8 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              title={roomVoiceState.localMuted ? "Unmute" : "Mute"}
            >
              {roomVoiceState.localMuted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => void toggleRoomVoiceCamera()}
              disabled={!canControlRoomVoice}
              className="flex h-8 w-8 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              title={roomVoiceState.localCameraOff ? "Turn on camera" : "Turn off camera"}
            >
              {roomVoiceState.localCameraOff ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => void toggleRoomVoiceScreenShare()}
              disabled={!canControlRoomVoice}
              className="flex h-8 w-8 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] transition-colors hover:bg-[var(--pc-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              title={roomVoiceState.screenSharing ? "Stop sharing" : "Share screen"}
            >
              {roomVoiceState.screenSharing ? <MonitorOff className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void leaveRoomVoiceSession()}
            disabled={roomVoiceState.status === "idle"}
            className="flex h-9 w-9 items-center justify-center bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            title="Leave voice"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
