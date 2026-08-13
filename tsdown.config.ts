import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["bin.ts"],
  format: "esm",
  platform: "node",
  target: "node20",
  clean: true,
  dts: false,
  alias: { "@": "src" },
});
