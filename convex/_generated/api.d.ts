/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as calendar from "../calendar.js";
import type * as calendarSync from "../calendarSync.js";
import type * as crons from "../crons.js";
import type * as epics from "../epics.js";
import type * as http from "../http.js";
import type * as importArtifact from "../importArtifact.js";
import type * as lib_user from "../lib/user.js";
import type * as mcp from "../mcp.js";
import type * as me from "../me.js";
import type * as model from "../model.js";
import type * as rest from "../rest.js";
import type * as restOps from "../restOps.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  calendar: typeof calendar;
  calendarSync: typeof calendarSync;
  crons: typeof crons;
  epics: typeof epics;
  http: typeof http;
  importArtifact: typeof importArtifact;
  "lib/user": typeof lib_user;
  mcp: typeof mcp;
  me: typeof me;
  model: typeof model;
  rest: typeof rest;
  restOps: typeof restOps;
  stats: typeof stats;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
