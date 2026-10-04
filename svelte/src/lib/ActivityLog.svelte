<script lang="ts">
  import { collect } from "../../../release/index.ts";
  import type { Model as TodoList } from "./TodoList.svelte";
  import type Self from "./ActivityLog.svelte";
  import type { Test, Sweater } from "../../../suede.sweater-vest/dsl.import.meta.vitest";
  import type { newList } from "./fixtures";
  import type TodoListView from "./TodoList.svelte";

  // A second, independent listener on the same models. Neither this nor the
  // TodoList knows the other exists: each subscribes to what it cares about.
  let { list }: { list: TodoList } = $props();
  let lines = $state<string[]>([]);

  const record = (line: string) => lines.unshift(line);

  $effect(() => list.events["request add"]((text) => record(`added "${text}"`)));

  $effect(() =>
    collect(list.items)
      .renamed((text, previous) => record(`renamed "${previous}" → "${text}"`))
      .toggled((done, todo) => record(`${done ? "completed" : "reopened"} "${todo.text}"`))
      ["request removal"]((todo) => record(`removed "${todo.text}"`)),
  );
</script>

<ol class="log" aria-label="Activity">
  {#each lines as line, i (i)}
    <li>{line}</li>
  {/each}
</ol>

<!-- Logs what happens to the models, however it was set off. -->
{#snippet logsModelEvents(
  ActivityLog: typeof Self,
  Status: typeof Sweater.Status,
  makeList: typeof newList,
  test: Test,
)}
  {@const list = makeList("Buy milk", "Walk the dog")}
  <Status {test} />
  <ActivityLog {list} />
  {test(async ({ expect, screen, flushSync }) => {
    const [milk, dog] = list.items;
    milk.events.toggled.fire(true);
    dog.events.renamed.fire("Walk the cat", dog.text);
    list.events["request add"].fire("Ship it");
    flushSync();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      'added "Ship it"',
      'renamed "Walk the dog" → "Walk the cat"',
      'completed "Buy milk"',
    ]);
  })}
{/snippet}

<!-- Beside a TodoList over the same model: clicks in one view show up in the other. -->
{#snippet besideTheList(
  ActivityLog: typeof Self,
  TodoList: typeof TodoListView,
  Status: typeof Sweater.Status,
  makeList: typeof newList,
  test: Test,
)}
  {@const list = makeList("Buy milk", "Walk the dog")}
  <Status {test} />
  <TodoList {list} />
  <ActivityLog {list} />
  {test(async ({ expect, user, screen, within }) => {
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Clear completed" }));
    const log = within(screen.getByRole("list", { name: "Activity" }));
    expect(log.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      'removed "Buy milk"',
      'completed "Buy milk"',
    ]);
    expect(list.items.map((todo) => todo.text)).toEqual(["Walk the dog"]);
  })}
{/snippet}

<style>
  .log {
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
    color: #555;
  }
</style>
