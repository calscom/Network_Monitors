---
name: TypeScript compiler API availability
description: Why test tooling must not assume TypeScript exposes its historical JavaScript compiler API.
---

Do not assume importing TypeScript provides `createSourceFile`, `ScriptTarget`, or `transpileModule`.

**Why:** The TypeScript package installed during the runtime/dependency upgrade exposes only version metadata through its default JavaScript export. The command-line type checker still works, but the legacy compiler API is unavailable.

**How to apply:** Check the installed exports before building AST-based tooling. Use the project's existing esbuild dependency for TypeScript transpilation in isolated tests; if AST access is necessary, choose a supported parser explicitly rather than assuming the CLI package includes one.
