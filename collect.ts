import {
  createHandles,
  type eventMap,
  type Handle,
  type TargetTail,
} from "./events";
import type {
  Call,
  Expect,
  Given,
  Invoke,
} from "../suede.nests.vents/dsl.import.meta.vitest.ts";
import type {
  busCollection,
  children,
  idsOf,
  recorder,
  selfRemoving,
} from "./_internal/harness.ts";

/** Anything holding an `events` object built by `createEvents`. */
export type Collectible = {
  readonly events: { readonly [eventMap]?: [any, any] };
};

type MapOf<T extends Collectible> = NonNullable<
  T["events"][typeof eventMap]
>[0];
type TargetOf<T extends Collectible> = NonNullable<
  T["events"][typeof eventMap]
>[1];

/** Every event of `T`, fanned out across the members. Listeners also receive the index. */
export type Collection<T extends Collectible> = {
  readonly [K in keyof MapOf<T>]: Handle<
    MapOf<T>,
    K,
    [...TargetTail<TargetOf<T>>, index: number]
  >;
};

/**
 * Fans one subscription out across every member of an array. Listeners receive
 * the member's own arguments plus its index.
 *
 * The index is resolved at dispatch time, not at subscribe time, so a listener
 * that mutates the array (splicing out the member that fired, say) doesn't
 * leave the remaining members holding stale indices.
 */

export const collect = <T extends Collectible>(
  members: readonly T[],
): Collection<T> => {
  const eventsOf = (member: T) => (member as any).events;

  return createHandles({
    bind(key, listener) {
      const subscriptions = members.map((member) =>
        eventsOf(member)[key]((...args: unknown[]) =>
          listener(...args, members.indexOf(member)),
        ),
      );
      return () => {
        for (const unsubscribe of subscriptions) unsubscribe();
      };
    },
    fire(key, payload) {
      // Snapshot: a listener may remove members from the array mid-dispatch.
      for (const member of [...members]) eventsOf(member)[key].fire(...payload);
    },
    count: (key) =>
      members.reduce(
        (total, member) => total + eventsOf(member)[key].listenerCount,
        0,
      ),
    clear: (key) => {
      for (const member of members) eventsOf(member)[key].clear();
    },
  }) as Collection<T>;
};

declare namespace collect {
  type Members = Invoke<typeof children, [ids: [0, 1, 2]]>;
  type Collection = Invoke<typeof collect<Members[number]>, [members: Members]>;
  type Heard = Invoke<typeof recorder>;

  /** one subscription hears every member, with the member and its index */
  export type FansOut = Given<
    [
      Invoke<Collection["announce"], [listener: Heard["listener"]]>,
      Call<Members[2]["events"]["announce"], "fire", [text: "hi"]>,
      Call<Members[0]["events"]["announce"], "fire", [text: "yo"]>,
    ],
    Expect<Heard["calls"], "=", [["hi", Members[2], 2], ["yo", Members[0], 0]]>
  >;

  /** firing on a collection fires on every member */
  export type FiresOnEvery = Given<
    [
      Invoke<Collection["announce"], [listener: Heard["listener"]]>,
      Call<Collection["announce"], "fire", [text: "all"]>,
    ],
    Expect<
      Heard["calls"],
      "=",
      [["all", Members[0], 0], ["all", Members[1], 1], ["all", Members[2], 2]]
    >
  >;

  type Subscription = Invoke<
    Collection["announce"],
    [listener: Heard["listener"]]
  >;

  /** a collection's subscription drops its listener from every member */
  export type Unsubscribes = Given<
    [
      Invoke<Subscription>,
      Call<Collection["announce"], "fire", [text: "ignored"]>,
    ],
    [
      Expect<Heard["calls"], "isEmpty">,
      Expect<Collection["announce"]["listenerCount"], "=", 0>,
    ]
  >;

  /** `once` hears whichever member fires first, then drops them all */
  export type Once = Given<
    [
      Call<
        Collection["request removal"],
        "once",
        [listener: Heard["listener"]]
      >,
      Call<Members[1]["events"]["request removal"], "fire">,
      Call<Members[0]["events"]["request removal"], "fire">,
    ],
    [
      Expect<Heard["calls"], "=", [[Members[1], 1]]>,
      Expect<Collection["request removal"]["listenerCount"], "=", 0>,
    ]
  >;

  /** the listener count is summed across members */
  export type SumsCounts = Given<
    [
      Invoke<Members[0]["events"]["announce"], [listener: Heard["listener"]]>,
      Invoke<Collection["announce"], [listener: Heard["listener"]]>,
    ],
    Expect<Collection["announce"]["listenerCount"], "=", 4>
  >;

  /** `clear` clears the event on every member */
  export type Clears = Given<
    [
      Invoke<Collection["announce"], [listener: Heard["listener"]]>,
      Call<Collection["announce"], "clear">,
    ],
    Expect<Members[1]["events"]["announce"]["listenerCount"], "=", 0>
  >;

  type Removing = Invoke<typeof selfRemoving, [members: Members]>;

  /** indices resolve at dispatch time, so a member can be spliced out mid-dispatch */
  export type SpliceOne = Given<
    [Removing, Call<Members[1]["events"]["request removal"], "fire">],
    Expect<Invoke<typeof idsOf, [members: Members]>, "=", [0, 2]>
  >;

  /** ...even when every member asks to be removed in the same fire */
  export type SpliceAll = Given<
    Call<Removing["request removal"], "fire">,
    Expect<Members, "isEmpty">
  >;

  /** members without a target get the payload and the index only */
  export type Targetless = Expect<
    Invoke<typeof busCollection>,
    "=",
    [["b", "a", 1]]
  >;
}
