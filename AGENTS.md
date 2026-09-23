# Appstack CLI contributor guide

This repository is a thin deterministic harness around the official Appstack
SDK skill. Keep domain expertise in the published `appstack-skills` repository;
TypeScript should only contain detection, orchestration, version lookup, safety
policy, and rendering.

## Command surface

- Workflow verbs are `integrate`, `review`, and `upgrade`.
- Every workflow supports `--skill`, `--dry-run`, and `--json`.
- Do not add dashboard or account-management commands without an explicit
  product decision.
- `review` is read-only. `integrate` and `upgrade` may write only inside the
  detected app directory.

## Skills

The skill is never vendored or published with the CLI. At run time the CLI
downloads the latest `appstack-skills` GitHub Release, caches it, and composes
the shared `SKILL.md` with exactly one framework reference plus the
framework-neutral task references the workflow needs (review loads review and
event design; a detected RevenueCat or Superwall dependency adds partner
integrations). If no cache exists and the network is unavailable, resolution
must fail loudly rather than load a stale copy. Never load unrelated framework
instructions into a run.

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
