import { fetchTests } from "../../../../../suede.sweater-vest/runtimes/common.svelte.ts";

// tests run in the browser only
export const ssr = false;
export const prerender = false;

// Typed by hand rather than from `./$types`: sweater-vest hides this route from
// SvelteKit outside the dev server (sync included), so no types are generated for it.
export const load = async ({ params, fetch }: { params: { path: string }; fetch: typeof globalThis.fetch }) => {
  const tests = await fetchTests(fetch);
  const key = params.path.replace(/\/$/, "");
  return { entry: tests.find((t) => t.key === key) ?? null, tests, key };
};
