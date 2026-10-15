---
name: deploy
description: Pre-flight checks and deploy to Railway. Only run when the user explicitly asks to deploy.
disable-model-invocation: true
---

Deploy the app to Railway. Target: $ARGUMENTS (default: production)

## Pre-flight (stop and report if any step fails)
1. Working tree is clean and on the expected branch (`git status`).
2. Typecheck, lint, and tests pass.
3. Build succeeds locally.
4. Any new env vars are in `.env.example` AND set in Railway (check with the Railway tools; never print secret values).
5. Pending Drizzle migrations: list them and confirm with the user before they run against the target database.

## Deploy
6. Deploy via the Railway connector or CLI (or push to the deploy branch if the service auto-deploys from GitHub).
7. Watch the deployment until it succeeds or fails. On failure, fetch the build/deploy logs and diagnose before retrying.

## Verify
8. Hit the health endpoint (or the main page) on the live URL.
9. Check recent logs for errors.
10. Report: what was deployed (commit), URL, and anything that looks off.
