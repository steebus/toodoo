import { query } from "./_generated/server";
import { requireUser } from "./lib/user";

export const me = query({ args: {}, handler: (ctx) => requireUser(ctx) });
