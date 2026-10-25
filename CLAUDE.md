# Toodoo

## Shipping

After each push, wait for the deploy before taking the next task:

    sha=$(git rev-parse HEAD)
    gh api "repos/{owner}/{repo}/commits/$sha/status" -q .state   # Vercel: pending | success | failure
    gh run list --commit "$sha" --json name,conclusion             # CI workflows

Check every ~30s until nothing is pending, for up to 15 min.
On failure: read the log (`gh run view <id> --log-failed` for CI; for Vercel,
`npx vercel inspect <target_url> --logs` if VERCEL_TOKEN is set, otherwise
reproduce with `pnpm typecheck && pnpm test && pnpm build`), fix, push, and wait again.
After two failed fix attempts, stop and report instead of pushing more.
