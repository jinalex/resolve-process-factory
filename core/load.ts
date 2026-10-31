// Loads a spec from the repo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Spec } from "./spec.ts";

export const ROOT = new URL("..", import.meta.url).pathname;

// A path is read from the repo root, unless it is absolute.
export function loadSpec(file: string): Spec {
  return JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));
}
