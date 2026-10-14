import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CloseIcon, PlusIcon } from "./icons";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

// The calendars whose events fill the day: a secret iCal address each, synced every ten minutes.
export function CalendarsRoom({ offline = false }: { offline?: boolean }) {
  const feeds = useQuery(api.calendar.feeds, {});
  const add = useMutation(api.calendar.addFeed);
  const remove = useMutation(api.calendar.removeFeed);
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      await add({ url });
      setUrl("");
    } catch (err) {
      setBad((err as { data?: { message?: string } })?.data?.message ?? "Couldn't add that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="room-main share">
      <form className="share-form sheet-form" onSubmit={submit}>
        <h1 className="room-title">Calendars</h1>
        {feeds && feeds.length > 0 && (
          <ul className="cal-feeds">
            {feeds.map((f) => (
              <li key={f.id} className="cal-feed">
                <span className="cal-feed-name">{f.label}</span>
                <span className={`cal-feed-state${f.error ? " is-bad" : ""}`}>
                  {f.error ?? (f.synced_at ? ago(f.synced_at) : "syncing")}
                </span>
                <button type="button" className="cal-feed-x" aria-label={`Remove ${f.label}`} disabled={offline}
                  onClick={() => remove({ id: f.id as Id<"calendar_feeds"> })}>
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="cal-add">
          <label className="sheet-field">
            <input aria-label="Calendar address" value={url} onChange={(e) => { setUrl(e.target.value); setBad(null); }} placeholder="Secret address in iCal format"
              autoComplete="off" inputMode="url" aria-invalid={bad ? true : undefined} />
          </label>
          <button type="submit" className="room-button" disabled={busy || offline || !url.trim()} aria-label="Add calendar">
            <PlusIcon size={15} />
          </button>
        </div>
        {bad && <p className="sheet-error" role="alert">{bad}</p>}
      </form>
    </main>
  );
}
