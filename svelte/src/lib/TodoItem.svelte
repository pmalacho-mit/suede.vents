<script lang="ts" module>
  import { WithEvents } from "../../../release/index.ts";

  export class Model extends WithEvents<{
    renamed: [text: string, previous: string];
    toggled: [done: boolean];
    "request removal": [];
  }> {
    text = $state("");
    done = $state(false);

    constructor(text: string) {
      super();
      this.text = text;
      // The model listens to itself first, so its state has settled before
      // any other listener (a component, a collection) hears about the change.
      this.events.renamed((text) => (this.text = text));
      this.events.toggled((done) => (this.done = done));
    }
  }
</script>

<script lang="ts">
  import type Self from "./TodoItem.svelte";
  import type { Test, Sweater } from "../../../suede.sweater-vest/dsl.import.meta.vitest";
  import type { newTodo, heard } from "./fixtures";

  // The item never mutates the todo directly: it only dispatches. Whoever owns
  // the list decides what "request removal" means.
  let { todo }: { todo: Model } = $props();
</script>

<li class:done={todo.done}>
  <input
    type="checkbox"
    checked={todo.done}
    onchange={({ currentTarget }) =>
      todo.events.toggled.fire(currentTarget.checked)}
  />
  <input
    class="text"
    value={todo.text}
    onchange={({ currentTarget }) =>
      todo.events.renamed.fire(currentTarget.value, todo.text)}
  />
  <button
    aria-label="Remove"
    onclick={() => todo.events["request removal"].fire()}>×</button
  >
</li>

<!-- The view only dispatches. The model applies its own change, then everyone else hears it. -->
{#snippet dispatches(
  TodoItem: typeof Self,
  Status: typeof Sweater.Status,
  makeTodo: typeof newTodo,
  listen: typeof heard,
  test: Test,
)}
  {@const todo = makeTodo("Buy milk")}
  {@const log = listen()}
  <Status {test} />
  <ul><TodoItem {todo} /></ul>
  {test(async ({ expect, user, screen }) => {
    todo.events.toggled(log.listener).renamed(log.listener);

    await user.click(screen.getByRole("checkbox"));
    expect(todo.done).toBe(true);

    const text = screen.getByRole("textbox");
    await user.clear(text);
    await user.type(text, "Buy oat milk");
    await user.tab(); // change fires as the field loses focus
    expect(todo.text).toBe("Buy oat milk");

    expect(log.lines).toEqual(['true <Buy milk>', '"Buy oat milk" "Buy milk" <Buy oat milk>']);
  })}
{/snippet}

<!-- Asking to be removed is only a request: the item has no say in where it lives. -->
{#snippet requestsRemoval(
  TodoItem: typeof Self,
  Status: typeof Sweater.Status,
  makeTodo: typeof newTodo,
  listen: typeof heard,
  test: Test,
)}
  {@const todo = makeTodo("Walk the dog")}
  {@const log = listen()}
  <Status {test} />
  <ul><TodoItem {todo} /></ul>
  {test(async ({ expect, user, screen }) => {
    todo.events["request removal"](log.listener);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(log.lines).toEqual(["<Walk the dog>"]);
    expect(screen.getByRole("listitem")).toBeDefined();
  })}
{/snippet}

<!-- Anyone holding the model can drive it, and every view of it follows. -->
{#snippet followsTheModel(
  TodoItem: typeof Self,
  Status: typeof Sweater.Status,
  makeTodo: typeof newTodo,
  test: Test,
)}
  {@const todo = makeTodo("Write tests")}
  <Status {test} />
  <ul>
    <TodoItem {todo} />
    <TodoItem {todo} />
  </ul>
  {test(async ({ expect, screen, flushSync }) => {
    todo.events.toggled.fire(true);
    todo.events.renamed.fire("Write more tests", todo.text);
    flushSync();
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.classList).toContain("done");
      expect(item.querySelector<HTMLInputElement>(".text")!.value).toBe("Write more tests");
    }
  })}
{/snippet}

<style>
  li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .text {
    flex: 1;
    border: 1px solid transparent;
    font: inherit;
    padding: 0.25rem;
  }
  .text:hover,
  .text:focus {
    border-color: #ccc;
  }
  .done .text {
    text-decoration: line-through;
    opacity: 0.6;
  }
</style>
