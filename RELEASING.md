# Releasing Appstack CLI

Releases are driven by a semantic-version Git tag. The release workflow
verifies the tag and package version, runs the full test suite, packs the
package once, publishes that tarball to npm, and attaches the same tarball and
its SHA-256 checksum to a GitHub Release.

## One-time repository setup

Configure `appstack-cli` on npm with a GitHub Actions trusted publisher:

- Organization: `appstack-tech`
- Repository: `appstack-cli`
- Workflow filename: `release.yml`
- Allowed action: publish

No `NPM_TOKEN` repository secret is required. The workflow uses npm's OIDC
trusted publishing and automatically records package provenance. Keep tag
creation restricted to maintainers, and consider requiring approval for changes
to `.github/workflows/release.yml` with `CODEOWNERS` or branch protection.

## Publish a release

1. Update the version without creating a local tag:

   ```bash
   npm version patch --no-git-tag-version
   ```

   Use `minor`, `major`, or an explicit semantic version when appropriate.

2. Open and merge a pull request containing both `package.json` and
   `package-lock.json`. Wait for CI on `main` to pass.

3. Tag the merge commit and push the tag:

   ```bash
   git switch main
   git pull --ff-only
   git tag -a 0.3.0 -m "0.3.0"
   git push origin 0.3.0
   ```

The tag must exactly equal the version in `package.json`, and its commit must be
part of `main`. GitHub-generated release notes cover the changes since the
previous release. Stable versions are published to npm's `latest` distribution
tag; semantic-version prereleases are published to `next` and marked as
prereleases on GitHub.

Git tags and GitHub Release titles both contain only the version number.

The workflow is safe to rerun from the Actions page with the existing tag. If
the version is already on npm, the workflow continues only when the registry's
tarball checksum matches the artifact it just built. Existing GitHub Release
assets are replaced with those matching artifacts.
