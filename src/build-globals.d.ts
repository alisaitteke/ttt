// Build-time constants injected by esbuild via `define`.
// In tsc/dev mode they are `undefined`; the source code falls back to runtime
// path/version resolution (reading package.json from disk).
declare const __TTT_BUNDLED__: boolean | undefined;
declare const __TTT_PKG_VERSION__: string | undefined;
