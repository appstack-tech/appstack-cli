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
appstack skill uninstall
```

The CLI detects Swift/iOS, Kotlin/Android, React Native, Flutter, and Unity
projects. It performs deterministic checks first, then runs Claude Code, Codex,
OpenCode, or Pi headlessly with the official framework-specific Appstack skill.

Run `appstack` in an interactive terminal to open the guided TUI. It detects
apps, lets you choose a workflow and execution mode, masks API-key entry, and
asks which coding agent to use when several are installed. It also asks for
confirmation before an integration or upgrade can change files.
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
appstack integrate --agent codex
```

When a direct command detects more than one supported coding agent, select one
with `--agent claude`, `--agent codex`, `--agent opencode`, or `--agent pi`.
The previous `--driver` spelling is retained as an alias.

Agent detection checks the current process's `PATH`. The selected executable is
started as the current operating-system user; the CLI does not install a skill
into Codex, Claude Code, OpenCode, or Pi's user configuration.

Pass integration keys through the environment or enter them in the masked TUI
prompt. Keys are not accepted as command-line flags because those values can be
retained in shell history or exposed in process listings:

```bash
APPSTACK_IOS_API_KEY=... APPSTACK_ANDROID_API_KEY=... appstack integrate
```

The CLI never creates keys and instructs the agent not to print key values. The
selected coding agent inherits the caller's environment, with the relevant
Appstack keys added for the integration workflow.

## Skill updates

The CLI does not vendor the skill. On normal `integrate`, `review`, `upgrade`,
and `--skill` runs it downloads the latest published `appstack-skills` GitHub
Release, verifies the SHA-256 digest published by GitHub, extracts only the
Appstack SDK skill, and atomically activates the cached release. It checks at
most once every 24 hours; a failed check keeps using the last valid cache and is
retried after one hour.

The first run requires network access. If no cached release exists and the
release cannot be downloaded, the CLI fails with an actionable error instead of
running a stale skill. `--dry-run` and `--json` never refresh or write the skill
cache. Set `APPSTACK_SKILL_UPDATES=off` to disable network refreshes, or
`APPSTACK_SKILL_DIR=/path/to/appstack-sdk` to use a local development copy.
`APPSTACK_CACHE_DIR` overrides the cache base directory for tests and managed
environments.

The default cache is scoped to the current operating-system user:

- macOS: `~/Library/Caches/appstack/skills/appstack-sdk`
- Linux: `${XDG_CACHE_HOME:-~/.cache}/appstack/skills/appstack-sdk`
- Windows: `%LOCALAPPDATA%\\Appstack\\skills\\appstack-sdk`

Run `appstack skill uninstall` to remove every downloaded Appstack skill release
and its update state. This command removes only that Appstack-owned cache
directory. It does not modify agent configuration or a development copy selected
with `APPSTACK_SKILL_DIR`.

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
    └── agent/              skill composition and coding-agent drivers
```

The TypeScript harness contains project detection, version resolution, safety
boundaries, and verification contracts. Appstack integration expertise lives in
[`appstack-tech/appstack-skills`](https://github.com/appstack-tech/appstack-skills)
and is downloaded at run time rather than shipped with the package.

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev -- review --install-dir /path/to/app
```
