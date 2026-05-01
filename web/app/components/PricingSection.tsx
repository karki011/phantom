"use client";
// Author: Subash Karki

import { motion } from "motion/react";

const PricingSection = () => {
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
          Pricing
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Free app.{" "}
          <span className="text-gradient">Bring your model.</span>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Claude Subscription */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          whileHover={{ y: -4 }}
          className="group relative overflow-hidden rounded-2xl glass p-8"
        >
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-400/5 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Subscription
            </div>
            <h3 className="text-2xl font-semibold">Claude Subscription</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Already have Claude Max or Enterprise? Just log in. Zero config.
              Flat monthly fee.
            </p>
          </div>
        </motion.div>

        {/* API Key (BYOK) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          whileHover={{ y: -4 }}
          className="group relative overflow-hidden rounded-2xl glass p-8"
        >
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-400/20 to-sky-400/5 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            aria-hidden
          />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--color-fg-muted)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              BYOK
            </div>
            <h3 className="text-2xl font-semibold">API Key</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Use your own Anthropic API key. Stored in macOS Keychain.
              Pay per token. Full cost visibility.
            </p>
          </div>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-6 text-center text-sm text-[var(--color-fg-subtle)]"
      >
        All Phantom features work with both options. The AI engine, graph intelligence,
        hooks, and safety scanning are 100% local.
      </motion.p>
    </section>
  );
};

export default PricingSection;
