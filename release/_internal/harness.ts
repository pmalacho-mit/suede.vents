/**
 * Values the namespace tests in `../events.ts` can't spell as types: models,
 * listeners that record what they hear, and scenarios that need callbacks.
 * Imported there only as types, so nothing here reaches a consumer's build.
 */
import { createEvents } from "../events.ts";
import { WithEvents } from "../WithEvents.ts";
import { collect } from "../collect.ts";

export interface PointEvents {
  moved: [x: number, y: number];
  renamed: [name: string, previous: string];
  reset: [];
}

/** A standalone bus: no target appended. */
export const bus = () => createEvents<PointEvents>();

/** Composition: a model that owns its events and listens to itself first. */
export class Point {
  readonly events = createEvents<PointEvents, Point>(this);
  name = "origin";
  x = 0;
  y = 0;

  constructor() {
    this.events.moved((x, y) => ((this.x = x), (this.y = y)));
    this.events.renamed((name) => (this.name = name));
  }
}

/** Inheritance: the same model, extending `WithEvents`. */
export class Sprite extends WithEvents<PointEvents> {
  x = 0;
  y = 0;

  constructor() {
    super();
    this.events.moved((x, y) => ((this.x = x), (this.y = y)));
  }
}

/** A listener that keeps every argument list it is called with. */
export const recorder = () => {
  const calls: unknown[][] = [];
  return { calls, listener: (...args: unknown[]) => void calls.push(args) };
};

export interface ChildEvents {
  "request removal": [];
  announce: [text: string];
}

export class Child extends WithEvents<ChildEvents> {
  constructor(readonly id: number) {
    super();
  }
}

export const children = (ids: number[]) => ids.map((id) => new Child(id));

export const idsOf = (members: Child[]) => members.map((member) => member.id);

/** A collection whose removal listener splices the member that asked out of the array. */
export const selfRemoving = (members: Child[]) => {
  const collection = collect(members);
  collection["request removal"]((_target, index) => members.splice(index, 1));
  return collection;
};

/** A listener that subscribes another listener while the event is dispatching. */
export const subscribingDuringDispatch = () => {
  const events = bus();
  const heard: string[] = [];
  events.reset(() => {
    heard.push("outer");
    events.reset(() => heard.push("inner"));
  });
  events.reset.fire();
  return heard;
};

/** A listener that unsubscribes itself while the event is dispatching. */
export const unsubscribingDuringDispatch = () => {
  const events = bus();
  const heard: string[] = [];
  const unsubscribe = events.reset(() => (heard.push("self"), unsubscribe()));
  events.reset(() => heard.push("next"));
  events.reset.fire();
  events.reset.fire();
  return heard;
};

/** How a framework runs a teardown: Svelte's `$effect` calls `teardown.call(null)`. */
export const tornDownThrough = (how: "call" | "apply" | "bind") => {
  const events = bus();
  const subscription = events.moved(() => {});
  if (how === "call") subscription.call(null);
  else if (how === "apply") subscription.apply(null, []);
  else subscription.bind(null)();
  return events.moved.listenerCount;
};

/** Assigning over a handle, which should throw. */
export const reassignHandle = () => {
  (bus() as any).moved = () => {};
};

/** A collection over targetless buses: listeners get the payload and the index only. */
export const busCollection = () => {
  const buses = [{ events: bus() }, { events: bus() }];
  const { calls, listener } = recorder();
  collect(buses).renamed(listener);
  buses[1].events.renamed.fire("b", "a");
  return calls;
};
