"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Popcorn, UserPlus, Mail, Lock, User } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/dashboard");
    });
  }, [router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
          is_guest: false,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        username: username.trim(),
        avatar_url: null,
      });
    }

    if (data.session) {
      router.push("/dashboard");
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md p-8 text-center animate-fade-in">
          <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-xl font-bold mb-2">Check your email</h2>
          <p className="text-muted-foreground text-sm mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account.
          </p>
          <button onClick={() => router.push("/login")} className="btn-primary">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

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
          <p className="text-muted-foreground text-sm">Create your account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-glass pl-11"
                required
                maxLength={30}
              />
            </div>
          </div>
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
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glass pl-11"
                required
                minLength={6}
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            <UserPlus className="w-4 h-4" />
            {loading ? "Creating account..." : "Create account"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
