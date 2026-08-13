# Appstack CLI contributor guide

This repository is a thin deterministic harness around the official Appstack
SDK skill. Keep domain expertise in `skills/appstack-sdk`; TypeScript should only
contain detection, orchestration, version lookup, safety policy, and rendering.

## Command surface

- Workflow verbs are `integrate`, `review`, and `upgrade`.
- Every workflow supports `--skill`, `--dry-run`, and `--json`.
- Do not add dashboard or account-management commands without an explicit
  product decision.
- `review` is read-only. `integrate` and `upgrade` may write only inside the
  detected app directory.

## Skills

`skills/appstack-sdk` is copied from the public `appstack-skills` repository.
Compose the shared `SKILL.md` with exactly one framework reference. Never load
unrelated framework instructions into a run.

## Verification

After every change run:

```bash
npm run typecheck
npm test
npm run build
```

Test commands through `dist/bin.js` after rebuilding. Keep tests deterministic
and network-free; registry clients should be tested with pure helpers or mocked
fetch implementations.
