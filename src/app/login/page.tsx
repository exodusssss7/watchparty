"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Popcorn, LogIn, UserCircle, Mail, Lock } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGuest = searchParams.get("guest") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showGuest, setShowGuest] = useState(isGuest);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/dashboard");
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError("Please enter a display name");
      return;
    }
    setLoading(true);
    setError("");

    const guestEmail = `guest_${uuidv4()}@movieparty.guest`;
    const guestPassword = uuidv4();

    const { error: signUpError } = await supabase.auth.signUp({
      email: guestEmail,
      password: guestPassword,
      options: {
        data: {
          username: guestName.trim(),
          is_guest: true,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: guestEmail,
      password: guestPassword,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").upsert({
        id: user.id,
        username: guestName.trim(),
        avatar_url: null,
      });
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-8 animate-fade-in">
        <div className="text-center mb-8">
          <div
            className="flex items-center justify-center gap-2 mb-2 cursor-pointer"
            onClick={() => router.push("/")}
          >
            <Popcorn className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">Movie Party</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {showGuest ? "Join as a guest" : "Sign in to your account"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        {showGuest ? (
          <form onSubmit={handleGuestJoin} className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Display Name</label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="input-glass pl-11"
                  maxLength={30}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Joining..." : "Join as Guest"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              Have an account?{" "}
              <button
                type="button"
                onClick={() => setShowGuest(false)}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-glass pl-11"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-glass pl-11"
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              <LogIn className="w-4 h-4" />
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <div className="flex items-center gap-4 my-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <button
              type="button"
              onClick={() => setShowGuest(true)}
              className="btn-secondary w-full"
            >
              <UserCircle className="w-4 h-4" />
              Join as Guest
            </button>
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="text-primary hover:underline"
              >
                Sign up
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
