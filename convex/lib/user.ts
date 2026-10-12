import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";

// ponytail: single allowed user; replace with membership checks if multi-user
export async function requireUser(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "unauthenticated", message: "sign in required" });
  if (!process.env.ALLOWED_USER_ID || identity.subject !== process.env.ALLOWED_USER_ID) {
    throw new ConvexError({ code: "forbidden", message: "not allowed" });
  }
  return identity.subject;
}
