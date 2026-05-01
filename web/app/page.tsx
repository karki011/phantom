// Author: Subash Karki
import Hero3D from "./components/Hero3D";
import HeroContent from "./components/HeroContent";
import ComposerShowcase from "./components/ComposerShowcase";
import AIEngineSection from "./components/AIEngineSection";
import FeatureGrid from "./components/FeatureGrid";
import ProvidersSection from "./components/ProvidersSection";
import PricingSection from "./components/PricingSection";
import ComparisonSection from "./components/ComparisonSection";
import GamificationTeaser from "./components/GamificationTeaser";
import DownloadCTA from "./components/DownloadCTA";
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
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      {
        next: { revalidate: 300 },
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as LatestRelease[];
    return releases.find((r) => r.assets.length > 0) ?? releases[0] ?? null;
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
  const downloadUrl = zipAsset ? zipAsset.browser_download_url : RELEASES_URL;
  const downloadSize = zipAsset ? formatSize(zipAsset.size) : undefined;

  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <main className="relative">
        {/* HERO */}
        <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6 pb-24 pt-16 sm:pt-20">
          <div className="absolute inset-0 opacity-70 sm:opacity-90">
            <Hero3D />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[var(--color-bg)]"
          />
          <div className="relative z-10 mx-auto w-full max-w-3xl">
            <HeroContent
              releaseTag={release?.tag_name}
              releaseDate={release?.published_at ? formatDate(release.published_at) : undefined}
              downloadUrl={downloadUrl}
              downloadSize={downloadSize}
              hasRelease={hasRelease}
            />
          </div>
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[var(--color-fg-subtle)]">
            <div className="flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-widest opacity-70">
              <span>scroll</span>
              <span className="block h-8 w-px bg-gradient-to-b from-[var(--color-fg-subtle)] to-transparent" />
            </div>
          </div>
        </section>

        {/* COMPOSER SHOWCASE */}
        <ComposerShowcase />

        {/* AI ENGINE */}
        <AIEngineSection />

        {/* SHARED CONTEXT */}
        <CodeShowcase />

        {/* WORKSPACE FEATURES */}
        <FeatureGrid />

        {/* MULTI-PROVIDER */}
        <ProvidersSection />

        {/* PRICING */}
        <PricingSection />

        {/* COMPARISON */}
        <ComparisonSection />

        {/* GAMIFICATION */}
        <GamificationTeaser />

        {/* DOWNLOAD CTA */}
        <DownloadCTA
          downloadUrl={downloadUrl}
          releaseTag={release?.tag_name}
          downloadSize={downloadSize}
          hasRelease={hasRelease}
        />

        <div className="h-24" aria-hidden />
      </main>
    </>
  );
};

export default Page;
