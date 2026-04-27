import React, { useEffect, useRef, useState } from "react";
import { MoreVertical, Plus, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { fetchFriends } from "../services/friends-api";
import {
  deleteRoom,
  fetchInvitedRooms,
  fetchMyRooms,
  getOrCreateDirectRoom,
  inviteFriendToRoom,
  updateRoom,
} from "../services/rooms-api";
import { Friend, Room } from "../types";

const panelClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-panel)]";
const actionButtonClass =
  "inline-flex items-center justify-center border-2 border-[var(--pc-border)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors";

const Index: React.FC = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invitedRooms, setInvitedRooms] = useState<Room[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeRoomMenu, setActiveRoomMenu] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalRoom, setInviteModalRoom] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!token) return;
      try {
        const ownRooms = await fetchMyRooms(token);
        const invited = await fetchInvitedRooms(token);
        const fetchedFriends = await fetchFriends(token);

        const markedOwnRooms = ownRooms.map((room) => ({
          ...room,
          is_owner: room.user_id === user?.user_id,
        }));
        const markedInvitedRooms = invited.map((room) => ({ ...room, is_owner: false }));

        setRooms(markedOwnRooms);
        setInvitedRooms(markedInvitedRooms);
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    void loadData();
  }, [token, user?.user_id]);

  const allRooms: Room[] = [...rooms, ...invitedRooms];
  const getRoomDisplayName = (room: Room) =>
    room.name.startsWith("__direct__:") ? "Private voice room" : room.name;

  const handleDeleteRoom = async (roomId: string) => {
    if (!token) return;
    try {
      await deleteRoom(roomId, token);
      setRooms((prev) => prev.filter((room) => room.room_id !== roomId));
      setInvitedRooms((prev) => prev.filter((room) => room.room_id !== roomId));
      setActiveRoomMenu(null);
    } catch (error: any) {
      console.error("Failed to delete room:", error.message);
    }
  };

  const handleEditRoom = async (roomId: string) => {
    if (!token) return;
    const nextName = window.prompt("Enter a new room name:");
    if (!nextName) return;
    try {
      await updateRoom(roomId, nextName, token);
      setRooms((prev) =>
        prev.map((room) => (room.room_id === roomId ? { ...room, name: nextName } : room))
      );
      setInvitedRooms((prev) =>
        prev.map((room) => (room.room_id === roomId ? { ...room, name: nextName } : room))
      );
      setActiveRoomMenu(null);
    } catch (error: any) {
      console.error("Failed to update room:", error.message);
    }
  };

  const handleInviteFriend = (roomId: string) => {
    setInviteModalRoom(roomId);
    setInviteModalOpen(true);
    setActiveRoomMenu(null);
  };

  const handleConfirmInvite = async (friendName: string) => {
    if (!token || !inviteModalRoom) return;
    try {
      await inviteFriendToRoom(inviteModalRoom, friendName, token);
      setInviteModalOpen(false);
    } catch (error: any) {
      console.error("Failed to invite friend:", error.message);
    }
  };

  const handleJoinRoom = (room: Room) => {
    navigate(`/room/${encodeURIComponent(room.room_id)}`, {
      state: { roomName: room.name },
    });
  };

  const toggleContextMenu = (roomId: string) => {
    setActiveRoomMenu((prev) => (prev === roomId ? null : roomId));
  };

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveRoomMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 text-[var(--pc-text)]">
      <section className={`${panelClass} p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
              Power-Call // Home
            </div>
            <h1 className="mt-2 text-3xl font-semibold">
              Welcome back, {user?.username || "Operator"}
            </h1>
            <p className="mt-1 text-sm text-[var(--pc-text-muted)]">
              Monitor rooms, jump into private voice, and keep your network moving.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/rooms")}
              className={`${actionButtonClass} gap-2 bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
            >
              <Plus className="h-4 w-4" />
              Create Room
            </button>
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className={`${actionButtonClass} bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
            >
              Open Contacts
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className={`${panelClass} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
                Mission Feed
              </div>
              <h2 className="mt-2 text-xl font-semibold">Active Rooms</h2>
            </div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--pc-text-soft)]">
              {allRooms.length} total
            </div>
          </div>

          {allRooms.length === 0 ? (
            <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-8 text-center">
              <div className="font-mono text-sm font-bold uppercase tracking-[0.18em]">
                No rooms yet
              </div>
              <p className="mt-2 text-sm text-[var(--pc-text-muted)]">
                Open the directory and create the first room.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {allRooms.slice(0, 4).map((room) => (
                <div
                  key={room.room_id}
                  className={`relative flex min-h-[190px] flex-col justify-between border-2 p-4 ${
                    room.is_owner ? "border-[var(--pc-border)] bg-[var(--pc-surface-strong)]" : "border-[var(--pc-border)] bg-[var(--pc-surface)]"
                  }`}
                >
                  <div>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-soft)]">
                          {room.is_owner ? "Owned room" : "Invited room"}
                        </div>
                        <h3 className="mt-2 break-words text-lg font-semibold">
                          {getRoomDisplayName(room)}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleContextMenu(room.room_id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] transition-colors hover:bg-[var(--pc-action-hover)]"
                        title="Room actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
                      Quick launch available
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleJoinRoom(room)}
                      className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                    >
                      Join Room
                    </button>
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
                      {room.type || "voice"}
                    </div>
                  </div>

                  {activeRoomMenu === room.room_id && (
                    <div
                      ref={menuRef}
                      className="absolute right-4 top-14 z-20 w-56 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
                    >
                      {room.is_owner ? (
                        <>
                          <button
                            type="button"
                            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pc-surface-strong)]"
                            onClick={() => void handleDeleteRoom(room.room_id)}
                          >
                            Delete room
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pc-surface-strong)]"
                            onClick={() => void handleEditRoom(room.room_id)}
                          >
                            Rename room
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pc-surface-strong)]"
                            onClick={() => handleInviteFriend(room.room_id)}
                          >
                            Invite friend
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pc-surface-strong)]"
                          onClick={() => handleInviteFriend(room.room_id)}
                        >
                          Invite friend
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${panelClass} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
                Direct Links
              </div>
              <h2 className="mt-2 text-xl font-semibold">Friends</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className={`${actionButtonClass} bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
            >
              Open All
            </button>
          </div>

          {friends.length === 0 ? (
            <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-8 text-center text-[var(--pc-text-muted)]">
              No friends yet. Add contacts from the Friends page.
            </div>
          ) : (
            <div className="space-y-3">
              {friends.slice(0, 6).map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between gap-3 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          friend.is_online ? "bg-[var(--pc-online)]" : "bg-[var(--pc-offline)]"
                        }`}
                      />
                      <div className="truncate text-sm font-medium">{friend.username}</div>
                    </div>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
                      {friend.is_online ? "online" : "offline"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!token) return;
                      try {
                        const room = await getOrCreateDirectRoom(friend.friend_user_id, token);
                        navigate(`/room/${encodeURIComponent(room.room_id)}`, {
                          state: { roomName: `Private voice with ${friend.username}` },
                        });
                      } catch (error) {
                        console.error("Failed to open private room:", error);
                      }
                    }}
                    className={`${actionButtonClass} gap-2 bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                  >
                    <Video className="h-4 w-4" />
                    Voice
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setInviteModalOpen(false)}
            aria-label="Close invite modal"
          />
          <div className={`relative z-10 w-full max-w-md p-5 ${panelClass}`}>
            <div className="mb-4">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
                Quick Invite
              </div>
              <h3 className="mt-2 text-xl font-semibold">Invite a Friend</h3>
            </div>

            {friends.length === 0 ? (
              <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-5 text-sm text-[var(--pc-text-muted)]">
                No friends available for invite.
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between gap-3 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-3"
                  >
                    <span className="truncate text-sm">{friend.username}</span>
                    <button
                      type="button"
                      onClick={() => void handleConfirmInvite(friend.username)}
                      className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className={`${actionButtonClass} bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
