# toodoo setup

## Local (no accounts needed)
1. `pnpm install`.
2. `pnpm dev` starts a local Convex backend plus Vite. The first run creates an anonymous local deployment and writes `.env.local`. If you've linked a cloud deployment with `pnpm convex dev`, run `pnpm convex deployment select local` (after `convex login`) first, or `pnpm dev` will use the cloud deployment.
3. Set local env vars once, one command per line (`ALLOWED_USER_ID` can wait until step 5):
   - `pnpm convex env set WORKOS_CLIENT_ID <dev client id>`
   - `pnpm convex env set WORKOS_AUTHKIT_DOMAIN https://<your>.authkit.app`
   - `pnpm convex env set TOODOO_API_KEY <random>`
   - `pnpm convex env set APP_URL http://localhost:5173`
4. Add `VITE_WORKOS_CLIENT_ID` and `VITE_WORKOS_REDIRECT_URI=http://localhost:5173/callback` to `.env.local` (see `.env.example`).
5. Windows: if `convex dev` fails with EBUSY, the temp dir and the project are on different drives; set `CONVEX_TMPDIR` to a folder on the project's drive.
6. First sign-in is expected to fail: until `ALLOWED_USER_ID` is set, data loads are rejected. Sign in once, copy your user ID from WorkOS → **Users** (`user_...`), run `pnpm convex env set ALLOWED_USER_ID <user id>`, then reload.

## WorkOS (AuthKit)
1. Optional: `npx workos@latest integrate` provisions a sandbox environment and writes WORKOS_* vars to `.env.local`. Ignore the code it generates — the app already has its AuthKit wiring — and run `npx workos profile claim` to link the environment to your account.
2. Create an organisation and project, then open **AuthKit**. Note:
   - the **Client ID** (staging and production differ);
   - the **AuthKit domain** (`https://<name>.authkit.app`).
3. **Redirects:** redirect URIs are `<origin>/callback`, for both localhost and Vercel: `http://localhost:5173/callback` and `<vercel url>/callback`. Add the origins (`http://localhost:5173` and your Vercel URL) as allowed origins. Also set the Sign-out URI to the origin.
4. **Sign-in:** enable your sign-in method, e.g. email + Google. After you've signed in once, turn off open sign-up or restrict it to your email.
5. **Your user ID:** copy it from **Users** (`user_...`). It is `ALLOWED_USER_ID`.
6. **MCP connector:** under **Connect → Configuration**, enable **Client ID Metadata Document** and **Dynamic Client Registration**.
7. **Resource Indicator:** add `https://<deployment>.convex.site/mcp` for each Convex deployment Claude connects to. It must match exactly, including no trailing slash.
8. **Production is a separate identity:** the production WorkOS environment has its own users, client ID and AuthKit domain. Sign in once on the production app (or create the user in the prod WorkOS dashboard), copy that `user_...` ID, and set prod `ALLOWED_USER_ID` and prod `WORKOS_AUTHKIT_DOMAIN` from it.

## Convex
1. `pnpm convex login`, then `pnpm convex dev` to create or link the project and your cloud dev deployment.
   - `pnpm dev:cloud` is different: it runs only the local front end (Vite) against the **production** backend, as deployed, and pushes nothing. It reads `.env.cloud.local` (gitignored) with `CONVEX_URL=https://<prod>.convex.cloud`, the production `VITE_WORKOS_CLIENT_ID` and `VITE_WORKOS_REDIRECT_URI=http://localhost:5180/callback` (its own fixed port, so it never lands on another project's 5173). The production WorkOS environment must allow that redirect and `http://localhost:5180` as an origin. Writes are real; front-end code that needs functions prod hasn't got yet fails until it is deployed.
2. The deployment's HTTP actions URL (`https://<name>.convex.site`) is in **Dashboard → Settings → URL & Deploy Key**. The Resource Indicator, the Claude connector and `.env.import` all use it.
3. Set the same env vars on the cloud dev deployment, and on prod with `pnpm convex env set --prod ...`. Prod uses the production WorkOS client ID and `APP_URL=<vercel url>`. Set the prod vars before the first Vercel build, because `auth.config.ts` reads them on deploy.
4. `WORKOS_AUTHKIT_DOMAIN` has no trailing slash (a trailing slash is stripped, but keep it clean). On prod, set `ALLOWED_USER_ID` and `WORKOS_AUTHKIT_DOMAIN` from the production WorkOS environment (see WorkOS step 8), not the dev values.
5. Create a **production deploy key** (Dashboard → Settings → Deploy keys).

## Vercel
1. Import the GitHub repo with the repo root as the root directory. Vercel picks up `vercel.json`.
2. Before the first build, set these env vars:
   - `CONVEX_DEPLOY_KEY` (prod deploy key), scoped to the **Production** environment only. Otherwise preview builds would deploy to the production Convex backend. Disable Preview deployments in Vercel (Settings → Git), or add a Convex preview deploy key later.
   - `VITE_WORKOS_CLIENT_ID` (production client ID)
   - `VITE_WORKOS_REDIRECT_URI=<vercel url>/callback`
3. The web app runs AuthKit with `devMode` (refresh token in localStorage), because third-party cookies are blocked on vercel.app and the session would be lost on reload. Single-user trade-off; switch to a WorkOS custom auth domain to drop it.
4. Each push to `main` deploys the Convex functions and schema, then builds the web app.

## Import your artifact data
Run this against prod only after prod `ALLOWED_USER_ID` and `WORKOS_AUTHKIT_DOMAIN` are set, because the import stamps `user_id` with `ALLOWED_USER_ID`.

Create `.env.import` with `CONVEX_SITE_URL=https://<prod>.convex.site` (from Dashboard → Settings → URL & Deploy Key) and `TOODOO_API_KEY=<prod key>`, then run:
`node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export`

## Claude connector
claude.ai → Settings → Connectors → Add custom connector → `https://<prod>.convex.site/mcp` → sign in with AuthKit → Allow.
