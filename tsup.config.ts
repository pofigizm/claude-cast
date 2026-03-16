import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
