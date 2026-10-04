import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import sweaterVest from "../suede.sweater-vest/vite-plugin/plugin.ts";

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },

      // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
      // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
      // See https://svelte.dev/docs/kit/adapters for more information about adapters.
      adapter: adapter(),
    }),
    // Component tests written as snippets beside each component: run by
    // Vitest, rendered at /vests on the dev server, erased from builds.
    sweaterVest({
      external: process.env.SVPORT
        ? `http://localhost:${process.env.SVPORT}`
        : undefined,
    }),
  ],
  test: {
    projects: [sweaterVest.project()],
  },
});
