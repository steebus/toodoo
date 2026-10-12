# Handoff: Plan 2 Task 14, cloud cutover (attended)

For the agent picking this up in a fresh session. Plan 2 tasks 1 to 13 are done and on `main` (CI green). This is the last task. Every step touches Steve's accounts, so **confirm each step with Steve before running it**.

## Read first
- `docs/setup.md`: the step-by-step for WorkOS, Convex, Vercel, import and connector. This handoff doesn't repeat it.
- `docs/superpowers/plans/2026-10-12-toodoo-ui-the-pass.md`, Task 14: the checklist.
- `docs/private/task-14-cutover.md` and `docs/private/routine-settings.md`: gitignored, local only. They hold the account-specific values: deployment names, user IDs, trigger ID and the personal routine settings.

## Hard rules
- **The repo `steebus/toodoo` is PUBLIC.** Never commit:
  - personal names, emails or account/user IDs
  - the old artifact URL or the routine trigger ID
  - anything from `docs/private/`, `apps/web/src/ui/fixtures.ts`, `.impeccable/mocks|prompts|review`, `scripts/artifact-export`, or `.env*`
  Scan diffs before every push.
- **Never print secrets** (`WORKOS_API_KEY`, deploy keys, `TOODOO_API_KEY`).
- **Never push `backup/pre-scrub-history`.**
- **Routine change:** change it via RemoteTrigger only after Steve approves the exact new prompt and config.
- **The old artifact:** leave it read-only. Deleting it is Steve's call.

## State at handoff
- **Local stack:** works end to end (WorkOS sandbox plus a local anonymous Convex deployment). Data was imported locally under Steve's dev user.
- **CI:** `.github/workflows/ci.yml` runs typecheck and tests on push and PRs.
- **Vercel:** `vercel.json` runs `npx convex deploy --cmd 'pnpm --filter @toodoo/web build'`. Earlier deploys failed because the project's Root Directory was set to `apps/web`. It must be blank (the repo root). **Check this first.**
- **Prod Convex env:** was not yet set at handoff. `auth.config.ts` reads `WORKOS_CLIENT_ID` and `WORKOS_AUTHKIT_DOMAIN` at deploy, so set them before the first Vercel build.
- **WorkOS:** the sandbox is in use and may still need `npx workos profile claim`. Production WorkOS is a separate identity (new client ID, AuthKit domain and user ID).

## Order of work
1. **Vercel settings:** Root Directory blank. `CONVEX_DEPLOY_KEY` (prod) scoped to Production only, preview deployments off. `VITE_WORKOS_CLIENT_ID` (prod) and `VITE_WORKOS_REDIRECT_URI=<vercel url>/callback`.
2. **WorkOS prod:**
   - redirect `<vercel url>/callback`, allowed origin, sign-out URI
   - CIMD and DCR enabled
   - Resource Indicator `https://<prod>.convex.site/mcp`, with no trailing slash
3. **Convex prod env** (`pnpm convex env set --prod ...`): `WORKOS_CLIENT_ID`, `WORKOS_AUTHKIT_DOMAIN`, `TOODOO_API_KEY` and `APP_URL`. `ALLOWED_USER_ID` comes after the first prod sign-in.
4. **First deploy:** push to `main` or redeploy in Vercel. Steve signs in on prod. Take his prod `user_...` from WorkOS, set prod `ALLOWED_USER_ID`, and reload.
5. **Import into prod:**
   - Create `.env.import` with the prod site URL and key.
   - Run: `node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export`
   - Check the counts against the local run (54 tasks, 13 days, 16 blocks) and the dropped-block report.
6. **Claude connector:** add `https://<prod>.convex.site/mcp` and sign in. In a chat, smoke-test `get_snapshot`, `suggest` ("what should I do next") and `plan` ("plan my afternoon").
7. **Routine switch:**
   - New prompt: "Use the toodoo skill to run the morning plan." followed by the **Personal settings** block from `docs/private/routine-settings.md`.
   - Config: enable the toodoo plugin (marketplace at `plugin/`), add the toodoo connector, drop ArtifactData.
   - Get Steve's approval, update via RemoteTrigger, run it once on demand, and check the result.
8. **Retire the artifact:** leave it read-only.
9. **Finish:**
   - Update the SDD ledger (`.superpowers/sdd/2026-10-12-toodoo-ui-the-pass/progress.md`) with `Task 14: complete`.
   - Then delete that plan's workspace, per subagent-driven-development.

## Gotchas
- **Windows:** `convex dev` can fail with EBUSY when the temp dir (C:) and the project (D:) are on different drives. Set `CONVEX_TMPDIR` to a folder on the project's drive.
- **Line endings:** `convex/_generated/*` keeps showing line-ending-only changes after `convex dev`. Run `git checkout -- convex/_generated` before committing.
- **Auth domain:** keep `WORKOS_AUTHKIT_DOMAIN` without a trailing slash.
- **Auth mode:** the web app uses AuthKit `devMode` (refresh token in localStorage) because vercel.app blocks third-party cookies. This is an accepted single-user trade-off.

## Open items for Steve (not blocking the cutover)
- **Slashed zero:** the self-hosted Iosevka Charon Mono only has a slashed zero, where the comp uses plain zeros. The choice is a custom Iosevka build or accepting it.
- **Manual checks still owed:**
  - real-phone touch: swipe to tick, long-press drag, iOS keyboard over the add sheet
  - Firefox: Space pick-up must not open the edit sheet
  - the `.fault` Retry/Sign-out bar on a phone
  - narrow desktop windows, 820 to 1100 px, where print is small
- **Deferred minors:** these are listed in the SDD ledger ("minor (deferred)" lines) and in `docs/superpowers/plans/2026-10-12-plan1-deferred.md`.
- **Later features from the original brief:** Kanban, Epics (prioritised, hidden, filtered; tasks derive priority), and more connections, including Trippn.
