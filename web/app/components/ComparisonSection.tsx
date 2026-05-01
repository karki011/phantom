"use client";
// Author: Subash Karki

import { motion } from "motion/react";

type Row = {
  feature: string;
  phantom: string;
  claudeCode: string;
  cursor: string;
  windsurf: string;
};

const rows: Row[] = [
  {
    feature: "Native desktop app",
    phantom: "✓",
    claudeCode: "Terminal",
    cursor: "Fork of VS Code",
    windsurf: "Fork of VS Code",
  },
  {
    feature: "Multi-provider",
    phantom: "✓",
    claudeCode: "—",
    cursor: "✓",
    windsurf: "✓",
  },
  {
    feature: "Dependency graph",
    phantom: "✓",
    claudeCode: "—",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "8 reasoning strategies",
    phantom: "✓",
    claudeCode: "—",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "PII / safety scanning",
    phantom: "✓",
    claudeCode: "—",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "Session cost tracking",
    phantom: "✓",
    claudeCode: "—",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "Gamification",
    phantom: "✓",
    claudeCode: "—",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "Hook system",
    phantom: "✓",
    claudeCode: "✓",
    cursor: "—",
    windsurf: "—",
  },
  {
    feature: "Git worktree support",
    phantom: "✓",
    claudeCode: "Manual",
    cursor: "Basic",
    windsurf: "Basic",
  },
];

const cellColor = (value: string) => {
  if (value === "✓") return "text-emerald-400";
  if (value === "—") return "text-[var(--color-fg-subtle)]";
  return "text-[var(--color-fg-muted)]";
};

const ComparisonSection = () => {
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
          Compare
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          How Phantom{" "}
          <span className="text-gradient">stacks up.</span>
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="overflow-x-auto rounded-2xl glass"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]/50">
              <th className="px-6 py-4 font-medium text-[var(--color-fg-muted)]">Feature</th>
              <th className="px-4 py-4 text-center font-semibold text-[var(--color-accent)]">Phantom</th>
              <th className="px-4 py-4 text-center font-medium text-[var(--color-fg-muted)]">Claude Code</th>
              <th className="px-4 py-4 text-center font-medium text-[var(--color-fg-muted)]">Cursor</th>
              <th className="px-4 py-4 text-center font-medium text-[var(--color-fg-muted)]">Windsurf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.feature}
                className={i < rows.length - 1 ? "border-b border-[var(--color-border-subtle)]/40" : ""}
              >
                <td className="px-6 py-3.5 font-medium">{row.feature}</td>
                <td className={`px-4 py-3.5 text-center font-semibold ${cellColor(row.phantom)}`}>
                  {row.phantom}
                </td>
                <td className={`px-4 py-3.5 text-center ${cellColor(row.claudeCode)}`}>
                  {row.claudeCode}
                </td>
                <td className={`px-4 py-3.5 text-center ${cellColor(row.cursor)}`}>
                  {row.cursor}
                </td>
                <td className={`px-4 py-3.5 text-center ${cellColor(row.windsurf)}`}>
                  {row.windsurf}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </section>
  );
};

export default ComparisonSection;
