import Hero3D from "./components/Hero3D";
import HeroContent from "./components/HeroContent";
import FeatureGrid from "./components/FeatureGrid";
import CodeShowcase from "./components/CodeShowcase";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type LatestRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
};

const GITHUB_OWNER = "karki011";
const GITHUB_REPO = "phantom";
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

const fetchLatestRelease = async (): Promise<LatestRelease | null> => {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        next: { revalidate: 3600 },
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as LatestRelease;
  } catch {
    return null;
  }
};

const formatSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const Page = async () => {
  const release = await fetchLatestRelease();
  const zipAsset = release?.assets.find((a) => a.name.endsWith(".zip"));
  const hasRelease = Boolean(zipAsset);

  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <main className="relative">
        {/* HERO */}
        <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6 pb-24 pt-16 sm:pt-20">
          {/* 3D scene fills the section behind the text */}
          <div className="absolute inset-0 opacity-70 sm:opacity-90">
            <Hero3D />
          </div>
          {/* Bottom gradient fade for legibility */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[var(--color-bg)]"
          />
          <div className="relative z-10 mx-auto w-full max-w-3xl">
            <HeroContent
              releaseTag={release?.tag_name}
              releaseDate={release?.published_at ? formatDate(release.published_at) : undefined}
              downloadUrl={zipAsset ? zipAsset.browser_download_url : RELEASES_URL}
              downloadSize={zipAsset ? formatSize(zipAsset.size) : undefined}
              hasRelease={hasRelease}
            />
          </div>
          {/* Scroll cue */}
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[var(--color-fg-subtle)]">
            <div className="flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-widest opacity-70">
              <span>scroll</span>
              <span className="block h-8 w-px bg-gradient-to-b from-[var(--color-fg-subtle)] to-transparent" />
            </div>
          </div>
        </section>

        {/* CODE SHOWCASE */}
        <CodeShowcase />

        {/* FEATURES */}
        <FeatureGrid />

        {/* CTA */}
        <section className="relative mx-auto w-full max-w-3xl px-6 py-24 text-center sm:py-32">
          <div className="relative overflow-hidden rounded-3xl glass p-10 sm:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[var(--color-accent)]/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[var(--color-accent-violet)]/20 blur-3xl"
            />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Ready to <span className="text-gradient">collapse the tabs?</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[var(--color-fg-muted)]">
                One install. Universal binary. Works on Apple Silicon and Intel.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3">
                <a
                  href={zipAsset ? zipAsset.browser_download_url : RELEASES_URL}
                  className="inline-flex items-center gap-3 rounded-xl bg-[var(--color-fg)] px-7 py-4 text-base font-semibold text-[var(--color-bg)] transition hover:scale-[1.02] active:scale-[0.99]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
                  </svg>
                  {hasRelease ? "Download for macOS" : "View on GitHub"}
                  {hasRelease && release?.tag_name && (
                    <span className="font-mono text-xs font-normal opacity-60">
                      {release.tag_name}
                    </span>
                  )}
                </a>
                <p className="font-mono text-xs text-[var(--color-fg-subtle)]">
                  Universal binary — Apple Silicon + Intel
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative mx-auto w-full max-w-5xl px-6 pb-12 pt-6 text-center">
          <div className="flex flex-col items-center gap-1 font-mono text-xs text-[var(--color-fg-subtle)]">
            <div>Built by Subash Karki</div>
            <div className="opacity-60">
              v0.1.1 · Wails (Go) + SolidJS · macOS universal
            </div>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Page;
