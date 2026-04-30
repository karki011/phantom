# Release setup

How to wire signed + notarized macOS releases on GitHub Actions for Phantom.

## How it works

The `Release` workflow (`.github/workflows/release.yml`) runs when you push a tag matching `v*.*.*` (or via manual `workflow_dispatch`):

1. Checks out the repo on a `macos-15` runner
2. Installs Go 1.25, Node 22, pnpm 10, and the Wails CLI
3. Syncs the resolved version into `v2/wails.json` and `v2/VERSION`
4. Imports your Apple Developer ID certificate into a temporary keychain
5. Runs `make release-zip` (universal build → codesign → notarize → staple → zip)
6. Verifies the signature + notarization staple + Gatekeeper acceptance
7. Uploads `Phantom-X.Y.Z.zip` as a workflow artifact (always)
8. If triggered by a tag push, also creates a GitHub Release with auto-generated release notes and the zip attached

## Required GitHub secrets

Set these on the repo at **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | What it is | How to get it |
|---|---|---|
| `APPLE_DEVELOPER_CERTIFICATE_P12_BASE64` | Your "Developer ID Application" cert + private key, exported as `.p12` and base64-encoded | See "Exporting the certificate" below |
| `APPLE_DEVELOPER_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` | (you set it during export) |
| `APPLE_ID` | Your Apple ID email | Same as `APPLE_ID` in your local `.env.notarize` |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com | https://appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | Apple Developer team ID | `Z825V2BBX9` (also visible at developer.apple.com → Membership) |

## Exporting the certificate

1. Open **Keychain Access** on your Mac
2. Find `Developer ID Application: Subash Karki (Z825V2BBX9)` in **login** keychain
3. Click the disclosure triangle so the **private key** is also selected
4. Select **both** (cert + key) → right-click → **Export 2 items…**
5. Save as `phantom-signing.p12` with a strong password (you'll need this as `APPLE_DEVELOPER_CERTIFICATE_PASSWORD`)
6. Base64-encode and copy to clipboard:
   ```bash
   base64 -i phantom-signing.p12 | pbcopy
   ```
7. Paste into the `APPLE_DEVELOPER_CERTIFICATE_P12_BASE64` GitHub secret
8. Delete `phantom-signing.p12` from disk after — you don't want it lying around

## Cutting a release

Once secrets are set:

```bash
# Bump version locally
cd v2
# edit wails.json -> info.productVersion (or let CI overwrite)

# Tag and push
git tag v0.1.2
git push origin v0.1.2
```

The workflow runs automatically. ~10–15 min later you'll have a GitHub Release at https://github.com/karki011/phantom/releases.

## Manual / dry-run builds

Run the workflow without creating a release:

1. Go to **Actions → Release → Run workflow**
2. Branch: `main`, Version: `0.1.2-test` (or leave blank to use `wails.json` value)
3. The zip will be uploaded as a workflow artifact (no GitHub Release created)

## Local releases

Local releases still work via `make release-zip` from `v2/` — credentials come from the gitignored `phantom-os/.env.notarize` file.
