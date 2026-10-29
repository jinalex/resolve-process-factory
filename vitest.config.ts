// The mod's own tests (mod/resolve/tests) run under `claude plugin test`, not vitest.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({ test: { exclude: [...configDefaults.exclude, "mod/**"] } });
