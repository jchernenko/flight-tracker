---
name: add-endpoint
description: Add a single API endpoint following the project's layered structure. Use when the user asks for a new route, endpoint, or API call without a full UI feature.
---

Add the endpoint described in: $ARGUMENTS

1. Confirm method, path, input, and response shape. Ask if any are unclear.
2. **Validator:** Zod schema for body/params/query in `validators/` (or `packages/shared` in a monorepo).
3. **Service:** business logic in `services/`. No Hono context objects here — plain inputs, plain outputs.
4. **Route:** wire it up in `routes/` with the Zod validator middleware. Keep the handler thin: validate → call service → return `{ success: true, data }`.
5. **Errors:** throw typed errors from the service; let the central error handler format them. Use correct status codes (400 validation, 401/403 auth, 404 not found).
6. **Auth:** if the endpoint touches user data, apply the auth middleware. Ask if unsure.
7. **Test:** add a test covering the happy path and one failure case. Run typecheck and tests.
8. Show an example request and response.
