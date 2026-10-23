import { authConfigProblem } from "./lib/auth";

/** Runs once when the server boots (not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const problem = authConfigProblem();
    if (problem) {
      console.error(
        `[swingbus] Refusing to start in production: ${problem}. See README.md → Production.`,
      );
      process.exit(1);
    }
    const { startDailyBackups } = await import("./lib/backups");
    startDailyBackups();
  }
}
