import { defineConfig } from "vitest/config";
import namespaceTests from "./suede.nests.vents/vite-plugin/plugin.mts";

export default defineConfig({
  plugins: [namespaceTests({ exclude: ["svelte/**", "suede.*/**"] })],
  test: {
    expect: { requireAssertions: true },
    environment: "node",
    // Tests are found by the plugin: namespace tests beside the code in release/.
    include: [],
  },
});
