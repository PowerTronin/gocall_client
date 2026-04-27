import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Trash2, Video } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  removeFriend,
  requestFriend,
  searchUsers,
} from "../services/friends-api";
import { getOrCreateDirectRoom } from "../services/rooms-api";
import { Friend, FriendRequest, UserInfo } from "../types";

const panelClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-panel)]";
const actionButtonClass =
  "inline-flex items-center justify-center border-2 border-[var(--pc-border)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors";

const FriendsPage: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserInfo[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = searchQuery.trim();
  const showMinQueryHint = trimmedQuery.length > 0 && trimmedQuery.length < 3;

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [friendsData, requests] = await Promise.all([
        fetchFriends(token),
        fetchFriendRequests(token),
      ]);
      setFriends(friendsData);
      setFriendRequests(requests);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  const performSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      setError("");

      if (q.length === 0) {
        abortRef.current?.abort();
        setIsSearching(false);
        setSearchResults([]);
        return;
      }

      if (q.length < 3) {
        abortRef.current?.abort();
        setIsSearching(false);
        setSearchResults([]);
        return;
      }

      if (!token) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      try {
        const results = await searchUsers(q, token, controller.signal);
        const filtered = results.filter(
          (user) =>
            user.username !== currentUser?.username &&
            user.id !== currentUser?.id &&
            !friends.some((friend) => friend.username === user.username)
        );
        setSearchResults(filtered);
        setError("");
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
        setSearchResults([]);
        setError(err.message || "Failed to search users");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    },
    [token, friends, currentUser]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    setError("");

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const q = value.trim();
    if (q.length < 3) {
      abortRef.current?.abort();
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      void performSearch(value);
    }, 500);
  };

  const handleSearchClick = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    void performSearch(searchQuery);
  };

  const handleSendFriendRequest = async (targetUser: { id: number; username: string }) => {
    if (!token) return;
    if (targetUser.username === currentUser?.username || targetUser.id === currentUser?.id) {
      setError("You cannot add yourself");
      return;
    }
    try {
      await requestFriend(targetUser.username, token);
      setSuccess(`Friend request sent to ${targetUser.username}`);
      setTimeout(() => setSuccess(""), 3000);
      setSearchResults((prev) => prev.filter((foundUser) => foundUser.id !== targetUser.id));
      setSearchQuery("");
    } catch (err: any) {
      setError(err.message || "Failed to send friend request");
    }
  };

  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!token) return;
    try {
      await acceptFriendRequest(request.id, token);
      await loadData();
      setSuccess("Friend request accepted");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to accept friend request");
    }
  };

  const handleDeclineFriendRequest = async (request: FriendRequest) => {
    if (!token) return;
    try {
      await declineFriendRequest(request.id, token);
      await loadData();
      setSuccess("Friend request declined");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to decline friend request");
    }
  };

  const handleRemoveFriend = async (friend: Friend) => {
    if (!token) return;

    try {
      await removeFriend(friend.username, token);
      setFriends((current) => current.filter((item) => item.user_id !== friend.user_id));
      setSuccess(`${friend.username} removed`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to remove friend");
    }
  };

  const goToChat = (friend: Friend) => {
    navigate(`/chat/${friend.friend_user_id}`, {
      state: { friendUsername: friend.username },
    });
  };

  const handleVideoCall = async (friend: Friend) => {
    if (!token) return;

    try {
      const room = await getOrCreateDirectRoom(friend.friend_user_id, token);
      navigate(`/room/${encodeURIComponent(room.room_id)}`, {
        state: { roomName: `Private voice with ${friend.username}` },
      });
    } catch (err: any) {
      setError(err.message || "Failed to open private voice room");
    }
  };

  return (
    <div className="space-y-6 text-[var(--pc-text)]">
      <section className={`${panelClass} p-5`}>
        <div className="mb-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
            Power-Call // Friends
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Friends & Contacts</h1>
          <p className="mt-1 text-sm text-[var(--pc-text-muted)]">
            Manage direct contacts, incoming requests, and private voice rooms.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pc-text-subtle)]" />
            <input
              type="text"
              placeholder="Search users by username"
              value={searchQuery}
              onChange={handleInputChange}
              className="w-full border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] py-3 pl-11 pr-4 text-sm text-[var(--pc-text)] outline-none placeholder:text-[var(--pc-text-subtle)]"
            />
          </div>
          <button
            type="button"
            onClick={handleSearchClick}
            className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
          >
            Search
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {showMinQueryHint && <span className="text-[var(--pc-text-soft)]">Enter at least 3 characters</span>}
          {isSearching && <span className="text-[var(--pc-text-soft)]">Searching...</span>}
          {success && <span className="text-[var(--pc-text)]">{success}</span>}
          {error && <span className="text-[var(--pc-text)]">{error}</span>}
        </div>
      </section>

      {searchResults.length > 0 && (
        <section className={`${panelClass} p-5`}>
          <div className="mb-4">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
              Directory Match
            </div>
            <h2 className="mt-2 text-xl font-semibold">Search Results</h2>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {searchResults.map((searchUser, index) => (
              <div
                key={searchUser.username || `user-${index}`}
                className="flex items-center justify-between gap-3 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-3"
              >
                <span className="truncate text-sm">{searchUser.username}</span>
                <button
                  type="button"
                  onClick={() => void handleSendFriendRequest(searchUser)}
                  className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                >
                  Add Friend
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {friendRequests.length > 0 && (
        <section className={`${panelClass} p-5`}>
          <div className="mb-4">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
              Queue
            </div>
            <h2 className="mt-2 text-xl font-semibold">Friend Requests</h2>
          </div>
          <div className="space-y-3">
            {friendRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="text-sm">
                  <span className="font-semibold text-[var(--pc-text)]">{request.from_username}</span>
                  <span className="text-[var(--pc-text-muted)]"> wants to add you as a friend</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAcceptFriendRequest(request)}
                    className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineFriendRequest(request)}
                    className={`${actionButtonClass} bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`${panelClass} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
              Network
            </div>
            <h2 className="mt-2 text-xl font-semibold">Friends</h2>
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--pc-text-soft)]">
            {friends.length} total
          </div>
        </div>

        {friends.length === 0 ? (
          <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-8 text-center text-[var(--pc-text-muted)]">
            No friends yet. Search for a user to start building your network.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex flex-col gap-4 border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        friend.is_online ? "bg-[var(--pc-online)]" : "bg-[var(--pc-offline)]"
                      }`}
                    />
                    <div className="truncate text-base font-semibold">{friend.username}</div>
                  </div>
                  <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
                    {friend.is_online ? "online" : "offline"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => goToChat(friend)}
                    className={`${actionButtonClass} gap-2 bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
                    title="Open chat"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVideoCall(friend)}
                    className={`${actionButtonClass} gap-2 bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
                    title="Open private voice room"
                  >
                    <Video className="h-4 w-4" />
                    Voice
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveFriend(friend)}
                    className={`${actionButtonClass} gap-2 bg-[var(--pc-bg)] text-[var(--pc-text)] hover:bg-[var(--pc-surface-strong)]`}
                    title="Remove friend"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FriendsPage;
