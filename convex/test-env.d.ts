// import.meta.glob is provided by Vite/Vitest; declared here so Convex's tsc check passes.
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
