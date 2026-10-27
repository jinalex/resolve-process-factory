// Loads a spec from the repo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec } from "./spec.ts";

export const ROOT = new URL("..", import.meta.url).pathname;

export function loadSpec(file: string): Spec {
  return JSON.parse(readFileSync(join(ROOT, file), "utf8"));
}
