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

        <div className="h-24" aria-hidden />
      </main>
    </>
  );
};

export default Page;
