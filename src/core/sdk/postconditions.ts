import type { WorkflowId } from "@/core/agent/prompt";
import type { Inspection } from "@/core/sdk/inspect";
import { compareVersions } from "@/core/sdk/latest";

export interface PostconditionResult {
  ok: boolean;
  errors: string[];
}

export function verifyWorkflowPostconditions(options: {
  workflow: Exclude<WorkflowId, "review">;
  after: Inspection;
  targetVersion?: string;
}): PostconditionResult {
  const errors: string[] = [];

  if (options.workflow === "integrate") {
    if (!options.after.installed) {
      errors.push("The SDK dependency is still not installed.");
    }
    if (
      options.after.findings.some(
        (finding) => finding.code === "configure-missing",
      )
    ) {
      errors.push("SDK initialization is still missing.");
    }
    const remainingErrors = options.after.findings
      .filter(
        (finding) =>
          finding.severity === "error" &&
          !["sdk-not-installed", "configure-missing"].includes(finding.code),
      )
      .map((finding) => finding.code);
    if (remainingErrors.length) {
      errors.push(
        `Deterministic errors remain: ${remainingErrors.join(", ")}.`,
      );
    }
  }

  if (options.workflow === "upgrade") {
    if (!options.targetVersion) {
      errors.push("No upgrade target was resolved.");
    } else if (!options.after.installedVersion) {
      errors.push("The installed SDK version could not be detected after the upgrade.");
    } else if (
      compareVersions(options.after.installedVersion, options.targetVersion) !== 0
    ) {
      errors.push(
        `Expected SDK ${options.targetVersion}, but detected ${options.after.installedVersion}.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
