# Releasing mapper-js

This project publishes `@christiansmith/mapper-js` to two registries:

- **JSR** — `jsr:@christiansmith/mapper-js` (version from `deno.json`)
- **npm** — `@christiansmith/mapper-js` (version from `package.json`)

Releases are cut from `main` and recorded with an annotated semver tag
(`vX.Y.Z`). Publishing is manual — there is no release workflow. Versions
follow [semver](https://semver.org); **pre-1.0**, the public API may change
between minor versions.

## Cutting a release

1. **Green the gates.** All must pass from a clean tree:

   ```bash
   deno task test                      # full suite, 0 failed
   npx prettier --check src/ test/     # no style issues
   ```

2. **Bump the version** in _both_ manifests — they must agree:

   - `deno.json` → `"version"`
   - `package.json` → `"version"`

3. **Update `CHANGELOG.md`.** Move the `unreleased` marker to the new
   version heading; verify the entry tells the behavior-change story a
   downstream user needs (the conventional-commit log since the last tag is
   the raw material: `git log vPREV..HEAD --oneline`).

4. **Commit and tag:**

   ```bash
   git add deno.json package.json CHANGELOG.md
   git commit --only -m "chore: release X.Y.Z" -- deno.json package.json CHANGELOG.md
   git tag -a vX.Y.Z -m "X.Y.Z"
   git push origin main --follow-tags
   ```

5. **Publish to JSR** (dry-run first):

   ```bash
   deno publish --dry-run
   deno publish
   ```

6. **Publish to npm:**

   ```bash
   npm publish --access public
   ```

7. **Verify:** the JSR and npm package pages show the new version, and a
   fresh install resolves it:

   ```bash
   deno eval "import { map } from 'jsr:@christiansmith/mapper-js@X.Y.Z'; console.log(typeof map)"
   ```

## After the release

- The docs site pins `@christiansmith/mapper-js` at an exact version; bump
  the pin, run the docs drift harness, and update any page whose documented
  behavior changed in this release.
- If a maintenance line becomes necessary pre-1.0, branch `release/X.Y` from
  the tag and merge patches forward into `main`.
