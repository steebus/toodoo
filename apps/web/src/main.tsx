import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuthKit } from "./ConvexProviderWithAuthKit";
import "@fontsource/carlito/latin-400.css";
import "@fontsource/carlito/latin-700.css";
import "@fontsource/iosevka-charon-mono/latin-300.css";
import "@fontsource/iosevka-charon-mono/latin-400.css";
import "@fontsource/iosevka-charon-mono/latin-500.css";
import "@fontsource/iosevka-charon-mono/latin-700.css";
import "@fontsource/rocknroll-one/latin-400.css";
import "./index.css";
import { App } from "./App";
import { stashShare } from "./lib/share";

stashShare(); // before sign-in can take the address away

const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* ponytail: single-user trade-off (refresh token in localStorage) because third-party cookies are blocked on vercel.app; switch to a WorkOS custom auth domain to drop devMode. */}
    <AuthKitProvider devMode clientId={import.meta.env.VITE_WORKOS_CLIENT_ID} redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI}>
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  </StrictMode>,
);
