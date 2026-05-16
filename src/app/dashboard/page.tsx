"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/utils";
import type { Room, Profile } from "@/lib/types";
import {
  Popcorn, Plus, LogOut, Upload, DoorOpen, Film,
  Copy, Check, Users, Clock
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRooms = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false });
    if (data) setRooms(data);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setUser(profile);
      } else {
        const username = session.user.user_metadata?.username || session.user.email?.split("@")[0] || "User";
        const newProfile = {
          id: session.user.id,
          username,
          avatar_url: null,
        };
        await supabase.from("profiles").upsert(newProfile);
        setUser({ ...newProfile, created_at: new Date().toISOString() });
      }

      await fetchRooms(session.user.id);
    };

    init();
  }, [router, fetchRooms]);

  const handleCreateRoom = async () => {
    setCreating(true);
    setError("");
    const code = generateRoomCode();

    const { data, error: err } = await supabase
      .from("rooms")
      .insert({
        room_code: code,
        owner_id: userId,
        movie_url: null,
        movie_name: null,
      })
      .select()
      .single();

    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }

    if (data) {
      await supabase.from("playback_state").insert({
        room_id: data.id,
        is_playing: false,
        playback_time: 0,
        updated_by: userId,
        subtitle_url: null,
      });
      router.push(`/room/${data.id}`);
    }
    setCreating(false);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setError("");

    const { data, error: err } = await supabase
      .from("rooms")
      .select("*")
      .eq("room_code", joinCode.trim().toUpperCase())
      .single();

    if (err || !data) {
      setError("Room not found. Check the code and try again.");
      setJoining(false);
      return;
    }

    router.push(`/room/${data.id}`);
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Popcorn className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold">Movie Party</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden sm:block">
            Hey, <strong className="text-foreground">{user.username}</strong>
          </span>
          <button onClick={handleLogout} className="btn-secondary text-sm py-2 px-3">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <button
            onClick={handleCreateRoom}
            disabled={creating}
            className="glass-card p-6 text-left hover:border-primary/30 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">
              {creating ? "Creating..." : "Create Room"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Start a new watch party
            </p>
          </button>

          <div className="glass-card p-6">
            <div className="w-12 h-12 bg-secondary/15 rounded-xl flex items-center justify-center mb-4">
              <DoorOpen className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="font-semibold mb-3">Join Room</h3>
            <form onSubmit={handleJoinRoom} className="flex gap-2">
              <input
                type="text"
                placeholder="Room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="input-glass text-sm flex-1 py-2"
                maxLength={6}
              />
              <button
                type="submit"
                disabled={joining}
                className="btn-primary text-sm py-2 px-4"
              >
                {joining ? "..." : "Join"}
              </button>
            </form>
          </div>

          <button
            onClick={() => router.push("/upload")}
            className="glass-card p-6 text-left hover:border-primary/30 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">Upload Movie</h3>
            <p className="text-sm text-muted-foreground">
              Upload an MP4 to share
            </p>
          </button>
        </div>

        {/* My Rooms */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            My Rooms
          </h2>

          {rooms.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <Users className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted-foreground">
                No rooms yet. Create one to get started!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="glass-card p-5 hover:border-primary/20 transition-all animate-fade-in cursor-pointer"
                  onClick={() => router.push(`/room/${room.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono px-2 py-1 rounded-lg bg-primary/10 text-primary">
                          {room.room_code}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(room.room_code, room.id);
                          }}
                          className="text-muted hover:text-foreground transition-colors"
                        >
                          {copiedId === room.id ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {room.movie_name || "No movie selected"}
                      </p>
                    </div>
                    <Film className="w-5 h-5 text-muted" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="w-3 h-3" />
                    {new Date(room.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
