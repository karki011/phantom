# Release setup

How automated releases work for Phantom — from a `feat:` commit on `main` to a signed, notarized macOS zip on the GitHub Releases page.

## The flow (automated)

```
commit on main with conventional message
        │
        ▼
release-please.yml opens / updates a "Release v0.1.2" PR
        │
        ▼  (you merge the PR)
        │
release-please tags v0.1.2 + creates a GitHub Release
        │
        ▼  (tag push with PAT triggers next workflow)
        │
release.yml builds, signs, notarizes, attaches zip to the release
```

Two workflows, one feedback loop.

## Workflow files

| File | Triggered by | Job |
|---|---|---|
| `.github/workflows/release-please.yml` | every push to `main` | maintains the open "Release vX.Y.Z" PR with changelog and version bumps |
| `.github/workflows/release.yml` | tag push `v*.*.*` (also `workflow_dispatch` for dry-runs) | macOS-15 runner: build, codesign, notarize, staple, zip, attach to GitHub Release |

## Conventional commits — how versions get chosen

`release-please` reads commit messages on `main` since the last release and picks the next version automatically:

| Commit prefix | Effect |
|---|---|
| `feat: ...` | Minor bump (0.1.1 → 0.2.0 — pre-1.0 mode) |
| `fix: ...` | Patch bump (0.1.1 → 0.1.2) |
| `feat!: ...` or `BREAKING CHANGE:` in body | Major bump (0.1.1 → 0.2.0 in pre-1.0; would be 1.0.0 post-1.0) |
| `chore:`, `docs:`, `test:`, `style:`, `refactor:`, `perf:`, `build:`, `ci:` | No release bump (but `docs`, `perf`, `refactor` show in changelog) |

Examples:
```
feat: add split-pane drag to resize
fix: terminal scrollback lost on worktree switch
chore: bump go deps
```

## Required GitHub secrets

Set these at **Settings → Secrets and variables → Actions** on `karki011/phantom`:

| Secret | What it is | Required by |
|---|---|---|
| `RELEASE_PLEASE_TOKEN` | Fine-grained PAT with `contents:write` + `pull-requests:write` on `karki011/phantom` | release-please workflow (so its tag push triggers `release.yml`) |
| `APPLE_DEVELOPER_CERTIFICATE_P12_BASE64` | Developer ID Application cert + key, exported as `.p12`, base64-encoded | release.yml signing step |
| `APPLE_DEVELOPER_CERTIFICATE_PASSWORD` | Password set during the `.p12` export | release.yml signing step |
| `APPLE_ID` | Apple ID email | release.yml notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from https://appleid.apple.com | release.yml notarization |
| `APPLE_TEAM_ID` | Developer team ID (`Z825V2BBX9`) | release.yml notarization |

## Setting up the PAT (`RELEASE_PLEASE_TOKEN`)

`GITHUB_TOKEN`-triggered tag pushes don't fire other workflows by design. release-please needs a PAT so its tag push wakes up `release.yml`.

1. Go to https://github.com/settings/personal-access-tokens/new (fine-grained PATs)
2. **Token name:** `release-please-phantom`
3. **Resource owner:** `karki011`
4. **Repository access:** Only select repositories → `karki011/phantom`
5. **Repository permissions:**
   - Contents: **Read and write**
   - Pull requests: **Read and write**
   - Metadata: Read-only (auto)
6. **Expiration:** 1 year (or "No expiration" if you don't want to manage rotation)
7. Click **Generate token** → copy the value
8. On the repo: Settings → Secrets and variables → Actions → New repository secret
   - Name: `RELEASE_PLEASE_TOKEN`
   - Value: paste the token

## Exporting the Apple Developer ID certificate

1. Open **Keychain Access** → **login** keychain → **Certificates**
2. Find `Developer ID Application: Subash Karki (Z825V2BBX9)`
3. Click the disclosure triangle so the **private key** under it is also visible
4. Select **both** (cert + key) → right-click → **Export 2 items…**
5. Save as `phantom-signing.p12` and set a password (this is the `APPLE_DEVELOPER_CERTIFICATE_PASSWORD` secret)
6. Base64-encode and pipe straight into the GitHub secret:
   ```bash
   base64 -i phantom-signing.p12 | gh secret set APPLE_DEVELOPER_CERTIFICATE_P12_BASE64 --repo karki011/phantom
   gh secret set APPLE_DEVELOPER_CERTIFICATE_PASSWORD --repo karki011/phantom   # type at prompt
   ```
7. Delete the local `.p12` file:
   ```bash
   rm phantom-signing.p12
   ```

## Cutting a release (the easy way)

1. Land your commits on `main` using conventional messages (`feat:`, `fix:`, etc.)
2. release-please opens a PR titled "chore(main): release X.Y.Z"
3. Review the auto-generated CHANGELOG and bumped versions
4. **Merge the PR**
5. Tag is created → release.yml runs → ~10 min later the signed zip appears on https://github.com/karki011/phantom/releases

## Cutting a release manually (the escape hatch)

If you want to bypass release-please for an out-of-band release:

```bash
cd /Users/subash.karki/phantom-os
git tag v0.1.2 && git push origin v0.1.2
```

Tag push triggers `release.yml`. Build runs, signed zip uploads, GitHub Release is created with an empty body (you can edit it on GitHub).

## Manual / dry-run build (no release created)

Want to test the build pipeline without cutting a release?

1. **Actions → Release → Run workflow**
2. Branch: `main`, Version: `0.1.2-test` (or blank to use `wails.json`'s value)
3. Zip uploads as a workflow artifact only — no tag, no GitHub Release

## Local releases

Local releases still work via `make release-zip` from `v2/`. Credentials come from the gitignored `phantom-os/.env.notarize` file.
