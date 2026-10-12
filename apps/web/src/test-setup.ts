import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "motion/react";

// jsdom has no animation frames worth waiting for: every motion lands on its final state at once.
MotionGlobalConfig.skipAnimations = true;
