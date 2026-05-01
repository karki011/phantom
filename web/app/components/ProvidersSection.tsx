"use client";
// Author: Subash Karki

import { motion } from "motion/react";
import type { ReactNode } from "react";

type Provider = {
  name: string;
  desc: string;
  icon: ReactNode;
  accent: string;
};

const providers: Provider[] = [
  {
    name: "Claude",
    desc: "Anthropic's reasoning model. Subscription or API key.",
    accent: "from-amber-400/25 to-orange-400/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
        <path
          d="M16.5 3L12 13.5 7.5 3H3l9 18 9-18h-4.5Z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    ),
  },
  {
    name: "Codex",
    desc: "OpenAI's agentic coding model. CLI integration.",
    accent: "from-emerald-400/25 to-green-400/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Gemini",
    desc: "Google's multimodal model. CLI integration.",
    accent: "from-sky-400/25 to-blue-400/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
        <path
          d="M12 2L4 7v10l8 5 8-5V7l-8-5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M12 12l8-5M12 12v10M12 12L4 7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const ProvidersSection = () => {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent-pink)]">
          Multi-provider
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Claude, Codex, or Gemini.{" "}
          <span className="text-gradient">Your choice.</span>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {providers.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl glass p-8 text-center"
          >
            <div
              className={`absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${p.accent} blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              aria-hidden
            />
            <div className="relative">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]">
                {p.icon}
              </div>
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{p.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-6 text-center font-mono text-xs text-[var(--color-fg-subtle)]"
      >
        Add custom providers via YAML config
      </motion.p>
    </section>
  );
};

export default ProvidersSection;
