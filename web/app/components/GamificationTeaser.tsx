"use client";
// Author: Subash Karki

import { motion } from "motion/react";

const GamificationTeaser = () => {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent-pink)]">
          Gamification
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Ship code.{" "}
          <span className="text-gradient">Level up.</span>
        </h2>
        <p className="mt-6 text-lg text-[var(--color-fg-muted)]">
          XP system, daily quests, achievements, and rank progression. Because coding should feel
          rewarding.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {["XP Tracking", "Daily Quests", "Achievements", "Rank Progression", "Leaderboard"].map(
            (badge, i) => (
              <motion.span
                key={badge}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.06 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] glass px-3.5 py-1.5 text-xs font-medium text-[var(--color-fg-muted)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-pink)]" />
                {badge}
              </motion.span>
            ),
          )}
        </div>
      </motion.div>
    </section>
  );
};

export default GamificationTeaser;
