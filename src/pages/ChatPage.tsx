import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Send, Video } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { getUserInfo } from "../services/api";
import {
  connectDirectChatSocket,
  fetchDirectChatHistory,
} from "../services/chat-api";
import { getOrCreateDirectRoom } from "../services/rooms-api";

interface ChatMessageView {
  id: number | string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
}

const panelClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-panel)]";
const actionButtonClass =
  "inline-flex items-center justify-center border-2 border-[var(--pc-border)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors";

const ChatPage: React.FC = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();

  const [friendUsername, setFriendUsername] = useState("");
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSocketOpen, setIsSocketOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const routeState = location.state as { friendUsername?: string } | null;

  const friendUserID = friendId ? decodeURIComponent(friendId) : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadChat = async () => {
      if (!token || !friendUserID) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [history, friendInfo] = await Promise.all([
          fetchDirectChatHistory(token, friendUserID),
          routeState?.friendUsername
            ? Promise.resolve({
                id: 0,
                username: routeState.friendUsername,
                name: routeState.friendUsername,
              })
            : getUserInfo(token, friendUserID),
        ]);

        setMessages(history);
        setFriendUsername(friendInfo.username || `user-${friendUserID}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        setIsLoading(false);
      }
    };

    void loadChat();
  }, [friendUserID, routeState?.friendUsername, token]);

  useEffect(() => {
    if (!token || !user?.user_id || !friendUserID) {
      return undefined;
    }

    const socket = connectDirectChatSocket(token, {
      onOpen: () => setIsSocketOpen(true),
      onClose: () => setIsSocketOpen(false),
      onError: () => {
        setIsSocketOpen(false);
        setError((current) => current ?? "Chat connection error");
      },
      onMessage: (message) => {
        const isRelevant =
          (message.from === friendUserID && message.to === user.user_id) ||
          (message.from === user.user_id && message.to === friendUserID);

        if (!isRelevant) {
          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: `${message.from}-${Date.now()}`,
            sender_id: message.from,
            receiver_id: message.to,
            text: message.message,
            created_at: new Date().toISOString(),
          },
        ]);
      },
    });

    socketRef.current = socket;

    return () => {
      socket.close(1000, "chat page closed");
      socketRef.current = null;
    };
  }, [friendUserID, token, user?.user_id]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      ),
    [messages]
  );

  const handleSend = () => {
    const text = inputMessage.trim();
    if (!text || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !user) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        to: friendUserID,
        message: text,
      })
    );

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        sender_id: user.user_id,
        receiver_id: friendUserID,
        text,
        created_at: new Date().toISOString(),
      },
    ]);
    setInputMessage("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleOpenVoiceRoom = async () => {
    if (!token) return;

    try {
      const room = await getOrCreateDirectRoom(friendUserID, token);
      navigate(`/room/${encodeURIComponent(room.room_id)}`, {
        state: { roomName: `Private voice with ${friendUsername || "friend"}` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open private voice room");
    }
  };

  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] text-[var(--pc-text)]">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" />
          <p className="font-mono text-sm uppercase tracking-[0.2em]">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (error && sortedMessages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] px-4 text-[var(--pc-text)]">
        <div className={`w-full max-w-xl p-6 ${panelClass}`}>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
            Power-Call // Error
          </div>
          <h2 className="mb-3 text-xl font-semibold">Chat Error</h2>
          <p className="mb-6 text-sm text-[var(--pc-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-4 text-[var(--pc-text)] lg:h-[calc(100vh-3rem)]">
      <header className={`flex items-center justify-between px-4 py-3 ${panelClass}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] transition-colors hover:bg-[var(--pc-surface-strong)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
              Power-Call // Direct Link
            </div>
            <h1 className="truncate text-xl font-semibold">
              {friendUsername || "Direct chat"}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
              {isSocketOpen ? "connected" : "connecting"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleOpenVoiceRoom()}
          className={`${actionButtonClass} gap-2 bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
          title="Open private voice room"
        >
          <Video className="h-4 w-4" />
          Voice
        </button>
      </header>

      <main className={`flex min-h-0 flex-1 flex-col ${panelClass}`}>
        <div className="border-b-2 border-[var(--pc-border)] px-4 py-3">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Message Stream
          </div>
          <div className="mt-1 text-sm text-[var(--pc-text-soft)]">
            Secure direct conversation channel
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--pc-bg)] p-4">
          {sortedMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.18em]">
                No messages yet
              </div>
              <p className="text-sm text-[var(--pc-text-muted)]">Open the conversation with your first message.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedMessages.map((message) => {
                const isMe = message.sender_id === user?.user_id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] border-2 px-4 py-3 sm:max-w-[75%] ${
                        isMe
                          ? "border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)]"
                          : "border-[var(--pc-border)] bg-[var(--pc-panel)] text-[var(--pc-text)]"
                      }`}
                    >
                      <p className="break-words text-sm leading-6">{message.text}</p>
                      <p
                        className={`mt-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                          isMe ? "text-[var(--pc-action-inverse-muted)]" : "text-[var(--pc-text-subtle)]"
                        }`}
                      >
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t-2 border-[var(--pc-border)] bg-[var(--pc-panel)] p-4">
          {error && (
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text)]">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(event) => setInputMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              className="min-w-0 flex-1 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-3 text-sm text-[var(--pc-text)] outline-none placeholder:text-[var(--pc-text-subtle)]"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputMessage.trim() || !isSocketOpen}
              className="flex h-12 w-12 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatPage;
