# vents

Typed events for the objects in your app: names and payloads for the state changes that need them. Most useful with Svelte 5.

An object declares what can happen to it as typed events. When a change is worth naming, fire its event, and any code holding the object can react to it:

```ts
interface TodoEvents {
  renamed: [text: string, previous: string];
  toggled: [done: boolean];
  "request removal": [];
}

class Todo extends WithEvents<TodoEvents> {
  text = $state("");
  done = $state(false);

  constructor(text: string) {
    super();
    this.text = text;
    this.events.renamed((text) => (this.text = text));
    this.events.toggled((done) => (this.done = done));
  }
}

todo.events.toggled.fire(true); // from any component holding the todo
todo.events.toggled((done, todo) => console.log(todo.text, done)); // from any other
```

## Why

Svelte 5's `$state` tells you _that_ a value changed, not _what happened_. For most state that is all you need. Some changes, though, mean more than their values: a track moved in a playlist, a batch imported, an undo. Reading those back from the new values is awkward, or impossible.

`vents` adds that information where you want it:

- **Name complex changes.** One `moved` event, with `from` and `to`, says what happened. Otherwise you diff two arrays to find out.
- **Coordinate the view around a change.** Scrolling to an item, moving focus, playing a transition, flashing a row: these respond to the event, not to the state, and an effect watching values can't tell why they changed.
- **Let anything react without wiring.** Any component holding the object can listen or fire, so there are no callback props (`onremove`, `ontoggle`, …) to pass through every layer in between, nor do you need to set up callback mechanisms manually.

Use it alongside direct mutation for the few changes that need it, or go further. One effective style is model–view–controller: views only fire events, and whoever owns a model decides what each one means (see
[MVC with Svelte](#mvc-with-svelte)).

The events are typed with plain interfaces, so payloads are checked where they are fired and where they are received. Event names work with go-to-definition and find-all-references, and both lead to the event map.

A subscription is its own cleanup function, so it can be returned from a Svelte `$effect` as is:

```svelte
<script lang="ts">
  $effect(() => todo.events.toggled((done) => console.log(done)));
</script>
```

## Installation

`vents` is a [suede](https://github.com/pmalacho-mit/suede) dependency: you get its source code, and you import it by relative path.

```bash
bash <(curl https://suede.sh/install/release) --repo pmalacho-mit/suede.vents
```

Then import from its `index.ts`:

```ts
import { collect, createEvents, WithEvents } from "<path-to-vents>/index.ts";
```

The tests live in the source files themselves, written as types (see
[Tests](#tests)). The installer therefore also puts
[suede.nests](https://github.com/pmalacho-mit/suede.nests) next to vents, because the source files import its types. Nothing from the tests ends up in your build.

## Usage

### A standalone bus

`createEvents<Map>()` returns one handle per event. Calling a handle subscribes
a listener, and `.fire(...)` dispatches:

```ts
const bus = createEvents<{
  message: [text: string];
  done: [];
}>();

bus.message((text) => console.log(text));
bus.message.fire("hello"); // logs "hello"
bus.done.fire();
```

The event map is a plain interface or type: event names map to payload tuples.
Name the tuple elements: the names show up when you hover over a listener's
parameters.

### A model's events

Pass the model to `createEvents` and every listener also receives it, after the
payload:

```ts
interface PointEvents {
  moved: [x: number, y: number];
}

class Point {
  readonly events = createEvents<PointEvents, Point>(this);
  x = 0;
  y = 0;

  constructor() {
    // Registered first, so the model is up to date before other listeners run.
    this.events.moved((x, y) => ((this.x = x), (this.y = y)));
  }
}

const point = new Point();
point.events.moved((x, y, target) => console.log(target.x === x)); // true
point.events.moved.fire(3, 4);
```

Or extend `WithEvents`, which does the same with the subclass as the target:

```ts
class Sprite extends WithEvents<PointEvents> {
  x = 0;
  y = 0;

  constructor() {
    super();
    this.events.moved((x, y) => ((this.x = x), (this.y = y)));
  }
}
```

Listeners run in the order they subscribed. If a model listens to itself in its
constructor, its own listener runs first, so other listeners always see the
updated state.

### Naming a change

Events don't have to be the only way state changes. A method can change state
directly and then fire an event that says what it did:

```ts
interface PlaylistEvents {
  moved: [from: number, to: number];
  cleared: [count: number];
}

class Playlist extends WithEvents<PlaylistEvents> {
  tracks = $state<string[]>([]);

  move(from: number, to: number) {
    this.tracks.splice(to, 0, ...this.tracks.splice(from, 1));
    this.events.moved.fire(from, to);
  }

  clear() {
    const count = this.tracks.length;
    this.tracks = [];
    this.events.cleared.fire(count);
  }
}
```

The list renders `tracks` as usual. Code that needs to respond to the change
itself listens to the event:

```svelte
<script lang="ts">
  let { playlist }: { playlist: Playlist } = $props();
  let rows: HTMLElement[] = $state([]);
  let flashed = $state<number>();

  $effect(() =>
    playlist.events.moved((_from, to) => {
      flashed = to;
      rows[to]?.scrollIntoView({ block: "nearest" });
    }),
  );
</script>

{#each playlist.tracks as track, i (track)}
  <li bind:this={rows[i]} class:flashed={i === flashed}>{track}</li>
{/each}
```

### Subscriptions

Subscribing returns a subscription. You can chain more events onto it, and you
can unsubscribe all of them at once or one at a time:

```ts
const subscription = point.events
  .moved((x, y) => console.log("moved", x, y))
  .moved((x, y) => console.log("and again", x, y));

subscription.moved(); // with no argument: drops this chain's `moved` listeners
subscription(); // drops everything this chain subscribed

point.events.moved.once((x) => console.log("only the first time", x));
```

A subscription only removes its own listeners. Other listeners, including the
model's own, stay subscribed. Calling a subscription more than once is safe.

Each handle also has:

| Member          | What it does                                                      |
| --------------- | ----------------------------------------------------------------- |
| `fire(...)`     | calls every listener with the payload (and the target)            |
| `once(fn)`      | subscribes a listener that removes itself after its first call    |
| `listenerCount` | how many listeners the event has                                  |
| `clear()`       | drops every listener for the event, **including the model's own** |

Handles are created once per event and reused, so destructuring one is fine
(`const { moved } = point.events`). Handles can't be reassigned.

### Collections

`collect(models)` gives you the same handles for a whole array. Each listener
receives the model's payload, the model, and its **index**:

```ts
const todos = [new Todo("Buy milk"), new Todo("Walk the dog")];

// one subscription covers every todo
collect(todos)["request removal"]((todo, index) => todos.splice(index, 1));

todos[1].events["request removal"].fire(); // removes "Walk the dog"

// firing on a collection fires on every member, as if each one had fired
collect(todos).toggled.fire(true);
```

The index is looked up when the event fires, not when you subscribe. A listener
that removes the model that fired leaves every other model's index correct, so
firing `"request removal"` on a whole collection removes all of them.

A collection subscribes to the members the array holds _when you subscribe_.
Members added later aren't covered until you subscribe again. In Svelte that
happens on its own when the subscription is made inside an `$effect` (see
below).

## MVC with Svelte

One way to structure an app with vents keeps three roles apart:

- **Models** hold their state (`$state` fields) and declare their events. A
  model applies its own changes by listening to its own events.
- **Views** render a model and fire its events. A view holding a todo can say
  "this todo was toggled", or "this todo wants to be removed", without knowing
  who is listening.
- **Controllers** subscribe and set the rules. A list removes an item when the
  item asks to be removed. An activity log records what happened. Neither knows
  the other exists.

The pieces below come from a working todo app; the [demo app](#the-demo-app)
section says where it lives.

### Model

A class with `$state` fields and an event map. It can live in its own
`.svelte.ts` file, or in the `module` script of the component that renders it:

```svelte
<!-- TodoItem.svelte -->
<script lang="ts" module>
  import { WithEvents } from "<path-to-vents>/index.ts";

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
      this.events.renamed((text) => (this.text = text));
      this.events.toggled((done) => (this.done = done));
    }
  }
</script>
```

### View

A view renders the model and fires its events. In this style it never assigns
to the model:

```svelte
<!-- TodoItem.svelte, continued -->
<script lang="ts">
  let { todo }: { todo: Model } = $props();
</script>

<li class:done={todo.done}>
  <input
    type="checkbox"
    checked={todo.done}
    onchange={({ currentTarget }) => todo.events.toggled.fire(currentTarget.checked)}
  />
  <input
    value={todo.text}
    onchange={({ currentTarget }) => todo.events.renamed.fire(currentTarget.value, todo.text)}
  />
  <button onclick={() => todo.events["request removal"].fire()}>×</button>
</li>
```

The Remove button only _asks_. The item doesn't decide where it lives, so the
same component works in a list, a search result, or a detail panel. Each
context decides what removal means. No `onremove` prop is passed down, however
deeply the item is nested.

### Controller

A controller subscribes in an `$effect`. `collect` reads the array as it
subscribes, so the effect runs again when the list changes. The subscription is
the effect's cleanup, so the old one is removed first:

```svelte
<!-- TodoList.svelte -->
<script lang="ts" module>
  import { collect, WithEvents } from "<path-to-vents>/index.ts";
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
  let { list }: { list: Model } = $props();

  $effect(() =>
    collect(list.items)["request removal"]((_todo, index) => list.items.splice(index, 1)),
  );

  // bulk actions go through the same events a click would fire
  const completeAll = () => collect(list.items).toggled.fire(true);
  const clearCompleted = () =>
    collect(list.items.filter((todo) => todo.done))["request removal"].fire();
</script>

<ul>
  {#each list.items as todo (todo)}
    <TodoItem {todo} />
  {/each}
</ul>
<button onclick={completeAll}>Complete all</button>
<button onclick={clearCompleted}>Clear completed</button>
```

### More listeners, without changing the others

Anything else can subscribe to the same models. The list and the log below
don't know about each other:

```svelte
<!-- ActivityLog.svelte -->
<script lang="ts">
  import { collect } from "<path-to-vents>/index.ts";
  import type { Model as TodoList } from "./TodoList.svelte";

  let { list }: { list: TodoList } = $props();
  let lines = $state<string[]>([]);

  $effect(() => list.events["request add"]((text) => lines.unshift(`added "${text}"`)));

  $effect(() =>
    collect(list.items)
      .toggled((done, todo) => lines.unshift(`${done ? "completed" : "reopened"} "${todo.text}"`))
      ["request removal"]((todo) => lines.unshift(`removed "${todo.text}"`)),
  );
</script>

<ol>
  {#each lines as line, i (i)}<li>{line}</li>{/each}
</ol>
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import TodoList, { Model as List } from "../lib/TodoList.svelte";
  import ActivityLog from "../lib/ActivityLog.svelte";

  const list = new List("Buy milk", "Walk the dog");
</script>

<TodoList {list} />
<ActivityLog {list} />
```

Adding analytics, undo or syncing to a server works the same way: one more
subscriber, and the existing code stays as it is.

### The demo app

The vents repository has a SvelteKit app in `svelte/` containing these
components. Each component has
[sweater-vest](https://github.com/pmalacho-mit/suede.sweater-vest) test
snippets that show how it is used and test it. You can run them with Vitest or
open each one as a page on the dev server at `/vests`.

## Compared with `EventTarget`

The DOM's `EventTarget` (`addEventListener`, `removeEventListener`, `dispatchEvent`) is built into browsers and Node, and any class can extend it. It is the obvious alternative, so here is the same model written both ways.

With `EventTarget`:

```ts
class Todo extends EventTarget {
  text = $state("");

  rename(text: string) {
    const previous = this.text;
    this.text = text;
    this.dispatchEvent(new CustomEvent("renamed", { detail: { text, previous } }));
  }
}
```

```svelte
<script lang="ts">
  let { todo }: { todo: Todo } = $props();

  $effect(() => {
    const controller = new AbortController();
    todo.addEventListener(
      "renamed",
      (event) => {
        // `event` is a plain `Event`: the payload's type is asserted, not checked
        const { text, previous } = (event as CustomEvent<{ text: string; previous: string }>).detail;
        console.log(previous, "→", text);
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  });
</script>
```

With vents:

```ts
class Todo extends WithEvents<{ renamed: [text: string, previous: string] }> {
  text = $state("");

  rename(text: string) {
    const previous = this.text;
    this.text = text;
    this.events.renamed.fire(text, previous);
  }
}
```

```svelte
<script lang="ts">
  let { todo }: { todo: Todo } = $props();

  $effect(() => todo.events.renamed((text, previous) => console.log(previous, "→", text)));
</script>
```

|                        | `EventTarget`                                                                                  | vents                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Event names            | strings: a typo listens to an event that never fires                                           | keys of a typed map: a typo is a type error                                |
| Payload                | one `detail`, inside a `CustomEvent`; its type is asserted with a cast                         | named arguments, checked where fired and where received                   |
| The object that fired  | `event.currentTarget`, typed `EventTarget \| null`                                              | the last argument, typed as the model                                      |
| Unsubscribing          | `removeEventListener` with the same function, or an `AbortSignal`                              | call the subscription it returned                                          |
| In a Svelte `$effect`  | set up an `AbortController`, return a function that aborts it                                  | return the subscription                                                    |
| One-shot listeners     | `{ once: true }`                                                                               | `.once(fn)`                                                                |
| A list of objects      | add a listener to each, and track them yourself                                                | `collect(items)`: one subscription, with each one's index                  |
| Cancelling             | `preventDefault()` on a `cancelable` event; `dispatchEvent` returns `false`                    | none                                                                       |
| Bubbling and capture   | for DOM nodes; a plain object has no parent, so none                                           | none                                                                       |
| A listener throws      | the error is reported, and the other listeners still run                                        | the error propagates out of `fire()`, and later listeners don't run        |
| Go to definition       | not for your own events                                                                        | from any handle or listener, to the event map                              |
| Cost                   | built in; works with anything that accepts an `EventTarget`                                    | a small library to install                                                 |

### Our honest take

`EventTarget` is a good, standard tool, and for some jobs it is the better one:

- **You need a listener to say no.** A `cancelable` event lets any listener veto ("don't close yet") and the dispatcher finds out from `dispatchEvent`. vents has no equivalent.
- **Listeners shouldn't affect each other.** `EventTarget` reports a listener's error and keeps going. In vents a throwing listener stops the dispatch, which is easier to debug but less forgiving.
- **The events leave your code.** Other libraries, web components, and anything that already speaks `addEventListener` work with an `EventTarget` and won't know about vents.
- **You'd rather not add a dependency**, and a few casts don't bother you.

vents is preferable when the events are part of your app's own model, written in TypeScript:

- **Both ends are typed, without extra work.** With `EventTarget`, the event name is a string and the payload a cast. Making them typed means writing your own overloads of `addEventListener`. vents gets both from one interface, and renaming an event in it is a normal rename.
- **Cleanup takes one line.** A subscription is its own cleanup, so a Svelte `$effect` returns it. With `EventTarget`, every effect sets up an `AbortController` or keeps the listener function around.
- **Several arguments, and the model itself.** `moved(from, to, playlist)` instead of `event.detail.from`, `event.detail.to` and an `event.currentTarget` that needs a cast.
- **Lists of models.** `collect` covers an array with one subscription and gives each listener the current index. With `EventTarget` you write and maintain that bookkeeping yourself.

One weakness they share: a listener added outside an effect, on an object that outlives the component, stays until you remove it, whichever API added it.

In short: reach for `EventTarget` when you need cancelling, error isolation between listeners, or interop with code that expects the DOM API. Reach for vents when the events belong to your own models and you want the type checker on both ends.

## Things to know

- **`call`, `apply` and `bind` aren't event names on a subscription.** A
  subscription is a function, and frameworks call cleanup functions through
  these methods (Svelte runs `teardown.call(null)`). On `events` itself, an
  event can still use any of these names.
- **Changes during dispatch wait for the next fire.** A listener added while an
  event is firing isn't called until the next fire. A listener can unsubscribe
  itself while being called, and the remaining listeners still run.
- **A listener that throws stops the dispatch.** The error comes out of `fire()`, and listeners after it don't run. Catch inside a listener if others must still hear the event.
- **`clear()` drops the model's own listeners too.** To remove just yours,
  call your subscription.
- **A model removed from the array during a collection-wide `fire`, before its
  turn, still fires.** Its index is then `-1`. Listeners that use the index to
  splice should only remove the model that fired, as in the examples above.

## API

| Export                                                                  | What it is                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `createEvents<E>()`                                                     | a standalone bus for event map `E`                                           |
| `createEvents<E, Target>(target)`                                       | a model's bus: listeners also receive `target`                               |
| `WithEvents<E>`                                                         | base class with `readonly events`, where the target is the subclass instance |
| `collect(members)`                                                      | handles that cover every member; listeners also receive the index            |
| `Events<E, Target?>`                                                    | the type of a bus                                                            |
| `Subscription<E, Target?>`                                              | the type a subscription has                                                  |
| `Collection<T>`                                                         | the type `collect` returns for members of type `T`                           |
| `Handle`, `SubscribedHandle`, `Subscribed`, `EventMapOf`, `Collectible` | the types the others are built from                                          |

## Tests

The tests sit next to the code they test, as
[suede.nests](https://github.com/pmalacho-mit/suede.nests) namespace tests:
`declare namespace` blocks at the bottom of `events.ts`, `collect.ts` and
`WithEvents.ts`. Callback-based scenarios live in `_internal/harness.ts`. Vitest
runs the tests through the nests Vite plugin; they are types only, so your
build drops them along with the rest of the types.
