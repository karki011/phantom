"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

type Feature = {
  title: string;
  desc: string;
  icon: ReactNode;
  accent: string;
};

const features: Feature[] = [
  {
    title: "Terminal",
    desc: "xterm.js 6.0 with GPU-accelerated WebGL rendering. Multi-tab, up to 6 split panes per tab, hot-persistent PTYs that survive tab switches, ring-buffer scrollback, and 497 built-in themes.",
    accent: "from-sky-400/30 to-cyan-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 9 3 3-3 3M13 15h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Editor",
    desc: "Monaco-based code editor with syntax highlighting, inline diff review, git blame, and per-tab context menus. Native window-level fonts and ligatures.",
    accent: "from-violet-400/30 to-fuchsia-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M14 4v5h6M8 13h8M8 17h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "AI Sessions",
    desc: "Multi-provider out of the box: Claude Code, Codex, and Gemini. Auto-detects CLIs on your PATH, scopes sessions per worktree, and lets you add custom providers via YAML.",
    accent: "from-pink-400/30 to-rose-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M21 12a8 8 0 1 1-3.5-6.6L21 4l-1.6 3.5A8 8 0 0 1 21 12Z" />
        <circle cx="9" cy="12" r="1" fill="currentColor" />
        <circle cx="13" cy="12" r="1" fill="currentColor" />
        <circle cx="17" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Git Worktrees",
    desc: "First-class worktree support — work on multiple branches without stashing. Each worktree gets its own terminal context, sessions, and a live diff viewer that reacts to filesystem changes.",
    accent: "from-emerald-400/30 to-teal-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M6 8.5v7A2.5 2.5 0 0 0 8.5 18H15M18 15.5v-7A2.5 2.5 0 0 0 15.5 6H9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Daily Digest",
    desc: "Morning brief that summarizes yesterday's commits, sessions, and decisions per project. Persisted in local SQLite so it stays with you across worktrees.",
    accent: "from-amber-400/30 to-orange-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Hooks + MCP",
    desc: "Hook-aware AI engine. Pre/post-edit and shell hooks fire on every file change and command. MCP channels let any model see exactly what just happened — no copy-paste briefing.",
    accent: "from-indigo-400/30 to-blue-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M12 3v6M12 21v-6M3 12h6M21 12h-6" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

const FeatureGrid = () => {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent)]">
          One workspace
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Every developer tool, <span className="text-gradient">one tabbed pane.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--color-fg-muted)]">
          Stop alt-tabbing. Phantom collapses your terminal, editor, AI chat, git diff, and journal
          into a single window with shared context.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl glass p-6"
          >
            <div
              className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${f.accent} blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              aria-hidden
            />
            <div className="relative">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-accent)]">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default FeatureGrid;
