import { join } from "node:path";
import type { FrameworkId } from "@/constants";
import type { TaskReference } from "@/core/skill/types";
import { readText } from "@/util";

export function loadSkillFromRoot(
  root: string,
  framework: FrameworkId,
  references: TaskReference[] = [],
): string {
  const main = readText(join(root, "SKILL.md"));
  const reference = readText(join(root, "references", `${framework}.md`));
  if (!main || !reference) {
    throw new Error(`The Appstack skill is missing its ${framework} reference.`);
  }
  const tasks = references.map((name) => {
    const body = readText(join(root, "references", `${name}.md`));
    if (!body) throw new Error(`The Appstack skill is missing its ${name} reference.`);
    return body.trim();
  });
  const included = [`references/${framework}.md`, ...references.map((name) => `references/${name}.md`)];
  const note =
    `This playbook already contains ${included.join(", ")}, in that order below. ` +
    "Other references linked above are not needed for this task; do not search for them.";
  return [main.trim(), note, reference.trim(), ...tasks].join("\n\n---\n\n");
}
