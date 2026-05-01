"use client";
// Author: Subash Karki

import { motion } from "motion/react";

type Props = {
  downloadUrl: string;
  releaseTag?: string;
  downloadSize?: string;
  hasRelease: boolean;
};

const GITHUB_URL = "https://github.com/karki011/phantom";

const DownloadCTA = ({ downloadUrl, releaseTag, downloadSize, hasRelease }: Props) => {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Download <span className="text-gradient">Phantom</span> for macOS
        </h2>
        <p className="mt-4 text-[var(--color-fg-muted)]">
          Universal binary. Works on Apple Silicon and Intel.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
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

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] glass px-5 py-3.5 text-sm font-medium text-[var(--color-fg-muted)] transition hover:border-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </motion.div>

      {/* Bottom glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-16 -bottom-4 h-32 rounded-full bg-gradient-to-r from-sky-500/15 via-violet-500/15 to-pink-500/15 blur-3xl"
      />
    </section>
  );
};

export default DownloadCTA;
