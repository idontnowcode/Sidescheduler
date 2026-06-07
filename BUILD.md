# Building the Windows installer (.exe)

Daily Sidebar Planner ships as an NSIS installer (`Daily Sidebar Planner Setup x.y.z.exe`)
produced by [electron-builder](https://www.electron.build/).

There are two ways to produce the installer:

| Path | When to use | Where the .exe ends up |
|------|-------------|------------------------|
| Local build (`npm run build:win`) | Quick local testing, signing experiments, no network calls | `daily-sidebar-planner/dist-app/` |
| GitHub Actions (`Release Windows EXE`) | Public release for users to download | Attached to the GitHub Release for the pushed tag |

The workflow definition lives at `.github/workflows/release.yml` and the
electron-builder configuration at `electron-builder.yml`.

---

## 1. Local build

Pre-requisites: Windows 10/11, Node 20+, Git, ~2 GB free disk for the build cache.

```powershell
cd daily-sidebar-planner
npm ci                 # clean install — uses package-lock.json
npm run build:win      # 1) electron-vite build  2) electron-builder --win
```

When it finishes the installer is at

```
daily-sidebar-planner/dist-app/Daily Sidebar Planner Setup <version>.exe
```

Double-click to install. The NSIS config (`oneClick: false`,
`allowToChangeInstallationDirectory: true`) gives the user a normal wizard
with a destination picker and start-menu / desktop shortcut toggles.

> Tip — to test the installed bundle without going through the wizard, use
> `npm run build:win -- --dir`. That produces an unpacked app under
> `dist-app/win-unpacked/` you can launch directly.

---

## 2. Publishing a release on GitHub (recommended for users)

The `Release Windows EXE` workflow does the build on a `windows-latest` runner
and pushes the installer + `latest.yml` (used by the auto-updater) to a
GitHub Release. Two ways to fire it:

### Option A — push a tag (preferred)

```bash
# Bump version in daily-sidebar-planner/package.json first.
git tag v0.2.0
git push origin v0.2.0
```

The workflow runs on `push: tags: ['v*']`. The tag (e.g. `v0.2.0`) becomes the
release name. electron-builder uploads:

- `Daily Sidebar Planner Setup 0.2.0.exe`
- `Daily Sidebar Planner Setup 0.2.0.exe.blockmap` (delta-update support)
- `latest.yml`

### Option B — manual trigger

GitHub → **Actions** tab → **Release Windows EXE** → **Run workflow**. Useful
for re-running a failed build or producing a one-off pre-release artefact (the
.exe is also uploaded as a workflow artifact named
`Daily-Sidebar-Planner-Setup`, downloadable for 90 days even if the release
upload step is skipped).

### Authentication

The workflow uses the default `GITHUB_TOKEN` secret that Actions injects, with
`permissions: contents: write` so it can create releases. No additional
secrets needed for an unsigned build.

### Code signing (optional, not yet wired up)

Unsigned installers trigger SmartScreen "Unknown publisher" warnings. To sign:

1. Buy a Windows code-signing certificate (DigiCert, Sectigo, GlobalSign…).
2. Add two repo secrets:
   - `CSC_LINK`        — base64 of the `.pfx` file
   - `CSC_KEY_PASSWORD` — the password protecting the `.pfx`
3. electron-builder picks them up automatically — no workflow change needed.

---

## 3. Versioning

Bump `version` in `daily-sidebar-planner/package.json` and tag the same value
with a `v` prefix. The tag drives the release name; the package version drives
the installer file name and the `latest.yml` metadata. Mismatch will confuse
the auto-updater.

```jsonc
// daily-sidebar-planner/package.json
{
  "version": "0.2.0", // <-- bump
  ...
}
```

```bash
git commit -am "chore: 0.2.0"
git tag v0.2.0
git push && git push --tags
```

---

## 4. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `electron-builder` fails with `Cannot find icon.ico` | Make sure `daily-sidebar-planner/resources/icon.ico` exists (256x256 minimum). |
| GitHub Action passes but no release is created | Check the workflow has `permissions: contents: write` and the tag matches `v*`. |
| SmartScreen blocks the installer | Expected for unsigned builds. Click "More info" → "Run anyway", or set up code signing (section 2.3). |
| Auto-update never picks up the new version | Confirm `latest.yml` is attached to the release and the version inside matches the installer file name. |
| `npm ci` fails on the runner | Delete the `package-lock.json` cache key or bump the Node version in `release.yml`. |
