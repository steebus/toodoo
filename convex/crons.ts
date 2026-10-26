import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync calendars", { minutes: 30 }, internal.calendar.syncAll);
crons.interval("sync jira", { minutes: 15 }, internal.jira.syncAll);
crons.interval("due reminders", { minutes: 5 }, internal.push.round);
export default crons;
