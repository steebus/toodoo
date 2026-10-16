import { useEffect, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CAL_COLOUR_LABEL, CAL_COLOURS } from "@shared/calendars.ts";
import { LEAD_CHOICES } from "@shared/notify.ts";
import { useTheme, type Theme } from "../lib/theme";
import { pushDevice, turnOff, turnOn, type PushState } from "../lib/push";
import { JiraLink } from "./JiraLink";
import { AutoIcon, CloseIcon, MoonIcon, PlusIcon, SunIcon } from "./icons";

// A sync takes seconds; one tried this long ago with nothing to show never finished.
const STUCK_MS = 3 * 60_000;
const stuck = (f: { synced_at: number | null; tried_at: number | null }) =>
  !!f.tried_at && (!f.synced_at || f.tried_at > f.synced_at) && Date.now() - f.tried_at > STUCK_MS;

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

const message = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;

// Settings: Connections (calendars and Jira), Notifications, Appearance, then Sign out at the foot.
export function SettingsRoom({ offline = false, onSignOut }: { offline?: boolean; onSignOut?: () => void }) {
  return (
    <main className="room-main share settings">
      <div className="settings-page">
        <h1 className="room-title">Settings</h1>
        <section className="set-section" aria-labelledby="set-connections">
          <h2 id="set-connections" className="set-head">Connections</h2>
          <div className="set-group">
            <h3 className="set-sub">Calendars</h3>
            <Calendars offline={offline} />
          </div>
          <div className="set-group">
            <h3 className="set-sub">Jira</h3>
            <JiraLink offline={offline} />
          </div>
        </section>
        <section className="set-section" aria-labelledby="set-notifications">
          <h2 id="set-notifications" className="set-head">Notifications</h2>
          <Notifications offline={offline} />
        </section>
        <section className="set-section" aria-labelledby="set-appearance">
          <h2 id="set-appearance" className="set-head">Appearance</h2>
          <ThemePick />
        </section>
        {onSignOut && (
          <div className="set-foot">
            <button type="button" className="room-button is-quiet set-out" onClick={onSignOut}>Sign out</button>
          </div>
        )}
      </div>
    </main>
  );
}

// The calendars whose events fill the day: a secret iCal address each, synced every ten minutes, each in a colour.
function Calendars({ offline }: { offline: boolean }) {
  const feeds = useQuery(api.calendar.feeds, {});
  const add = useMutation(api.calendar.addFeed);
  const remove = useMutation(api.calendar.removeFeed);
  const paint = useMutation(api.calendar.setColour);
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
      setBad(message(err, "Couldn't add that"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="share-form sheet-form" onSubmit={submit}>
      {feeds && feeds.length > 0 && (
        <ul className="cal-feeds">
          {feeds.map((f) => (
            <li key={f.id} className="cal-feed has-colour">
              <span className="cal-feed-name">{f.label}</span>
              <span className={`cal-feed-state${f.error || stuck(f) ? " is-bad" : ""}`}>
                {f.error ?? (stuck(f) ? "sync didn't finish" : f.synced_at ? ago(f.synced_at) : "syncing")}
              </span>
              <button type="button" className="cal-feed-x" aria-label={`Remove ${f.label}`} disabled={offline}
                onClick={() => remove({ id: f.id as Id<"calendar_feeds"> })}>
                <CloseIcon size={14} />
              </button>
              <fieldset className="cal-swatches" disabled={offline}>
                <legend className="sr-only">Colour for {f.label}</legend>
                {CAL_COLOURS.map((c) => (
                  <label key={c} className="cal-swatch" title={CAL_COLOUR_LABEL[c]} style={{ ["--cal" as string]: `var(--cal-${c})` }}>
                    <input type="radio" name={`colour-${f.id}`} value={c} checked={f.colour === c} aria-label={CAL_COLOUR_LABEL[c]}
                      onChange={() => void paint({ id: f.id as Id<"calendar_feeds">, colour: c })} />
                    <span />
                  </label>
                ))}
              </fieldset>
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
  );
}

const leadLabel = (m: number) => (m ? `${m} min before` : "At the time");

// Due-date reminders on this device, by Web Push: a task with a time, its lead before; one with only a day, at the
// morning time. Each phone or browser says yes for itself; the times are the account's.
function Notifications({ offline }: { offline: boolean }) {
  const [device, setDevice] = useState<PushState>({ at: "looking" });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const endpoint = device.at === "on" ? device.endpoint : undefined;
  const status = useQuery(api.push.status, endpoint ? { endpoint } : {});
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const setPrefs = useMutation(api.push.setPrefs);
  const key = useAction(api.pushSend.publicKey);
  const test = useAction(api.pushSend.test);
  useEffect(() => {
    let live = true;
    void pushDevice().then((s) => live && setDevice(s));
    return () => { live = false; };
  }, []);
  // On in this browser but forgotten by the server (removed, or it went away): off.
  const on = device.at === "on" && status?.subscribed !== false;

  const enable = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const s = await turnOn(() => key({}), (sub) => subscribe(sub));
      setDevice(s);
      if (s.at === "on") setSaid("On. Due tasks will show here.");
    } catch (err) {
      setSaid(message(err, err instanceof Error ? err.message : "Couldn't turn them on"));
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setSaid(null);
    try {
      setDevice(await turnOff((e) => unsubscribe({ endpoint: e })));
    } finally {
      setBusy(false);
    }
  };
  const save = (p: { remind_at?: string; lead_mins?: number }) =>
    setPrefs(p).then(() => setSaid(null), (err) => setSaid(message(err, "Couldn't save that")));

  return (
    <div className="set-notify" aria-live="polite">
      <div className="set-row">
        <span className="set-label">
          Due date reminders
          <span className="set-hint">
            {device.at === "unsupported" ? "This browser can't show them. On a phone, install toodoo to the home screen first."
              : device.at === "blocked" ? "Notifications are blocked for toodoo. Allow them in the browser's or phone's settings, then come back."
              : on ? "On for this device" : "Off for this device"}
            {status && status.devices > (on ? 1 : 0) && ` · ${status.devices} ${status.devices === 1 ? "device" : "devices"} on`}
          </span>
        </span>
        {device.at !== "looking" && device.at !== "unsupported" && device.at !== "blocked" && (
          <button type="button" role="switch" aria-checked={on} className={`set-switch${on ? " is-on" : ""}`} disabled={busy || offline}
            aria-label="Due date reminders on this device" onClick={() => void (on ? disable() : enable())}>
            <span className="set-switch-knob" aria-hidden />
          </button>
        )}
      </div>
      {status && (
        <>
          <label className="set-row">
            <span className="set-label">Tasks with only a date<span className="set-hint">Reminded that morning</span></span>
            <input type="time" className="set-input" step={900} value={status.remind_at} disabled={offline}
              onChange={(e) => e.target.value && void save({ remind_at: e.target.value.slice(0, 5) })} />
          </label>
          <label className="set-row">
            <span className="set-label">Tasks with a time<span className="set-hint">Reminded ahead of it</span></span>
            <select className="set-input" value={status.lead_mins} disabled={offline} onChange={(e) => void save({ lead_mins: Number(e.target.value) })}>
              {LEAD_CHOICES.map((m) => <option key={m} value={m}>{leadLabel(m)}</option>)}
            </select>
          </label>
        </>
      )}
      {on && endpoint && (
        <div className="set-row">
          <span className="set-label">Check it works</span>
          <button type="button" className="room-button is-quiet" disabled={busy || offline} onClick={() => {
            setSaid(null);
            void test({ endpoint }).then((r) => setSaid(r === "sent" ? "Sent. It should arrive in a moment." : "Couldn't send it."),
              (err) => setSaid(message(err, "Couldn't send it")));
          }}>Send a test</button>
        </div>
      )}
      {said && <p className="set-said">{said}</p>}
    </div>
  );
}

const THEMES: [Theme, string, typeof SunIcon][] = [["light", "Light", SunIcon], ["dark", "Dark", MoonIcon], ["auto", "Auto", AutoIcon]];

// Light, Dark or the system's, for this device.
function ThemePick() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="set-row">
      <span className="set-label">Theme<span className="set-hint">On this device</span></span>
      <div className="set-seg" role="radiogroup" aria-label="Theme">
        {THEMES.map(([t, label, Icon]) => (
          <button key={t} type="button" role="radio" aria-checked={theme === t} className="set-seg-item" onClick={() => setTheme(t)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
