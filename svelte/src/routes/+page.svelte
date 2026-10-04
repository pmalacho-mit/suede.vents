<script lang="ts">
  import { ActivityLog, TodoList } from "../lib/index.ts";
  import { Model as List } from "../lib/TodoList.svelte";

  // The model: plain state and the events that change it. It knows nothing
  // about the components below, and they never mutate it, only dispatch.
  const list = new List("Buy milk", "Walk the dog", "Write tests");
</script>

<main>
  <h1>vents</h1>
  <p>
    MVC with Svelte: models own their state and announce changes as events, views only dispatch,
    and controllers subscribe to decide what requests mean. See every component's tests and
    examples at <a href="/vests">/vests</a>.
  </p>

  <TodoList {list} />

  <h2>Activity</h2>
  <ActivityLog {list} />
</main>

<style>
  main {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
  }
</style>
