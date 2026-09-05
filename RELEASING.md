# Release Process

gen-chart uses Semantic Versioning and immutable tags named `v<version>`. The
first tagged release is `v0.32.0`. Every release publishes the deterministic
skill archive and a SHA-256 checksum from the exact commit merged into `main`.

## Prepare the release PR

1. Create `release/v<version>` from the latest `origin/main`.
2. Update the version in `gen-chart/package.json`, its lockfile, the CLI, skill
   metadata, README badges, and `CHANGELOG.md`.
3. Run `npm run build:gallery` so generated release identity is current.
4. Run the release gates from `gen-chart/`:

   ```bash
   npm ci
   npm run test:ci
   npm run build:gallery
   npm run check:release
   npm run build:zip -- /tmp/gen-chart-a.zip
   npm run build:zip -- /tmp/gen-chart-b.zip
   cmp /tmp/gen-chart-a.zip /tmp/gen-chart-b.zip
   git diff --exit-code
   ```

5. Merge only after the Node 22 and 24 CI jobs pass. Before the first public
   release, enable GitHub private vulnerability reporting under **Settings →
   Security → Code security** so the channel in `SECURITY.md` is active.

## Publish after merge

Use a clean checkout of the merged `main`; never release a PR branch or a dirty
working tree.

```bash
git switch main
git pull --ff-only origin main
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
cd gen-chart
npm ci
npm run test:ci
npm run build:gallery
npm run check:release -- --tag v0.32.0
git diff --exit-code
npm run build:zip -- ../gen-chart-v0.32.0.zip
node scripts/release-notes.mjs 0.32.0 > /tmp/gen-chart-v0.32.0-notes.md
cd ..
shasum -a 256 gen-chart-v0.32.0.zip > gen-chart-v0.32.0.zip.sha256
git tag -a v0.32.0 -m "gen-chart v0.32.0"
git push origin v0.32.0
gh release create v0.32.0 \
  gen-chart-v0.32.0.zip gen-chart-v0.32.0.zip.sha256 \
  --verify-tag --title "gen-chart v0.32.0" \
  --notes-file /tmp/gen-chart-v0.32.0-notes.md
```

Verify the published assets with `gh release view v0.32.0` and
`shasum -a 256 -c gen-chart-v0.32.0.zip.sha256`. If a problem is discovered
after pushing the tag, leave it immutable and prepare a patch release.
