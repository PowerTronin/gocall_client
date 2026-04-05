import { FriendRequest, Friend, User } from "../types";
import { decodeJWT, getUserInfo, headers } from "./api";
import { API_BASE_URL } from "./config";

interface FriendResponse {
  id: number;
  username: string;
  is_online: boolean;
  user_id: string;
  is_pinned: boolean;
  created_at: string;
}

interface FriendRequestResponse {
  id: number;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
}

export async function fetchFriendRequests(token: string): Promise<FriendRequest[]> {
  const response = await fetch(`${API_BASE_URL}/friends/requests`, {
    method: "GET",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch friend requests");
  }

  const payload = (await response.json()) as { friend_requests?: FriendRequestResponse[] };
  const requests = payload.friend_requests ?? [];

  const requestsWithUsers = await Promise.all(
    requests.map(async (item) => {
      try {
        const fromUser = await getUserInfo(token, item.from_user_id);
        return {
          item,
          fromUsername: fromUser.username,
        };
      } catch {
        return {
          item,
          fromUsername: `user-${item.from_user_id}`,
        };
      }
    })
  );

  return requestsWithUsers.map(({ item, fromUsername }) => ({
    id: item.id,
    from_user_id: item.from_user_id,
    from_username: fromUsername,
    to_user_id: item.to_user_id,
    status: item.status,
    created_at: item.created_at,
  }));
}

export async function acceptFriendRequest(requestId: number, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/accept`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ request_id: requestId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to accept friend request");
  }
}

export async function declineFriendRequest(requestId: number, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/decline`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ request_id: requestId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to decline friend request");
  }
}

export async function requestFriend(friendUsername: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/add`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ friend_username: friendUsername }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to send friend request");
  }
}

export async function fetchFriends(token: string): Promise<Friend[]> {
  const response = await fetch(`${API_BASE_URL}/friends`, {
    method: "GET",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch friends");
  }

  const me = decodeJWT(token);
  const data = (await response.json()) as { friends?: FriendResponse[] };
  const friends = data.friends ?? [];

  return friends.map((item) => ({
    id: item.id,
    user_id: item.user_id,
    friend_user_id: item.id,
    username: item.username || `user-${item.user_id}`,
    is_online: item.is_online,
    is_pinned: item.is_pinned,
    created_at: item.created_at,
  })).filter((item) => item.user_id !== me?.user_id);
}

export async function addFriend(friendUsername: string, token: string): Promise<void> {
  return requestFriend(friendUsername, token);
}

export async function removeFriend(friendUsername: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/friends/remove`, {
    method: "DELETE",
    headers: headers(token),
    body: JSON.stringify({ friend_username: friendUsername }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to remove friend");
  }
}

export async function searchUsers(query: string, token: string, signal?: AbortSignal): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/friends/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: headers(token),
    signal,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to search users");
  }

  const payload = (await response.json()) as { users?: { id: number; username: string; name: string }[] };
  const users = payload.users ?? [];

  return users.map((item) => ({
    id: item.id,
    user_id: String(item.id),
    username: item.username,
    name: item.name,
    email: "", // Not returned by API
    is_online: false, // Not returned by API
    created_at: "", // Not returned by API
  }));
}

export async function pinFriend(friendId: number, token: string): Promise<void> {
  void friendId;
  void token;
  throw new Error("Pin friend is not implemented on this server");
}

export async function unpinFriend(friendId: number, token: string): Promise<void> {
  void friendId;
  void token;
  throw new Error("Unpin friend is not implemented on this server");
}

export async function fetchPinnedFriends(_token: string): Promise<Friend[]> {
  return [];
}
