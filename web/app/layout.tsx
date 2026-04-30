import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Phantom — A native dev workspace for macOS",
  description:
    "Terminal, editor, AI chat, git diff, and journal collapsed into one tabbed pane system. Native macOS, universal binary. Built on Wails + SolidJS.",
  metadataBase: new URL("https://phantom.dev"),
  openGraph: {
    title: "Phantom — A native dev workspace for macOS",
    description:
      "Every developer tool in one tabbed pane system. Terminal, editor, AI chat, git diff, journal. Native macOS.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d2235",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
};

export default RootLayout;
