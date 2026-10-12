Supabase-specific items (RLS, pgTAP, edge functions, consent page) are obsolete after the Convex pivot (Plan 1b).

# Plan 1 deferred minors

Carried from the SDD ledger for triage in Plan 2. Items fixed in the final fix wave (38c2b43) are excluded: autoPlan fixed-first, unknown patch priority, event padding, all-invalid POST, Consent catch, loadState window, CI triggers, search_path.

- Task 1: minor (deferred): all deps are new majors (TS7, Vite 8, Vitest 5, zod 4) — later tasks check compat.
- Task 2: minor (deferred): plan_blocks.task_id ownership not enforced (ponytail, single-user); touch_updated_at no search_path; tests skip text limits/days/with-check/trigger; Realtime DELETE payloads carry PK only under RLS (Plan 2 UI must key on id); cascade test passes trivially if insert silently no-ops.
- Task 3: minor (deferred): toMin not end-anchored/range-checked ("99:99"); toHM(NaN); parseDuration("1:75")=135 and "0"=0; formatDuration negative; addDays throws on malformed date.
- Task 4: minor (deferred): no exact score assertions pin weights; split import statement in test.
- Task 5: minor (deferred, triage at final review): autoPlan places fixed-time tasks in score order, so a fixed task can overlap a flexible block placed earlier in the same run (fix: place fixed first); past day without taskIds gives empty result; firstFree assumes sorted spans (undocumented); layoutLanes test thin.
- Task 6: minor (deferred): unknown priority in patch silently clears it; DayInput.headline "" not → null; normLink rejects javascript: via parser quirk; no test for {link:null} patch.
- Task 6: minor (deferred): DayInput event start/end not zero-padded ("9:30" stored as-is); double issue message for malformed dates.
- Task 7: minor (deferred): query filters tasks only (not plan/suggestions); empty strings survive compaction; future-date days window wider than needed; loadState untested.
- Task 7: minor (deferred): "# work" (space after #) won't match tag.
- Task 8: minor (deferred): Consent decide/getAuthorizationDetails lack catch for thrown rejections; error replaces UI (no retry); redirect_url unguarded; cloud/Vercel redirect URLs must be allowlisted (setup.md).
- Task 9: minor (deferred): malformed %-encoding → 422 not 400; all-invalid POST returns 200 with errors; no auth throttling (platform).
- Task 10: minor (deferred): MCP HM regex accepts "99:99" (from/until silently ignored); next_free uncapped past DAY_END; reply() returns raw DB messages (acceptable single-user).
- Task 11: minor (deferred): missing `created` → new Date() makes sort_order differ per run; block time regex allows 25:61; runner chunking untested; re-run overwrites in-app edits (documented).
- Task 12: minor (deferred): skill doesn't cover amended proposals (pass reduced task_ids) or differing committed result; PushNotification/SendUserMessage load not mentioned; no connector-unavailable guidance.
- Task 13: minor (deferred): setup-cli pinned to latest; no deploy concurrency group; setup.md lacks SMTP rate-limit note, Vercel-first ordering, VITE_* before first build.

## Plan 1b (Convex pivot) deferred minors

- Task 1: minor (deferred): no test for all-invalid batch error count; parseDay untested directly; stale supabase lines in .gitignore and "edge functions" comment in planning.ts.
- Task 2: minor (deferred): by_user_done lacks sort_order; auth.config no fail-fast on missing env; revisit dev script (deployment select local) after Steve logs in.
- Task 3: minor (deferred): not_found decided by message text; planDay per-block by_task queries; blocks history window 90d.
- Task 4: minor (deferred): safeEqual length timing; fail() d?.message guard; unanchored route regexes; restOps.add lacks .catch(asConvexError) insurance.
- Task 5: minor (deferred): batch arrays → single -32600; no CORS/OPTIONS; response objects get -32600.
- Task 6: minor (deferred): no ImportMetaEnv typing for CONVEX_URL; no loading state; provider adapter untested; stale apps/web .env.local deleted by controller.
- Task 7: minor (deferred): runner doesn't report client-side dropped blocks; events with null optional fields would abort import; re-run overwrites live edits (documented).
- Task 8: minor (deferred): prod ALLOWED_USER_ID first-sign-in note only for local; Vercel Settings→Git path unverified.
