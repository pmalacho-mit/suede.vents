<script lang="ts" module>
  import { collect, WithEvents } from "../../../release/index.ts";
  import TodoItem, { Model as Todo } from "./TodoItem.svelte";

  export class Model extends WithEvents<{ "request add": [text: string] }> {
    items = $state<Todo[]>([]);

    constructor(...texts: string[]) {
      super();
      this.items = texts.map((text) => new Todo(text));
      this.events["request add"]((text) => this.items.push(new Todo(text)));
    }
  }
</script>

<script lang="ts">
  import type Self from "./TodoList.svelte";
  import type { Test, Sweater } from "../../../suede.sweater-vest/dsl.import.meta.vitest";
  import type { newList } from "./fixtures";

  let { list }: { list: Model } = $props();
  let draft = $state("");

  // The controller: one subscription over every item decides what their
  // requests mean. `collect` reads `list.items`, so the effect re-subscribes
  // whenever the list changes, and the subscription is its own teardown.
  $effect(() =>
    collect(list.items)["request removal"]((_todo, index) => list.items.splice(index, 1)),
  );

  const add = (event: SubmitEvent) => {
    event.preventDefault();
    if (draft.trim()) list.events["request add"].fire(draft.trim());
    draft = "";
  };

  // Firing on a collection dispatches from every member, through the same
  // path a click would take. Indices resolve at dispatch time, so the removal
  // listener above can splice mid-loop.
  const completeAll = () => collect(list.items).toggled.fire(true);
  const clearCompleted = () => collect(list.items.filter((todo) => todo.done))["request removal"].fire();
  const removeAll = () => collect(list.items)["request removal"].fire();
</script>

<form onsubmit={add}>
  <input bind:value={draft} placeholder="What needs doing?" aria-label="New todo" />
  <button>Add</button>
</form>

<ul>
  {#each list.items as todo (todo)}
    <TodoItem {todo} />
  {:else}
    <li class="empty">Nothing to do.</li>
  {/each}
</ul>

<div class="actions">
  <button onclick={completeAll} disabled={!list.items.length}>Complete all</button>
  <button onclick={clearCompleted} disabled={!list.items.some((todo) => todo.done)}>Clear completed</button>
  <button onclick={removeAll} disabled={!list.items.length}>Remove all</button>
</div>

<!-- An item asks to be removed; the list, which owns the items, decides to remove it. -->
{#snippet removesOnRequest(
  TodoList: typeof Self,
  Status: typeof Sweater.Status,
  makeList: typeof newList,
  test: Test,
)}
  {@const list = makeList("Buy milk", "Walk the dog", "Write tests")}
  <Status {test} />
  <TodoList {list} />
  {test(async ({ expect, user, screen }) => {
    const [, second] = screen.getAllByRole("button", { name: "Remove" });
    await user.click(second);
    expect(list.items.map((todo) => todo.text)).toEqual(["Buy milk", "Write tests"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  })}
{/snippet}

<!-- An item added later is covered too: the effect re-subscribes when the list changes. -->
{#snippet coversNewItems(
  TodoList: typeof Self,
  Status: typeof Sweater.Status,
  makeList: typeof newList,
  test: Test,
)}
  {@const list = makeList("Buy milk")}
  <Status {test} />
  <TodoList {list} />
  {test(async ({ expect, user, screen }) => {
    await user.type(screen.getByRole("textbox", { name: "New todo" }), "Ship it");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(list.items.map((todo) => todo.text)).toEqual(["Buy milk", "Ship it"]);

    const added = list.items[1];
    added.events["request removal"].fire();
    expect(list.items.map((todo) => todo.text)).toEqual(["Buy milk"]);
  })}
{/snippet}

<!-- Bulk actions fire on a collection: every item hears it as if clicked. -->
{#snippet bulkActions(
  TodoList: typeof Self,
  Status: typeof Sweater.Status,
  makeList: typeof newList,
  test: Test,
)}
  {@const list = makeList("Buy milk", "Walk the dog", "Write tests")}
  <Status {test} />
  <TodoList {list} />
  {test(async ({ expect, user, screen }) => {
    const texts = () => list.items.map((todo) => todo.text);

    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Clear completed" }));
    expect(texts()).toEqual(["Buy milk", "Write tests"]);

    await user.click(screen.getByRole("button", { name: "Complete all" }));
    expect(list.items.every((todo) => todo.done)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Remove all" }));
    expect(texts()).toEqual([]);
    expect(screen.getByText("Nothing to do.")).toBeDefined();
  })}
{/snippet}

<style>
  form,
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  form input {
    flex: 1;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  .empty {
    color: #888;
  }
</style>
