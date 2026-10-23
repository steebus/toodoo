import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

const failure = (e: unknown, what: string) => {
  const data = (e as { data?: unknown })?.data;
  const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "";
  return msg ? `${what}: ${msg}` : what;
};

const ago = (t: number) => {
  const mins = Math.round((Date.now() - t) / 60000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
};
const STUCK_MS = 3 * 60_000;

// The Jira link: every issue its JQL finds (by default, everything open assigned to Steve) waits here, with its
// description, estimate, priority, status and epic carried over. Synced every 15 minutes, or now.
export function JiraLink({ offline }: { offline: boolean }) {
  const link = useQuery(api.jira.link, {});
  const save = useMutation(api.jira.save);
  const remove = useMutation(api.jira.remove);
  const syncNow = useMutation(api.jira.syncNow);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ site: "", email: "", token: "", jql: "" });
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (link === undefined) return <div className="sug-jira" aria-busy />;

  const open = () => {
    setF({ site: link?.site.replace(/^https:\/\//, "") ?? "", email: link?.email ?? "", token: "", jql: link && link.jql !== link.default_jql ? link.jql : "" });
    setBad(null);
    setEditing(true);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ site: f.site, email: f.email, ...(f.token.trim() ? { token: f.token } : {}), jql: f.jql });
      setEditing(false);
    } catch (err) {
      setBad(failure(err, "Couldn't link that").replace(/^Couldn't link that: /, ""));
    } finally {
      setBusy(false);
    }
  };
  const syncing = !!link?.tried_at && (!link.synced_at || link.tried_at > link.synced_at) && Date.now() - link.tried_at < STUCK_MS && !link.error;
  // Nothing matched: say who Jira thinks we are and what was asked, the two things to check.
  const empty = !!link && !link.error && !syncing && link.synced_at !== null && link.count === 0;

  if (editing) {
    return (
      <form className="sug-jira sug-jira-form sheet-form" onSubmit={submit}>
        <div className="sheet-pair">
          <label className="sheet-field">Site
            <input value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="your-team.atlassian.net" autoComplete="off" required />
          </label>
          <label className="sheet-field">Email
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@work.com" autoComplete="off" required />
          </label>
        </div>
        <label className="sheet-field">
          <span>API token <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">make one</a></span>
          <input type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })}
            placeholder={link ? "Leave blank to keep the saved one" : "Paste it here"} autoComplete="off" required={!link} />
        </label>
        <label className="sheet-field">Which issues (JQL)
          <input value={f.jql} onChange={(e) => setF({ ...f, jql: e.target.value })} placeholder={link?.default_jql ?? "assignee = currentUser() AND statusCategory != Done"} autoComplete="off" spellCheck={false} />
        </label>
        {bad && <p className="sheet-error" role="alert">{bad}</p>}
        <div className="sheet-actions">
          {link && <button type="button" className="room-button is-quiet" disabled={offline} onClick={() => { void remove(); setEditing(false); }}>Unlink</button>}
          <span className="sheet-spacer" />
          <button type="button" className="room-button is-quiet" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="room-button" disabled={busy || offline}>{link ? "Save" : "Link Jira"}</button>
        </div>
      </form>
    );
  }
  if (!link) {
    return (
      <p className="sug-jira">
        <span className="sug-jira-name">Jira</span>
        <span className="sug-jira-state">not linked</span>
        <button type="button" className="room-button" disabled={offline} onClick={open}>Link Jira</button>
      </p>
    );
  }
  return (
    <>
      <p className="sug-jira">
        <span className="sug-jira-name" title={link.account ? `Signed in as ${link.account}\n${link.jql}` : link.jql}>Jira · {link.site.replace(/^https:\/\//, "")}</span>
        <span className={`sug-jira-state${link.error ? " is-bad" : ""}`}>
          {link.error ?? (syncing ? "syncing…" : link.synced_at ? `${link.count ?? 0} open · synced ${ago(link.synced_at)}` : "waiting to sync")}
        </span>
        <button type="button" className="room-button is-quiet" disabled={offline || syncing} onClick={() => void syncNow()}>Sync now</button>
        <button type="button" className="room-button is-quiet" onClick={open}>Edit</button>
      </p>
      {link.bitbucket_error && (
        <p className="sug-jira">
          <span className="sug-jira-name">Bitbucket</span>
          <span className="sug-jira-state is-bad">{link.bitbucket_error}</span>
        </p>
      )}
      {empty && (
        <p className="sug-jira sug-jira-hint">
          No issues matched. Signed in as {link.account ?? link.email}; searched <code>{link.jql}</code>
        </p>
      )}
    </>
  );
}

// The link's name and state on one line, for Suggested's Jira pile.
export function JiraState() {
  const link = useQuery(api.jira.link, {});
  if (link === undefined) return null;
  if (!link) return <><span className="sug-jira-name">Jira</span><span className="sug-jira-state">not linked</span></>;
  return (
    <>
      <span className="sug-jira-name">Jira · {link.site.replace(/^https:\/\//, "")}</span>
      <span className={`sug-jira-state${link.error ? " is-bad" : ""}`}>{link.error ?? (link.synced_at ? `synced ${ago(link.synced_at)}` : "waiting to sync")}</span>
      {link.bitbucket_error && <span className="sug-jira-state is-bad" title={link.bitbucket_error}>Bitbucket: {link.bitbucket_error}</span>}
    </>
  );
}
