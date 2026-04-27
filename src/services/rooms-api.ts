import { RoomInvite, Room } from "../types";
import { headers } from "./api";
import { API_BASE_URL } from "./config";

async function getAPIError(response: Response, fallback: string): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  const message =
    typeof errorData.error === "string" && errorData.error.length > 0
      ? errorData.error
      : fallback;

  if (response.status === 401) {
    return `Session expired: ${message}`;
  }

  return message;
}

export interface RoomMemberState {
  id: number;
  user_id: string;
  username: string;
  name: string;
  is_online: boolean;
  role: string;
  joined_at: string;
}

export interface RoomVoiceParticipantState {
  id: number;
  user_id: string;
  username: string;
  name: string;
  is_online: boolean;
  is_mic_enabled: boolean;
  is_camera_enabled: boolean;
  is_screen_sharing: boolean;
  joined_at: string;
  updated_at: string;
}

export interface RoomStageNoteState {
  id: number;
  user_id: string;
  username: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  title: string;
  body: string;
  body_bold: boolean;
  body_strike: boolean;
  body_size: "sm" | "md" | "lg" | "xl";
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomStateResponse {
  room: {
    id: number;
    room_id: string;
    user_id: string;
    name: string;
    type: string;
    password: string;
    created_at: string;
  };
  members: RoomMemberState[];
  voice_participants: RoomVoiceParticipantState[];
  in_voice: boolean;
  stage_layout: {
    stage_layouts: Record<
      string,
      {
        x: number;
        y: number;
        w: number;
        h: number;
        z: number;
      }
    >;
    pinned_tile_ids: string[];
    shared_locked: boolean;
    can_edit_shared: boolean;
  };
  stage_notes: RoomStageNoteState[];
}

export interface RoomVoiceCredentialsResponse {
  url: string;
  token: string;
  room_name: string;
  identity: string;
  name: string;
}

export interface RoomSharedStageLayoutPayload {
  stage_layouts: Record<
    string,
    {
      x: number;
      y: number;
      w: number;
      h: number;
      z: number;
    }
  >;
  pinned_tile_ids: string[];
}

export interface CreateRoomStageNotePayload {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  title: string;
  body: string;
  body_bold: boolean;
  body_strike: boolean;
  body_size: "sm" | "md" | "lg" | "xl";
}

export interface UpdateRoomStageNotePayload {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  title?: string;
  body?: string;
  body_bold?: boolean;
  body_strike?: boolean;
  body_size?: "sm" | "md" | "lg" | "xl";
  is_pinned?: boolean;
}

// Функция для получения списка приглашений в комнаты (GET /api/rooms/invites)
export async function fetchRoomInvites(token: string): Promise<RoomInvite[]> {
  void token;
  return [];
}

// Функция для принятия приглашения в комнату (POST /api/rooms/invite/accept)
export async function acceptRoomInvite(inviteId: number, token: string): Promise<void> {
  void inviteId;
  void token;
  throw new Error("Room invites are not implemented on this server");
}

// Функция для отклонения приглашения в комнату (POST /api/rooms/invite/decline)
export async function declineRoomInvite(inviteId: number, token: string): Promise<void> {
  void inviteId;
  void token;
  throw new Error("Room invites are not implemented on this server");
}

/** Получаем комнаты пользователя (GET /rooms) */
export async function fetchMyRooms(token: string): Promise<Room[]> {
  const response = await fetch(`${API_BASE_URL}/rooms/mine`, {
    method: "GET",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch rooms");
  }
  const data = await response.json();
  // Server returns array directly, or { rooms: [...] }
  const rooms = Array.isArray(data) ? data : (Array.isArray(data.rooms) ? data.rooms : []);
  return rooms.map((r: { id?: number; room_id: string; name: string; type: string; user_id: string; created_at: string }) => ({
    room_id: r.room_id,
    user_id: r.user_id,
    name: r.name,
    type: r.type,
    created_at: r.created_at,
  }));
}

/** Создание комнаты (POST /rooms) */
export async function createRoom(name: string, token: string): Promise<Room> {
  const type = "public"; // можно расширить по необходимости
  const response = await fetch(`${API_BASE_URL}/rooms/create`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name, type }),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to create room"));
  }
  const data = await response.json();
  return {
    room_id: data.roomID,
    name: data.name,
    type: data.type,
    user_id: "",
    created_at: new Date().toISOString(),
  };
}

/** Удаление комнаты (DELETE /rooms/:id) */
export async function deleteRoom(roomID: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to delete room"));
  }
}

/** Join room as member (POST /rooms/:id/join) - required for calls */
export async function joinRoomAsMember(roomID: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/join`, {
    method: "POST",
    headers: headers(token),
  });
  if (!response.ok) {
    const message = await getAPIError(response, "Failed to join room");
    if (!message.toLowerCase().includes("already")) {
      throw new Error(message);
    }
  }
}

export async function fetchRoomState(roomID: string, token: string): Promise<RoomStateResponse> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/state`, {
    method: "GET",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to fetch room state"));
  }
  return response.json();
}

export async function updateRoomSharedStageLayout(
  roomID: string,
  payload: RoomSharedStageLayoutPayload,
  token: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/stage-layout`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to update shared stage layout"));
  }
}

export async function updateRoomSharedStageLayoutLock(
  roomID: string,
  sharedLocked: boolean,
  token: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/stage-layout/lock`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({ shared_locked: sharedLocked }),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to update shared stage lock"));
  }
}

export async function createRoomStageNote(
  roomID: string,
  payload: CreateRoomStageNotePayload,
  token: string
): Promise<RoomStageNoteState> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/stage-notes`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to create room stage note"));
  }

  const data = await response.json();
  return data.note as RoomStageNoteState;
}

export async function updateRoomStageNote(
  roomID: string,
  noteID: number,
  payload: UpdateRoomStageNotePayload,
  token: string
): Promise<RoomStageNoteState> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/stage-notes/${noteID}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to update room stage note"));
  }

  const data = await response.json();
  return data.note as RoomStageNoteState;
}

export async function deleteRoomStageNote(
  roomID: string,
  noteID: number,
  token: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/stage-notes/${noteID}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to delete room stage note"));
  }
}

export async function joinRoomVoice(roomID: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/voice/join`, {
    method: "POST",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to join room voice"));
  }
}

export async function leaveRoomVoice(roomID: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/voice/leave`, {
    method: "POST",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to leave room voice"));
  }
}

export async function updateRoomVoiceMedia(
  roomID: string,
  payload: {
    is_mic_enabled?: boolean;
    is_camera_enabled?: boolean;
    is_screen_sharing?: boolean;
  },
  token: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/voice/media`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to update room voice media"));
  }
}

export async function fetchRoomVoiceCredentials(
  roomID: string,
  token: string
): Promise<RoomVoiceCredentialsResponse> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}/voice/credentials`, {
    method: "POST",
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(await getAPIError(response, "Failed to fetch room voice credentials"));
  }
  return response.json();
}

/** Получаем приглашённые комнаты - not implemented in WireChat */
export async function fetchInvitedRooms(_token: string): Promise<Room[]> {
  // Room invites not implemented in WireChat server - return empty array
  return [];
}

/** Приглашение друга в комнату (POST /rooms/invite) */
export async function inviteFriendToRoom(
  roomID: string,
  username: string,
  token: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/invite`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ roomID, username }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to invite friend to room");
  }
}

/** Обновление комнаты (PUT /rooms/:id) */
export async function updateRoom(roomID: string, name: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/rooms/${roomID}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({ name, type: "public", password: "" }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to update room");
  }
}

/** Create or get direct message room with a user (POST /rooms/direct) */
export async function getOrCreateDirectRoom(userId: string, token: string): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/rooms/direct`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ friend_user_id: userId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create direct room");
  }
  const payload = await response.json();
  const room = payload.room ?? payload;

  return {
    room_id: room.room_id,
    user_id: room.user_id,
    name: room.name,
    type: room.type,
    created_at: room.created_at,
  };
}
