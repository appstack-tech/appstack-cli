export const DRIVER_IDS = ["claude", "codex"] as const;

export type DriverId = (typeof DRIVER_IDS)[number];

export interface AgentCapabilities {
  filesystem: "read" | "write";
  network: boolean;
  shell: "read-only" | "unrestricted";
}

export interface AgentOptions {
  prompt: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  capabilities: AgentCapabilities;
  onStatus?: (message: string) => void;
}

export interface AgentResult {
  ok: boolean;
  finalText?: string;
}

export interface AgentDriver {
  id: DriverId;
  displayName: string;
  detect(): Promise<boolean>;
  run(options: AgentOptions): Promise<AgentResult>;
}
