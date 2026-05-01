"use client";
// Author: Subash Karki

import { motion } from "motion/react";
import type { ReactNode } from "react";

type Strategy = {
  name: string;
  desc: string;
  icon: ReactNode;
};

const strategies: Strategy[] = [
  {
    name: "Direct",
    desc: "Fast single-pass for simple tasks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Decompose",
    desc: "Break complex goals into subtasks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    name: "Advisor",
    desc: "Expert consultation pattern",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    name: "Self-Refine",
    desc: "Iterative self-improvement loop",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M21 12a9 9 0 1 1-6.219-8.563" strokeLinecap="round" />
        <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Tree of Thought",
    desc: "Branching exploration of solutions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M12 3v6M12 9l-6 6M12 9l6 6M6 15v3M18 15v3M12 9v9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Debate",
    desc: "Adversarial reasoning for robust answers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Graph of Thought",
    desc: "Dependency-aware reasoning along code edges",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <circle cx="5" cy="6" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M7 7l3 3M14 13l3 3M14 11l3-3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Auto-Tune",
    desc: "Learns which strategy works for your codebase",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22" strokeLinecap="round" />
        <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" strokeLinecap="round" />
      </svg>
    ),
  },
];

type SafetyFeature = {
  title: string;
  desc: string;
  icon: ReactNode;
  accent: string;
};

const safetyFeatures: SafetyFeature[] = [
  {
    title: "Dependency Graph",
    desc: "Knows what breaks before you change it",
    accent: "from-emerald-400/30 to-teal-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <circle cx="4" cy="4" r="2" />
        <circle cx="20" cy="4" r="2" />
        <circle cx="4" cy="20" r="2" />
        <circle cx="20" cy="20" r="2" />
        <path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Hallucination Detection",
    desc: "Verifies every file path the model references",
    accent: "from-amber-400/30 to-orange-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    ),
  },
  {
    title: "PII Scanner",
    desc: "Catches API keys and passwords before they leak",
    accent: "from-red-400/30 to-rose-400/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

const AIEngineSection = () => {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent-violet)]">
          AI Engine
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          8 reasoning strategies.{" "}
          <span className="text-gradient">One intelligent orchestrator.</span>
        </h2>
      </motion.div>

      {/* Strategy grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {strategies.map((s, i) => (
          <motion.div
            key={s.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            whileHover={{ y: -3 }}
            className="group relative overflow-hidden rounded-xl glass p-4"
          >
            <div
              className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-violet-400/15 to-fuchsia-400/5 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div className="relative">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-accent-violet)]">
                {s.icon}
              </div>
              <h3 className="text-sm font-semibold">{s.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Safety features */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {safetyFeatures.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
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

export default AIEngineSection;
