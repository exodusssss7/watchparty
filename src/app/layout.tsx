import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Party - Watch Together",
  description: "Watch movies together with friends in perfect sync",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="gradient-bg min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
