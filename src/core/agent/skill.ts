import { join } from "node:path";
import type { FrameworkId } from "@/constants";
import { packageRoot, readText } from "@/util";

export function loadSkill(framework: FrameworkId): string {
  const root = join(packageRoot(), "skills", "appstack-sdk");
  const main = readText(join(root, "SKILL.md"));
  const reference = readText(join(root, "references", `${framework}.md`));
  if (!main || !reference) {
    throw new Error(`The bundled Appstack skill is missing its ${framework} reference.`);
  }
  return `${main.trim()}\n\n---\n\n${reference.trim()}`;
}
