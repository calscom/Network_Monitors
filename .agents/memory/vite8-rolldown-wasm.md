---
name: Vite 8 Rolldown WASM memory limit
description: Vite 8 uses rolldown (WASM) for dep optimizer; large barrel files crash it with "Maximum memory size exceeded"
---

## Rule
Never include large barrel-file packages (e.g. react-icons/si with 1000s of icons) in `optimizeDeps.include`. They cause rolldown's WASM memory to exceed its limit.

**Why:** Vite 8 replaced esbuild with rolldown for dependency pre-bundling. Rolldown runs as a WebAssembly module with a hardcoded memory ceiling. Huge barrel files (react-icons/si is ~thousands of SVG icon components) exhaust WASM memory.

**How to apply:**
- Replace react-icons with inline SVGs or lucide-react for any icon that causes this issue.
- For CJS packages that MUST be pre-bundled, add them to `optimizeDeps.include` only if they are reasonably sized: react, react-dom, react-dom/client, react/jsx-runtime, papaparse, xlsx.
- Re-enable auto-discovery (omit `noDiscovery: true`) once the offending barrel file is removed — auto-discovery works fine without the giant package.
- Any package with JSX in .mjs files that is NOT pre-bundled will fail Vite's import analysis — must be pre-bundled OR removed.
