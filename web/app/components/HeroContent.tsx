"use client";

import { motion } from "motion/react";

type Props = {
  releaseTag?: string;
  releaseDate?: string;
  downloadUrl: string;
  downloadSize?: string;
  hasRelease: boolean;
};

const HeroContent = ({ releaseTag, releaseDate, downloadUrl, downloadSize, hasRelease }: Props) => {
  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] glass px-3.5 py-1.5 text-xs font-medium text-[var(--color-fg-muted)]"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        </span>
        macOS only · pre-release
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="text-7xl font-semibold tracking-tight sm:text-8xl md:text-[9rem] lg:text-[10rem]"
        style={{ letterSpacing: "-0.04em", lineHeight: 0.9 }}
      >
        <span className="text-gradient">Phantom</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="mt-7 max-w-xl text-lg text-[var(--color-fg-muted)] md:text-xl"
      >
        A native desktop workspace for developers. Terminal, editor, AI chat, git diff, and journal
        — collapsed into one tabbed pane system.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        {hasRelease ? (
          <a
            href={downloadUrl}
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-xl bg-[var(--color-fg)] px-7 py-4 text-base font-semibold text-[var(--color-bg)] transition hover:scale-[1.02] active:scale-[0.99]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
            </svg>
            <span>Download for macOS</span>
            {releaseTag && (
              <span className="font-mono text-xs font-normal opacity-60">
                {releaseTag} {downloadSize ? `· ${downloadSize}` : ""}
              </span>
            )}
          </a>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] glass px-5 py-3 font-mono text-sm text-[var(--color-fg-muted)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
            Build coming soon
          </div>
        )}

        <p className="font-mono text-xs text-[var(--color-fg-subtle)]">
          Universal binary — works on Apple Silicon and Intel
          {releaseDate ? ` · released ${releaseDate}` : ""}
        </p>
      </motion.div>
    </div>
  );
};

export default HeroContent;
