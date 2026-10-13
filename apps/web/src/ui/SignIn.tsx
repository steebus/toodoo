import { useEffect, useState } from "react";
import { fmtTime, today, toHM, nowMin } from "@shared/planning.ts";
import { shortDate } from "./format";
import "./pass.css";
import "./rooms.css";

// The door: one docket feeds down onto the rail with today's date and time printed on it, and one button.
export function SignIn({ onSignIn }: { onSignIn: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [going, setGoing] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    // Back from the sign-in page without signing in (the browser kept this one): the button works again.
    const back = () => setGoing(false);
    window.addEventListener("pageshow", back);
    return () => {
      clearInterval(id);
      window.removeEventListener("pageshow", back);
    };
  }, []);
  return (
    <main className="room signin">
      <h1 className="wordmark signin-wordmark">toodoo</h1>
      <div className="signin-pass" aria-hidden>
        <div className="signin-docket">
          <div className="dk-paper" />
          <div className="signin-print">
            <p className="signin-head">
              <span>{shortDate(today(now))}</span>
              <span>{fmtTime(toHM(nowMin(now))).toUpperCase()}</span>
            </p>
            <p className="signin-dashes">--------------------------------</p>
            <p className="signin-order">1 × YOUR DAY</p>
            <p className="signin-dashes">--------------------------------</p>
            <p className="signin-foot">ORDER UP</p>
          </div>
        </div>
        <span className="rail-bar signin-rail" />
      </div>
      <button type="button" className="signin-button" disabled={going} onClick={() => { setGoing(true); onSignIn(); }}>
        {going ? "Signing in…" : "Sign in"}
      </button>
    </main>
  );
}
