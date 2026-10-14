import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync calendars", { minutes: 10 }, internal.calendar.syncAll);
export default crons;
