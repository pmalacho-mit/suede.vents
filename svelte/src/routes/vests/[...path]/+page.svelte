<script lang="ts">
  import Runner from "../../../../../suede.sweater-vest/runtimes/Browser.svelte";
  import type { load } from "./+page";

  let { data }: { data: Awaited<ReturnType<typeof load>> } = $props();
</script>

{#if data.entry}
  {#key data.entry.key}
    <Runner entry={data.entry} />
  {/key}
{:else}
  <h1>Vests</h1>
  {#if data.key}<p>No snippet at <code>{data.key}</code>.</p>{/if}
  <ul>
    {#each data.tests as t}
      <li>
        <a href="./{t.key}">{t.name}</a>
        {#if !t.test}<em>(example)</em>{/if}
      </li>
    {/each}
  </ul>
{/if}
