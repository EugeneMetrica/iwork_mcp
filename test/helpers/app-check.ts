import { execFile } from "node:child_process";
import { resolveAppName } from "../../src/jxa.js";

/**
 * Check whether an iWork app is available on this machine.
 * Runs a trivial JXA call and returns true if it succeeds.
 */
export function isAppAvailable(appName: "Numbers" | "Pages" | "Keynote"): Promise<boolean> {
  const resolved = resolveAppName(appName);
  const script = `Application("${resolved}").name()`;
  return new Promise((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: 10_000 },
      (error) => resolve(!error),
    );
  });
}

/**
 * Check whether the app is currently running WITHOUT launching it
 * (running() is the no-launch probe). Suites record this at start so
 * teardown only quits apps the suite itself launched.
 */
export function isAppRunning(appName: "Numbers" | "Pages" | "Keynote"): Promise<boolean> {
  const resolved = resolveAppName(appName);
  const script = `Application("${resolved}").running()`;
  return new Promise((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: 10_000 },
      (error, stdout) => resolve(!error && stdout.trim() === "true"),
    );
  });
}
