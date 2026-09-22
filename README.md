# Appstack CLI

Install, check, and upgrade the Appstack mobile attribution SDK in your app with a coding agent.

Appstack CLI supports Swift (iOS), Kotlin (Android), React Native, Flutter, and Unity projects. It detects your app, checks the existing SDK setup, and gives a supported coding agent the Appstack instructions for your framework.

## Get started

You need Node.js 20 or later and a mobile app project. To let the CLI make changes or perform a full review, install one of these coding agents and make sure its command is on your `PATH`: Claude Code, Codex, OpenCode, or Pi.

```bash
npm install -g appstack-cli
cd /path/to/your/app
appstack
```

Running `appstack` in a terminal opens a guided flow. Choose the app, what you want to do, and whether to run an agent, inspect only, or print the instructions to use yourself. The flow asks for confirmation before an integration or upgrade changes files.

You can also run a workflow directly:

```bash
appstack integrate
appstack review
appstack upgrade
```

| Command | What it does |
| --- | --- |
| `appstack integrate` | Installs and configures the SDK in your app. |
| `appstack review` | Checks an existing integration without changing files. |
| `appstack upgrade` | Updates the SDK to the latest stable version and handles required migration work. |

If you run a direct command and more than one coding agent is installed, select one with `--agent claude`, `--agent codex`, `--agent opencode`, or `--agent pi`. You can run from a different directory with `--install-dir <path>`. In a repository with multiple apps, run from the app directory or use `--framework <name>` when that identifies one app.

## API keys

For integration, enter your Appstack API key in the guided flow or provide it through environment variables. The guided flow masks key entry. For a direct command, use `APPSTACK_API_KEY` for a single-platform app, or `APPSTACK_IOS_API_KEY` and `APPSTACK_ANDROID_API_KEY` for an app that targets both platforms:

```bash
APPSTACK_API_KEY=... appstack integrate
APPSTACK_IOS_API_KEY=... APPSTACK_ANDROID_API_KEY=... appstack integrate
```

Get your keys from your Appstack account. The CLI does not create keys or accept them as command-line flags.

## Inspect before running

Use `--dry-run` to inspect the app without starting an agent or changing files. Use `--json` to get the deterministic inspection as JSON. A review gives a concise report by default; add `--verbose` for more detail.

```bash
appstack integrate --dry-run
appstack review --json
appstack review --verbose
appstack upgrade --to 2.6.0 --dry-run
```

Use `--skill` to print the full framework-specific instructions so you can run them with your own agent. If no supported agent is available, `review` still shows the deterministic checks; `integrate` and `upgrade` need an agent or the `--skill` option.

```bash
appstack integrate --skill
```

## Skill downloads

The CLI downloads the current Appstack SDK instructions from the [Appstack skills releases](https://github.com/appstack-tech/appstack-skills/releases) and caches them for your user account. The first workflow that needs these instructions requires network access. Later runs can use the cached copy if an update check fails. `--dry-run` and `--json` do not download instructions.

To remove downloaded instructions, run:

```bash
appstack skill uninstall
```

Run `appstack --help` or `appstack <command> --help` for all available options.
