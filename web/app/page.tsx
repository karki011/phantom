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
const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-xs text-[var(--color-fg-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        macOS only · pre-release
      </div>

      <h1 className="text-center text-6xl font-semibold tracking-tight md:text-7xl">
        Phantom
      </h1>

      <p className="mt-5 max-w-xl text-center text-lg text-[var(--color-fg-muted)] md:text-xl">
        A native desktop workspace for developers. Terminal, editor, AI chat, git diff, and
        journal — in one tabbed pane system.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3">
        {zipAsset ? (
          <a
            href={zipAsset.browser_download_url}
            className="inline-flex items-center gap-3 rounded-xl bg-[var(--color-fg)] px-7 py-4 text-base font-medium text-[var(--color-bg)] transition hover:opacity-90"
          >
            Download for macOS
            <span className="text-sm font-normal opacity-60">
              {release?.tag_name} · {formatSize(zipAsset.size)}
            </span>
          </a>
        ) : (
          <a
            href={RELEASES_URL}
            className="inline-flex items-center gap-3 rounded-xl bg-[var(--color-fg)] px-7 py-4 text-base font-medium text-[var(--color-bg)] transition hover:opacity-90"
          >
            View releases on GitHub
          </a>
        )}

        <p className="text-sm text-[var(--color-fg-subtle)]">
          Universal binary — works on Apple Silicon and Intel
          {release?.published_at ? ` · released ${formatDate(release.published_at)}` : ""}
        </p>
      </div>

      <ul className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-3 text-sm md:grid-cols-2">
        {[
          ["Terminal", "Full PTY with shell integration"],
          ["Editor", "Monaco-based with diff support"],
          ["AI Chat", "Code-aware context injection"],
          ["Git Diff", "Live diff viewer"],
          ["Journal", "Per-project journaling"],
          ["Hooks + MCP", "AI acts on file changes and shell commands"],
        ].map(([title, desc]) => (
          <li
            key={title}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3"
          >
            <div className="font-medium">{title}</div>
            <div className="mt-1 text-[var(--color-fg-muted)]">{desc}</div>
          </li>
        ))}
      </ul>

      <footer className="mt-20 flex flex-col items-center gap-2 text-sm text-[var(--color-fg-subtle)]">
        <div className="flex gap-5">
          <a
            href={REPO_URL}
            className="hover:text-[var(--color-fg)] transition"
          >
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            className="hover:text-[var(--color-fg)] transition"
          >
            Releases
          </a>
          <a
            href={`${REPO_URL}/issues`}
            className="hover:text-[var(--color-fg)] transition"
          >
            Issues
          </a>
        </div>
        <div>Built by Subash Karki</div>
      </footer>
    </main>
  );
};

export default Page;
