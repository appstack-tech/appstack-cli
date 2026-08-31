# Appstack CLI

Agent-powered integration, review, and upgrades for the Appstack mobile
attribution SDKs.

The CLI is intentionally focused on the SDK lifecycle. It does not create
Appstack accounts, apps, campaigns, or dashboard resources.

## Commands

```bash
appstack integrate
appstack review
appstack upgrade
```

The CLI detects Swift/iOS, Kotlin/Android, React Native, Flutter, and Unity
projects. It performs deterministic checks first, then runs Claude Code or Codex
headlessly with the official framework-specific Appstack skill.

Run `appstack` in an interactive terminal to open the guided TUI. It detects
apps, lets you choose a workflow and execution mode, masks API-key entry, and
asks for confirmation before an integration or upgrade can change files.
The interface follows Appstack's monochrome identity using the terminal's native
foreground and background, with color reserved for semantic status feedback.

- `integrate` installs and configures the SDK using the app's existing package
  manager and startup architecture.
- `review` combines deterministic checks with a read-only semantic audit.
- `upgrade` resolves the latest stable registry release, reads the migration
  surface, updates dependencies and lockfiles, and verifies the app.

Use `--skill` to print the full project-specific playbook instead of running an
agent, `--dry-run` to inspect only, and `--json` for the deterministic inspection.
Reviews are concise by default: one overall status, up to five verified findings,
and a short needs-confirmation list. Add `--verbose` for the exhaustive audit.

```bash
appstack review --json
appstack review --verbose
appstack integrate --skill
appstack upgrade --to 2.6.0 --dry-run
```

For cross-platform integrations, keys can be passed as flags or environment
variables:

```bash
APPSTACK_IOS_API_KEY=... APPSTACK_ANDROID_API_KEY=... appstack integrate
```

The CLI never creates keys and instructs the agent not to print key values.

## Skill updates

The npm package includes a known-good Appstack SDK skill so workflows also work
offline. On normal `integrate`, `review`, `upgrade`, and `--skill` runs, the CLI
checks at most once every 24 hours for the latest published `appstack-skills`
GitHub Release. It downloads `appstack-skills.zip`, verifies the SHA-256 digest
published by GitHub, extracts only the Appstack SDK skill, and atomically
activates the cached release. A failed check keeps using the last valid cache
(or the bundled copy) and is retried after one hour.

`--dry-run` and `--json` never refresh or write the skill cache. Set
`APPSTACK_SKILL_UPDATES=off` to disable network refreshes, or
`APPSTACK_SKILL_DIR=/path/to/appstack-sdk` to use a local development copy.
`APPSTACK_CACHE_DIR` overrides the cache base directory for tests and managed
environments.

## Architecture

```text
src/
├── cli.ts                  command surface
├── commands/workflow.ts    workflow orchestration
└── core/
    ├── project/scan.ts     framework and app detection
    ├── sdk/inspect.ts      deterministic integration checks
    ├── sdk/latest.ts       official registry version lookup
    ├── skill/              release-pinned skill updates and cache
    └── agent/              skill composition and Claude/Codex drivers
skills/appstack-sdk/        bundled official skill and one reference per platform
```

The TypeScript harness contains project detection, version resolution, safety
boundaries, and verification contracts. Appstack integration expertise belongs
in the bundled skill, sourced from
[`appstack-tech/appstack-skills`](https://github.com/appstack-tech/appstack-skills).

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev -- review --install-dir /path/to/app
```
