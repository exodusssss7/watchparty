export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  room_code: string;
  owner_id: string;
  movie_url: string | null;
  movie_name: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
}

export interface PlaybackState {
  room_id: string;
  is_playing: boolean;
  playback_time: number;
  updated_by: string;
  updated_at: string;
  subtitle_url: string | null;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  username: string;
  joined_at: string;
}
