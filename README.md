<p align="center">
  <a href="https://docs.appstack.tech/tooling/cli">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/appstack_cli_wordmark_dark.svg">
      <img alt="Appstack CLI" src=".github/assets/appstack_cli_wordmark_light.svg" width="460">
    </picture>
  </a>
</p>

<p align="center">
  Agent-powered integration, review, and upgrades for the Appstack mobile attribution SDKs.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/appstack-cli"><img alt="npm" src="https://img.shields.io/npm/v/appstack-cli.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-20%2B-blue.svg">
  <a href="https://github.com/appstack-tech/appstack-cli/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-lightgrey.svg"></a>
</p>

<p align="center">
  <a href="https://docs.appstack.tech/tooling/cli"><b>Documentation</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/appstack-tech/appstack-cli/releases">Releases</a>
  &nbsp;·&nbsp;
  <a href="https://www.appstack.tech/contact">Support</a>
</p>

---

The Appstack CLI detects your app, runs deterministic checks, and hands off to
your coding agent to integrate, review, or upgrade the Appstack SDK. It works
with Swift/iOS, Kotlin/Android, React Native, Flutter, and Unity apps. It does
not create Appstack accounts, apps, campaigns, or dashboard resources.

## How it works

The CLI detects your app and framework, runs deterministic checks, then hands
off to your coding agent (Claude Code, Codex, OpenCode, or Pi) with the official
framework-specific Appstack skill. The skill is downloaded from the latest
published release at run time, so every run uses current integration guidance.

## Installation

```bash
npm install -g appstack-cli
```

Then run it from your app directory:

```bash
appstack
```

Run with no arguments in an interactive terminal to open the guided TUI. It
detects your apps, lets you choose a workflow and coding agent, masks API-key
entry, and asks for confirmation before any command changes files.

## Commands

| Command | What it does |
| --- | --- |
| `appstack integrate` | Installs and configures the SDK using your app's package manager and startup architecture |
| `appstack review` | Audits an existing integration. Read-only |
| `appstack upgrade` | Upgrades to the latest stable SDK and migrates changed APIs |
| `appstack skill uninstall` | Removes downloaded Appstack skills from your cache |

### Flags

| Flag | What it does |
| --- | --- |
| `--skill` | Print the project-specific playbook instead of running an agent |
| `--dry-run` | Inspect and show the plan without changing files |
| `--json` | Print the deterministic inspection as JSON |
| `--framework <name>` | Select one app in a multi-app repository |
| `--agent <name>` | Select a detected coding agent (`claude`, `codex`, `opencode`, `pi`) |
| `--install-dir <path>` | Inspect a directory other than the current one |
| `--to <version>` | Target SDK version for `upgrade` (default: latest stable) |
| `--verbose` | Exhaustive audit for `review` |

Reviews are concise by default: one overall status, up to five verified
findings tagged High, Medium, or Low and ordered by severity, and a short
needs-confirmation list. Add `--verbose` for the full
audit.

## Try it

```bash
appstack integrate
appstack review
appstack review --json
appstack upgrade --to 2.6.0 --dry-run
appstack integrate --agent codex
```

## API keys

Pass integration keys through the environment or enter them in the masked TUI
prompt. Use `APPSTACK_API_KEY` for a single-platform app, or
`APPSTACK_IOS_API_KEY` and `APPSTACK_ANDROID_API_KEY` for an app that targets
both platforms. Keys are not accepted as command-line flags because those values
can be retained in shell history or exposed in process listings:

```bash
APPSTACK_API_KEY=... appstack integrate
APPSTACK_IOS_API_KEY=... APPSTACK_ANDROID_API_KEY=... appstack integrate
```

Get your keys from your Appstack account. Each platform has its own key; the
CLI warns when the iOS and Android keys are identical.

The CLI never creates keys and instructs the agent not to print key values.

## Skill updates

The CLI does not bundle the skill. It downloads the latest published
`appstack-skills` release, verifies it, and caches it, checking at most once
every 24 hours. The first run needs network access. Set
`APPSTACK_SKILL_UPDATES=off` to disable refreshes, or
`APPSTACK_SKILL_DIR=/path/to/appstack-sdk` to use a local development copy.

## Supported SDKs

[iOS](https://docs.appstack.tech/SDKs/swift) · [Android](https://docs.appstack.tech/SDKs/kotlin) · [React Native](https://docs.appstack.tech/SDKs/react-native) · [Flutter](https://docs.appstack.tech/SDKs/flutter) · [Unity](https://docs.appstack.tech/SDKs/unity)

## Support

Questions or issues? [Open an issue](https://github.com/appstack-tech/appstack-cli/issues) or [contact us](https://www.appstack.tech/contact).

## License

Released under the [MIT License](https://github.com/appstack-tech/appstack-cli/blob/main/LICENSE).
