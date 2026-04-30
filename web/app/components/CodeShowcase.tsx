"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

const lines = [
  { kind: "comment", text: "// One window. Every dev tool. Shared context." },
  { kind: "code", text: "$ git status" },
  { kind: "result", text: "  M  src/api/routes.ts" },
  { kind: "result", text: "  M  src/db/schema.ts" },
  { kind: "result", text: "  ↳ diff pane updates instantly" },
  { kind: "result", text: "  ↳ editor sees both files" },
  { kind: "ai", text: "✦ ai pane: same context — no copy-paste" },
];

const colorFor = (kind: string) => {
  switch (kind) {
    case "comment":
      return "text-[var(--color-fg-subtle)]";
    case "code":
      return "text-[var(--color-fg)]";
    case "result":
      return "text-sky-300";
    case "ai":
      return "text-violet-300";
    default:
      return "text-[var(--color-fg)]";
  }
};

const CodeShowcase = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [25, 0, -10]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 1, 0.95]);

  return (
    <section ref={ref} className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent-violet)]">
          Shared context
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Tools that <span className="text-gradient">talk to each other.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--color-fg-muted)]">
          The terminal, editor, and AI all share state. When git changes, the diff updates. When you
          edit, the AI sees it.
        </p>
      </motion.div>

      <motion.div
        style={{ rotateX, scale, transformPerspective: 1200 }}
        className="relative mx-auto max-w-3xl"
      >
        <div className="overflow-hidden rounded-2xl glass shadow-2xl shadow-black/40">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-elevated)]/40 px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="ml-3 flex gap-1.5 font-mono text-[11px]">
              <span className="rounded-md bg-[var(--color-bg)]/70 px-2 py-0.5 text-[var(--color-fg)]">
                terminal
              </span>
              <span className="rounded-md px-2 py-0.5 text-[var(--color-fg-subtle)]">editor</span>
              <span className="rounded-md px-2 py-0.5 text-[var(--color-fg-subtle)]">ai-chat</span>
              <span className="rounded-md px-2 py-0.5 text-[var(--color-fg-subtle)]">diff</span>
            </div>
          </div>
          {/* Body */}
          <div className="space-y-1.5 px-6 py-6 font-mono text-sm sm:text-[15px]">
            {lines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.35, delay: 0.5 + i * 0.12 }}
                className={`${colorFor(line.kind)} leading-relaxed`}
              >
                {line.text}
              </motion.div>
            ))}
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + lines.length * 0.12 }}
              className="inline-block h-4 w-2 translate-y-1 bg-[var(--color-accent)]"
              style={{ animation: "glow-pulse 1.2s ease-in-out infinite" }}
            />
          </div>
        </div>
        {/* Reflection / glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 -bottom-12 h-24 rounded-full bg-gradient-to-r from-sky-500/20 via-violet-500/20 to-pink-500/20 blur-3xl"
        />
      </motion.div>
    </section>
  );
};

export default CodeShowcase;
