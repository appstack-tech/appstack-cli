import { join } from "node:path";
import type { FrameworkId } from "@/constants";
import { packageRoot, readText } from "@/util";

export function loadSkill(framework: FrameworkId): string {
  return loadSkillFromRoot(
    join(packageRoot(), "skills", "appstack-sdk"),
    framework,
  );
}

export function loadSkillFromRoot(
  root: string,
  framework: FrameworkId,
): string {
  const main = readText(join(root, "SKILL.md"));
  const reference = readText(join(root, "references", `${framework}.md`));
  if (!main || !reference) {
    throw new Error(`The Appstack skill is missing its ${framework} reference.`);
  }
  return `${main.trim()}\n\n---\n\n${reference.trim()}`;
}
