import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phantom — A native dev workspace for macOS",
  description:
    "Terminal, editor, AI chat, git diff, and journal in one tabbed pane system. Built on Wails + SolidJS. macOS only.",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
};

export default RootLayout;
