---
name: new-feature
description: Plan and build a new feature end to end (DB, API, UI). Use when the user asks to add a feature, page, or capability to the app.
---

Build the feature described in: $ARGUMENTS

1. **Understand.** Read SPEC.md and the relevant existing code. If the request is ambiguous, ask up to 3 questions before planning.
2. **Plan.** Present a short plan: schema changes, endpoints, UI pieces, files to create or change. Wait for approval.
3. **Database.** Update `db/schema.ts`, generate a migration with drizzle-kit, apply it.
4. **API.** Add validators (Zod), service logic, then routes. Shared types go in `packages/shared` if this is a monorepo.
5. **UI.** Add a `features/<name>/` folder with components, hooks (TanStack Query), and API calls. Handle loading, error, and empty states.
6. **Verify.** Run typecheck and tests. Fix failures. Start the app if possible and confirm the feature works.
7. **Wrap up.** Summarize what changed in 3–5 bullets and suggest a commit message. Don't commit unless asked.

Keep the change focused on this feature. Note unrelated issues instead of fixing them.
