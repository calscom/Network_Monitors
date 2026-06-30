---
name: Zod 4 ZodError API change
description: ZodError.errors renamed to ZodError.issues in Zod 4
---

## Rule
Use `err.issues[0].message` and `parseResult.error.issues[0]?.message` in Zod 4. The `.errors` property no longer exists.

**Why:** Zod 4 renamed the `errors` array on `ZodError` to `issues` for consistency with the validation ecosystem.

**How to apply:** Search-replace `.errors[` with `.issues[` in any catch block or safeParse error handling that uses ZodError.
