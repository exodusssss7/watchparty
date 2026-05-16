"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Popcorn, Upload, Film, CheckCircle, XCircle, ArrowLeft, FileVideo
} from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
        return;
      }
      setUserId(session.user.id);
    });
  }, [router]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.includes("mp4") && !selected.name.endsWith(".mp4")) {
      setErrorMsg("Only MP4 files are supported");
      setStatus("error");
      return;
    }

    if (selected.size > 50 * 1024 * 1024) {
      setErrorMsg("File size must be under 50MB (Supabase free tier limit)");
      setStatus("error");
      return;
    }

    setFile(selected);
    setStatus("idle");
    setErrorMsg("");
  };

  const handleUpload = async () => {
    if (!file || !userId) return;

    setUploading(true);
    setStatus("uploading");
    setProgress(0);

    const fileName = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // Simulate progress since Supabase JS doesn't provide upload progress natively
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 300);

    const { error } = await supabase.storage
      .from("movies")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    clearInterval(progressInterval);

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      setUploading(false);
      return;
    }

    setProgress(100);

    const { data: urlData } = supabase.storage
      .from("movies")
      .getPublicUrl(fileName);

    setUploadedUrl(urlData.publicUrl);
    setStatus("success");
    setUploading(false);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(uploadedUrl);
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Popcorn className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold">Movie Party</span>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="btn-secondary text-sm py-2 px-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </nav>

      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="glass-card p-8 animate-fade-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Upload Movie</h1>
            <p className="text-muted-foreground text-sm">
              Upload an MP4 file to share with your watch party (max 50MB)
            </p>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/40 rounded-2xl p-10 text-center cursor-pointer transition-all mb-6"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,.mp4"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileVideo className="w-8 h-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Film className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  Click to select an MP4 file
                </p>
              </>
            )}
          </div>

          {/* Progress */}
          {status === "uploading" && (
            <div className="mb-6 animate-fade-in">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="text-primary font-medium">{Math.round(progress)}%</span>
              </div>
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success */}
          {status === "success" && (
            <div className="mb-6 p-4 rounded-xl bg-success/10 border border-success/20 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="font-medium text-success">Upload successful!</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={uploadedUrl}
                  readOnly
                  className="input-glass text-xs flex-1 py-2"
                />
                <button onClick={handleCopyUrl} className="btn-secondary text-xs py-2 px-3">
                  Copy
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Use this URL when creating a room, or paste it in an existing room.
              </p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 animate-fade-in">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-danger" />
                <span className="text-danger text-sm">{errorMsg}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary w-full"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : "Upload Movie"}
          </button>
        </div>
      </div>
    </div>
  );
}
