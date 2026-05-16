"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatChatTime, getAvatarColor, cn } from "@/lib/utils";
import type { Room, Message, PlaybackState, Profile } from "@/lib/types";
import {
  Popcorn, Send, Users, Copy, Check, ArrowLeft, Play, Pause,
  Film, LogOut, Link2, MessageSquare, X, Settings, Subtitles
} from "lucide-react";

const SYNC_TOLERANCE = 1.5;
const SYNC_DEBOUNCE = 500;

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef(false);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [viewers, setViewers] = useState<{ id: string; username: string }[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [movieUrl, setMovieUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showViewers, setShowViewers] = useState(false);

  const addNotification = useCallback((msg: string) => {
    setNotifications((prev) => [...prev, msg]);
    setTimeout(() => {
      setNotifications((prev) => prev.slice(1));
    }, 3000);
  }, []);

  // Initialize room
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setUserId(session.user.id);

      // Get profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (prof) setProfile(prof);

      // Get room
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (!roomData) {
        router.push("/dashboard");
        return;
      }

      setRoom(roomData);
      setIsOwner(roomData.owner_id === session.user.id);

      // Get playback state
      const { data: pbState } = await supabase
        .from("playback_state")
        .select("*")
        .eq("room_id", roomId)
        .single();

      if (pbState) setPlaybackState(pbState);

      // Get messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (msgs) setMessages(msgs);

      // Track presence
      const channel = supabase.channel(`room-presence-${roomId}`);
      const username = prof?.username || session.user.user_metadata?.username || "User";

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const present: { id: string; username: string }[] = [];
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (!present.find((v) => v.id === p.user_id)) {
                present.push({ id: p.user_id, username: p.username });
              }
            });
          });
          setViewers(present);
        })
        .on("presence", { event: "join" }, ({ newPresences }: any) => {
          newPresences.forEach((p: any) => {
            if (p.user_id !== session.user.id) {
              addNotification(`${p.username} joined the room`);
            }
          });
        })
        .on("presence", { event: "leave" }, ({ leftPresences }: any) => {
          leftPresences.forEach((p: any) => {
            addNotification(`${p.username} left the room`);
          });
        })
        .subscribe(async (status: string) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              user_id: session.user.id,
              username,
            });
          }
        });

      return () => {
        channel.unsubscribe();
      };
    };

    init();
  }, [roomId, router, addNotification]);

  // Subscribe to real-time messages
  useEffect(() => {
    const channel = supabase
      .channel(`room-messages-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Subscribe to playback state changes
  useEffect(() => {
    const channel = supabase
      .channel(`room-playback-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "playback_state",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          const newState = payload.new as PlaybackState;
          setPlaybackState(newState);

          if (newState.updated_by === userId) return;

          const video = videoRef.current;
          if (!video) return;

          isSyncingRef.current = true;

          // Sync time if difference exceeds tolerance
          if (Math.abs(video.currentTime - newState.playback_time) > SYNC_TOLERANCE) {
            video.currentTime = newState.playback_time;
          }

          // Sync play/pause
          if (newState.is_playing && video.paused) {
            video.play().catch(() => {});
          } else if (!newState.is_playing && !video.paused) {
            video.pause();
          }

          // Sync subtitles
          if (newState.subtitle_url && video.textTracks.length > 0) {
            for (let i = 0; i < video.textTracks.length; i++) {
              video.textTracks[i].mode =
                video.textTracks[i].label === "subtitles" ? "showing" : "hidden";
            }
          }

          setTimeout(() => {
            isSyncingRef.current = false;
          }, SYNC_DEBOUNCE);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId]);

  // Subscribe to room updates (movie URL changes)
  useEffect(() => {
    const channel = supabase
      .channel(`room-updates-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload: any) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fullscreen detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Broadcast playback state (owner only)
  const broadcastPlayback = useCallback(
    async (isPlaying: boolean, currentTime: number) => {
      if (!isOwner || isSyncingRef.current) return;

      const now = Date.now();
      if (now - lastSyncRef.current < SYNC_DEBOUNCE) return;
      lastSyncRef.current = now;

      await supabase
        .from("playback_state")
        .update({
          is_playing: isPlaying,
          playback_time: currentTime,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("room_id", roomId);
    },
    [isOwner, userId, roomId]
  );

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    broadcastPlayback(true, video.currentTime);
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (!video) return;
    broadcastPlayback(false, video.currentTime);
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    if (!video) return;
    broadcastPlayback(!video.paused, video.currentTime);
  };

  const handleEnded = () => {
    broadcastPlayback(false, 0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    const msg = newMessage.trim();
    setNewMessage("");

    await supabase.from("messages").insert({
      room_id: roomId,
      user_id: userId,
      username: profile.username,
      message: msg,
    });
  };

  const handleSetMovie = async () => {
    if (!movieUrl.trim()) return;

    await supabase
      .from("rooms")
      .update({
        movie_url: movieUrl.trim(),
        movie_name: movieUrl.trim().split("/").pop() || "Movie",
      })
      .eq("id", roomId);

    setShowSettings(false);
    setMovieUrl("");
  };

  const handleSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const video = videoRef.current;
    if (!video) return;

    const url = URL.createObjectURL(file);

    // Remove existing tracks
    while (video.firstChild) {
      if (video.firstChild instanceof HTMLTrackElement) {
        video.removeChild(video.firstChild);
      } else {
        break;
      }
    }

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = "subtitles";
    track.srclang = "en";
    track.src = url;
    track.default = true;
    video.appendChild(track);

    if (video.textTracks.length > 0) {
      video.textTracks[0].mode = "showing";
    }
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.room_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!room || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const chatPanel = (
    <div className={cn(
      "flex flex-col",
      isFullscreen ? "fullscreen-chat-overlay glass-card-sm" : "glass-card-sm h-full"
    )}>
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Chat</span>
        </div>
        {isFullscreen && (
          <button onClick={() => setShowChat(false)} className="text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: isFullscreen ? "280px" : undefined }}>
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-8">
            No messages yet. Say hi!
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in">
            <div className="flex items-start gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                getAvatarColor(msg.username)
              )}>
                {msg.username[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold">{msg.username}</span>
                  <span className="text-xs text-muted">{formatChatTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground break-words">{msg.message}</p>
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="input-glass text-sm py-2 flex-1"
            maxLength={500}
          />
          <button type="submit" className="btn-primary py-2 px-3">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <nav className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Popcorn className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm hidden sm:block">Movie Party</span>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs font-mono px-2 py-1 rounded-lg bg-primary/10 text-primary">
              {room.room_code}
            </span>
            <button onClick={handleCopyCode} className="text-muted hover:text-foreground">
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleCopyLink} className="text-muted hover:text-foreground" title="Copy room link">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Viewers */}
          <button
            onClick={() => setShowViewers(!showViewers)}
            className="btn-secondary text-xs py-1.5 px-3 relative"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{viewers.length}</span>
          </button>

          {/* Settings (owner) */}
          {isOwner && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Subtitle upload */}
          <button
            onClick={() => subtitleInputRef.current?.click()}
            className="btn-secondary text-xs py-1.5 px-3"
            title="Load subtitles (.vtt)"
          >
            <Subtitles className="w-3.5 h-3.5" />
          </button>
          <input
            ref={subtitleInputRef}
            type="file"
            accept=".vtt"
            onChange={handleSubtitleUpload}
            className="hidden"
          />

          {/* Chat toggle (mobile) */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="btn-secondary text-xs py-1.5 px-3 lg:hidden"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Viewers panel */}
      {showViewers && (
        <div className="absolute right-4 top-16 z-50 glass-card p-4 w-56 animate-fade-in">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Viewers ({viewers.length})
          </h3>
          <div className="space-y-2">
            {viewers.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold",
                  getAvatarColor(v.username)
                )}>
                  {v.username[0].toUpperCase()}
                </div>
                <span className="text-sm">{v.username}</span>
                {v.id === room.owner_id && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary">Admin</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings panel (owner) */}
      {showSettings && isOwner && (
        <div className="absolute right-4 top-16 z-50 glass-card p-4 w-80 animate-fade-in">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Room Settings
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Movie URL</label>
              <input
                type="text"
                value={movieUrl}
                onChange={(e) => setMovieUrl(e.target.value)}
                placeholder="Paste movie URL here"
                className="input-glass text-sm py-2"
              />
            </div>
            <button onClick={handleSetMovie} className="btn-primary text-sm w-full">
              <Film className="w-4 h-4" />
              Set Movie
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Video section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 bg-black flex items-center justify-center relative">
            {room.movie_url ? (
              <video
                ref={videoRef}
                src={room.movie_url}
                controls
                crossOrigin="anonymous"
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
                onEnded={handleEnded}
                className="w-full h-full"
                style={{ objectFit: "contain" }}
              />
            ) : (
              <div className="text-center p-8">
                <Film className="w-16 h-16 text-muted mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No movie loaded</p>
                {isOwner ? (
                  <p className="text-sm text-muted">
                    Click the <Settings className="w-3 h-3 inline" /> icon to set a movie URL
                  </p>
                ) : (
                  <p className="text-sm text-muted">
                    Waiting for the host to load a movie...
                  </p>
                )}
              </div>
            )}

            {/* Playback indicator */}
            {!isOwner && room.movie_url && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 text-xs">
                {playbackState?.is_playing ? (
                  <>
                    <Play className="w-3 h-3 text-success fill-success" />
                    <span className="text-success">Synced</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 text-yellow-400" />
                    <span className="text-yellow-400">Paused</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Room info bar */}
          <div className="px-4 py-2 border-t border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <Film className="w-4 h-4 text-muted" />
              <span className="text-muted-foreground truncate max-w-xs">
                {room.movie_name || "No movie"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              {viewers.length} watching
            </div>
          </div>
        </div>

        {/* Chat sidebar (desktop) */}
        <div className={cn(
          "w-full lg:w-80 border-l border-border shrink-0",
          showChat ? "flex flex-col" : "hidden",
          isFullscreen ? "hidden" : "",
          "lg:flex lg:flex-col"
        )}
        style={{ height: "calc(100vh - 57px)" }}
        >
          {chatPanel}
        </div>

        {/* Mobile chat overlay */}
        {showChat && !isFullscreen && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-80 border-t border-border bg-background">
            {chatPanel}
          </div>
        )}
      </div>

      {/* Fullscreen chat */}
      {isFullscreen && showChat && chatPanel}

      {/* Notifications */}
      {notifications.map((msg, i) => (
        <div
          key={i}
          className="fullscreen-notification"
          style={{ bottom: `${80 + i * 40}px` }}
        >
          <div className="glass-card-sm px-4 py-2 text-sm">{msg}</div>
        </div>
      ))}
    </div>
  );
}
