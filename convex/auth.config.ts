import type { AuthConfig } from "convex/server";

const clientId = process.env.WORKOS_CLIENT_ID;
const authkit = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/+$/, ""); // e.g. https://xyz.authkit.app

export default {
  providers: [
    // Web app sign-in (from Convex's AuthKit template)
    { type: "customJwt", issuer: "https://api.workos.com/", algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`, applicationID: clientId },
    { type: "customJwt", issuer: `https://api.workos.com/user_management/${clientId}`, algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}` },
    // MCP access tokens AuthKit issues to Claude: audience is this deployment's /mcp resource
    { type: "customJwt", issuer: authkit!, algorithm: "RS256",
      jwks: `${authkit}/oauth2/jwks`, applicationID: `${process.env.CONVEX_SITE_URL}/mcp` },
  ],
} satisfies AuthConfig;
