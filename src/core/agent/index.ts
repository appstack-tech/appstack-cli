import { claudeDriver } from "./drivers/claude";
import { codexDriver } from "./drivers/codex";
import type { AgentDriver, DriverId } from "./types";

export * from "./types";

const DRIVERS: AgentDriver[] = [claudeDriver, codexDriver];

export async function detectDrivers(): Promise<AgentDriver[]> {
  const values = await Promise.all(
    DRIVERS.map(async (driver) => ((await driver.detect()) ? driver : null)),
  );
  return values.filter((value): value is AgentDriver => value !== null);
}

export async function resolveDriver(requested?: DriverId): Promise<AgentDriver | undefined> {
  const drivers = await detectDrivers();
  if (!requested) return drivers[0];
  const match = drivers.find((driver) => driver.id === requested);
  if (!match) {
    throw new Error(
      `${requested} is not available. Detected: ${drivers.map((driver) => driver.id).join(", ") || "none"}.`,
    );
  }
  return match;
}
