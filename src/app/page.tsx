"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Film, Users, Play, Popcorn, ArrowRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Popcorn className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold">Movie Party</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/login")}
            className="btn-secondary text-sm"
          >
            Log in
          </button>
          <button
            onClick={() => router.push("/signup")}
            className="btn-primary text-sm"
          >
            Sign up
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-3xl text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-light text-primary text-sm font-medium mb-6">
            <Play className="w-4 h-4" />
            Watch movies together in real-time
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Movie nights,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              reimagined
            </span>
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Create a room, upload your movie, invite friends, and watch
            together in perfect sync — with live chat and full playback control.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => router.push("/signup")}
              className="btn-primary text-base px-8 py-3"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => router.push("/login?guest=true")}
              className="btn-secondary text-base px-8 py-3"
            >
              Join as Guest
            </button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="glass-card p-6 text-center">
              <Film className="w-10 h-10 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Upload Movies</h3>
              <p className="text-sm text-muted-foreground">
                Upload MP4 files and share them instantly with your party
              </p>
            </div>
            <div className="glass-card p-6 text-center">
              <Users className="w-10 h-10 text-secondary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Watch Together</h3>
              <p className="text-sm text-muted-foreground">
                Perfectly synced playback so everyone watches the same frame
              </p>
            </div>
            <div className="glass-card p-6 text-center">
              <Play className="w-10 h-10 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Live Chat</h3>
              <p className="text-sm text-muted-foreground">
                React and chat in real-time while watching your movie
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
