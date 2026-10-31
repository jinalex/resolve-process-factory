// The mod's own tests (mod/resolve/tests) run under `claude plugin test`, not vitest.
// Z3 and the property tests run for seconds to a minute each, and slower when test files share the cores or the
// runner is slow, so every test and hook gets two minutes. A test that needs longer names its own limit.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({ test: { exclude: [...configDefaults.exclude, "mod/**"], testTimeout: 120_000, hookTimeout: 120_000 } });
