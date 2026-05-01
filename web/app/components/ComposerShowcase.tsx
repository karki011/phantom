"use client";
// Author: Subash Karki

import { motion } from "motion/react";
import type { ReactNode } from "react";

type ComposerFeature = {
  title: string;
  desc: string;
  icon: ReactNode;
};

const features: ComposerFeature[] = [
  {
    title: "Session Cost Meter",
    desc: "Running total of API spend per session",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Context Window Gauge",
    desc: "Color-coded progress bar shows context fullness",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <rect x="3" y="8" width="18" height="8" rx="2" />
        <rect x="5" y="10" width="8" height="4" rx="1" fill="currentColor" opacity="0.4" />
      </svg>
    ),
  },
  {
    title: "Turn Efficiency",
    desc: "Duration, tokens, cost, and files per turn",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Edit Card Review",
    desc: "Accept or discard every file change with inline diff",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Auto-Accept Mode",
    desc: "One toggle to trust all edits",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <rect x="1" y="5" width="22" height="14" rx="7" />
        <circle cx="16" cy="12" r="4" fill="currentColor" opacity="0.4" />
      </svg>
    ),
  },
  {
    title: "Model Picker",
    desc: "Switch Sonnet, Opus, or Haiku mid-conversation",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        <circle cx="8" cy="6" r="2" fill="currentColor" opacity="0.4" />
        <circle cx="14" cy="12" r="2" fill="currentColor" opacity="0.4" />
        <circle cx="10" cy="18" r="2" fill="currentColor" opacity="0.4" />
      </svg>
    ),
  },
  {
    title: "Effort Control",
    desc: "Tune reasoning depth: Low to Max",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M12 2L2 7l10 5 10-5-10-5Z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Memory Viewer",
    desc: "See exactly what context the model is working with",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

const ComposerShowcase = () => {
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
          Built-in composer
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          AI coding, <span className="text-gradient">visualized.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--color-fg-muted)]">
          Stream Claude&apos;s thinking in real-time. Review every edit. Track every token. Control
          every model.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl glass p-5"
          >
            <div
              className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-cyan-400/20 to-sky-400/5 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div className="relative">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-accent)]">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-fg-muted)]">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8 text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] glass px-4 py-2 text-xs font-medium text-[var(--color-fg-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          Works with Claude subscription or your own API key
        </span>
      </motion.div>
    </section>
  );
};

export default ComposerShowcase;
