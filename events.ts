import type {
  Call,
  Construct,
  Expect,
  Given,
  Invoke,
  Throws,
} from "../suede.nests.vents/dsl.import.meta.vitest.ts";
import type {
  bus,
  busCollection,
  children,
  idsOf,
  Point,
  reassignHandle,
  recorder,
  selfRemoving,
  subscribingDuringDispatch,
  tornDownThrough,
  unsubscribingDuringDispatch,
} from "./_internal/harness.ts";

/**
 * An event map is an interface (or type alias) whose keys are event names and
 * whose values are the payload tuples for that event.
 *
 * The self-referential constraint (`E extends EventMapOf<E>`) is deliberate:
 * `E extends Record<string, unknown[]>` would reject `interface`s, since
 * interfaces don't get implicit index signatures.
 */
export type EventMapOf<E> = { [K in keyof E]: unknown[] };

type PayloadOf<E, K extends keyof E> = Extract<E[K], unknown[]>;

/** Extra arguments appended after the payload. `[]`, `[target]`, or `[target, index]`. */
type Tail = unknown[];

export type TargetTail<Target> = [Target] extends [void]
  ? []
  : [target: Target];

/** A single event: subscribe, or dispatch. Shared by models and collections. */
export interface Handle<E, K extends keyof E, T extends Tail> {
  (listener: (...args: [...PayloadOf<E, K>, ...T]) => void): Subscribed<E, T>;
  once(
    listener: (...args: [...PayloadOf<E, K>, ...T]) => void,
  ): Subscribed<E, T>;
  fire(...payload: PayloadOf<E, K>): void;
  /** Drops every listener for this event, including the model's own. */
  clear(): void;
  readonly listenerCount: number;
}

/** The same event reached through a chain: add another listener, or drop this chain's. */
export interface SubscribedHandle<E, K extends keyof E, T extends Tail> {
  (listener: (...args: [...PayloadOf<E, K>, ...T]) => void): Subscribed<E, T>;
  (): Subscribed<E, T>;
  once(
    listener: (...args: [...PayloadOf<E, K>, ...T]) => void,
  ): Subscribed<E, T>;
}

/**
 * Callable (unsubscribes everything in the chain) and indexable by event name
 * (adds another listener, or unsubscribes just that event).
 */
export type Subscribed<E, T extends Tail> = (() => void) & {
  readonly [K in keyof E]: SubscribedHandle<E, K, T>;
};

/** Type-only marker carrying the event map and target through to `collect`. */
export declare const eventMap: unique symbol;

/**
 * Homomorphic mapped type over `E`. This is the part that makes
 * "go to definition" / "find all references" work: TypeScript keeps a link
 * from each mapped property back to the declaration in `E`.
 */
export type EventHandles<E, Target, T extends Tail> = {
  readonly [K in keyof E]: Handle<E, K, T>;
} & { readonly [eventMap]?: [map: E, target: Target] };

export type Events<E extends EventMapOf<E>, Target = void> = EventHandles<
  E,
  Target,
  TargetTail<Target>
>;

export type Subscription<E extends EventMapOf<E>, Target = void> = Subscribed<
  E,
  TargetTail<Target>
>;

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------

type AnyListener = (...args: any[]) => void;

/**
 * Where listeners live. One implementation over a local Map (a model), one
 * that fans out across members (a collection); everything else is shared.
 */
interface Source {
  bind(key: string, listener: AnyListener): () => void;
  fire(key: string, payload: unknown[]): void;
  count(key: string): number;
  clear(key: string): void;
}

/**
 * A subscription chain is a function, and callers invoke teardowns through
 * these (Svelte runs `$effect` cleanup as `teardown.call(null)`), so on a
 * chain they can't be event names.
 */
const invokers = new Set<string | symbol>(["call", "apply", "bind"]);

/**
 * Lazily builds and caches one handle per event name. Symbols read through,
 * as do a function base's invokers.
 */
const handles = <T extends object>(
  create: (key: string) => unknown,
  base: T,
) => {
  const cache = new Map<string, unknown>();
  const callable = typeof base === "function";
  return new Proxy(base, {
    get(target, key, receiver) {
      if (typeof key === "symbol" || (callable && invokers.has(key)))
        return Reflect.get(target, key, receiver);
      let handle = cache.get(key);
      if (!handle) cache.set(key, (handle = create(key)));
      return handle;
    },
    set: () => false,
  });
};

const createChain = (source: Source): any => {
  const owned = new Map<string, (() => void)[]>();

  const off = (key: string) => {
    const unbinds = owned.get(key);
    if (!unbinds) return;
    owned.delete(key);
    for (const unbind of unbinds) unbind();
  };

  const on = (key: string, listener: AnyListener) => {
    const unbind = source.bind(key, listener);
    owned.get(key)?.push(unbind) ?? owned.set(key, [unbind]);
    return unbind;
  };

  const chain: any = handles(
    (key) => {
      const handle = (listener?: AnyListener) => (
        listener ? on(key, listener) : off(key),
        chain
      );
      handle.once = (listener: AnyListener) => {
        let unbind!: () => void;
        unbind = on(key, (...args: unknown[]) => (unbind(), listener(...args)));
        return chain;
      };
      return handle;
    },
    () => {
      for (const key of [...owned.keys()]) off(key);
    },
  );

  return chain;
};

export const createHandles = (source: Source) =>
  handles((key) => {
    const handle = (listener: AnyListener) =>
      createChain(source)[key](listener);
    handle.once = (listener: AnyListener) =>
      createChain(source)[key].once(listener);
    handle.fire = (...payload: unknown[]) => source.fire(key, payload);
    handle.clear = () => source.clear(key);
    Object.defineProperty(handle, "listenerCount", {
      get: () => source.count(key),
    });
    return handle;
  }, Object.create(null));

export function createEvents<E extends EventMapOf<E>>(): Events<E>;
export function createEvents<E extends EventMapOf<E>, Target>(
  target: Target,
): Events<E, Target>;
export function createEvents<E extends EventMapOf<E>, Target>(
  ...args: [] | [Target]
): Events<E, Target> {
  const store = new Map<string, Set<AnyListener>>();
  const hasTarget = args.length > 0;
  const target = args[0];

  return createHandles({
    bind(key, listener) {
      const listeners = store.get(key);
      if (listeners) listeners.add(listener);
      else store.set(key, new Set([listener]));

      return () => {
        const current = store.get(key);
        if (current?.delete(listener) && current.size === 0) store.delete(key);
      };
    },
    fire(key, payload) {
      const listeners = store.get(key);
      if (!listeners) return;
      const full = hasTarget ? [...payload, target] : payload;
      // Snapshot: listeners may subscribe or unsubscribe during dispatch.
      for (const listener of [...listeners]) listener(...full);
    },
    count: (key) => store.get(key)?.size ?? 0,
    clear: (key) => void store.delete(key),
  }) as Events<E, Target>;
}

declare namespace createEvents {
  type Bus = Invoke<typeof bus>;
  type Model = Construct<typeof Point>;
  type Heard = Invoke<typeof recorder>;
  type Other = Invoke<typeof recorder>;

  /** a standalone bus hands listeners the payload, and nothing after it */
  export type PayloadOnly = Given<
    [
      Invoke<Bus["moved"], [listener: Heard["listener"]]>,
      Call<Bus["moved"], "fire", [x: 1, y: 2]>,
    ],
    Expect<Heard["calls"], "=", [[1, 2]]>
  >;

  /** a model's bus appends the model after the payload */
  export type AppendsTarget = Given<
    [
      Invoke<Model["events"]["renamed"], [listener: Heard["listener"]]>,
      Call<Model["events"]["renamed"], "fire", [name: "b", previous: "a"]>,
    ],
    Expect<Heard["calls"], "=", [["b", "a", Model]]>
  >;

  /** listeners run in the order they subscribed, so the model's own state settles first */
  export type ModelSettlesFirst = Given<
    Call<Model["events"]["moved"], "fire", [x: 3, y: 4]>,
    [Expect<Model["x"], "=", 3>, Expect<Model["y"], "=", 4>]
  >;

  /** firing an event nobody listens to does nothing */
  export type NoListeners = Expect<Call<Bus["reset"], "fire">, "=", undefined>;

  /** the listener count includes the model's own listener */
  export type CountsOwnListener = Expect<
    Model["events"]["moved"]["listenerCount"],
    "=",
    1
  >;

  /** a handle is created once and handed back every time */
  export type StableHandles = Expect<Bus["moved"], "is", Bus["moved"]>;

  /** handles can't be assigned over */
  export type ReadOnly = Throws<Invoke<typeof reassignHandle>, TypeError>;

  /** a listener subscribed during dispatch waits for the next fire */
  export type SubscribeDuringDispatch = Expect<
    Invoke<typeof subscribingDuringDispatch>,
    "=",
    ["outer"]
  >;

  /** a listener can unsubscribe itself mid-dispatch without skipping the next one */
  export type UnsubscribeDuringDispatch = Expect<
    Invoke<typeof unsubscribingDuringDispatch>,
    "=",
    ["self", "next", "next"]
  >;

  /** `clear` drops every listener of one event, the model's own included */
  export type Clear = Given<
    Call<Model["events"]["moved"], "clear">,
    [
      Expect<Model["events"]["moved"]["listenerCount"], "=", 0>,
      Expect<Model["events"]["renamed"]["listenerCount"], "=", 1>,
    ]
  >;

  type Chain = Invoke<
    Invoke<Bus["moved"], [listener: Heard["listener"]]>["reset"],
    [listener: Heard["listener"]]
  >;

  /** a subscription chains on to other events, and calling it drops them all */
  export type ChainUnsubscribesAll = Given<
    [
      Invoke<Chain>,
      Call<Bus["moved"], "fire", [x: 1, y: 1]>,
      Call<Bus["reset"], "fire">,
    ],
    [
      Expect<Heard["calls"], "isEmpty">,
      Expect<Bus["moved"]["listenerCount"], "=", 0>,
      Expect<Bus["reset"]["listenerCount"], "=", 0>,
    ]
  >;

  /** calling one event of a chain with no listener drops just that event */
  export type ChainUnsubscribesOne = Given<
    [
      Invoke<Chain["moved"]>,
      Call<Bus["moved"], "fire", [x: 1, y: 1]>,
      Call<Bus["reset"], "fire">,
    ],
    Expect<Heard["calls"], "=", [[]]>
  >;

  type Mine = Invoke<Bus["reset"], [listener: Heard["listener"]]>;

  /** a subscription only drops its own listeners */
  export type OnlyOwnListeners = Given<
    [
      Invoke<Bus["reset"], [listener: Other["listener"]]>,
      Invoke<Mine>,
      Call<Bus["reset"], "fire">,
    ],
    [Expect<Heard["calls"], "isEmpty">, Expect<Other["calls"], "=", [[]]>]
  >;

  /** a subscription is safe to call twice */
  export type UnsubscribeTwice = Given<
    [Invoke<Mine>, Invoke<Mine>],
    Expect<Bus["reset"]["listenerCount"], "=", 0>
  >;

  /** a subscription tears down however a framework invokes it (Svelte uses `.call`) */
  export type FrameworkTeardown = [
    Expect<Invoke<typeof tornDownThrough, [how: "call"]>, "=", 0>,
    Expect<Invoke<typeof tornDownThrough, [how: "apply"]>, "=", 0>,
    Expect<Invoke<typeof tornDownThrough, [how: "bind"]>, "=", 0>,
  ];

  /** `once` hears one fire, then drops itself */
  export type Once = Given<
    [
      Call<Bus["moved"], "once", [listener: Heard["listener"]]>,
      Call<Bus["moved"], "fire", [x: 1, y: 0]>,
      Call<Bus["moved"], "fire", [x: 2, y: 0]>,
    ],
    [
      Expect<Heard["calls"], "=", [[1, 0]]>,
      Expect<Bus["moved"]["listenerCount"], "=", 0>,
    ]
  >;

  type Pending = Call<Bus["moved"], "once", [listener: Heard["listener"]]>;

  /** a pending `once` can be cancelled before it fires */
  export type OnceCancelled = Given<
    [Invoke<Pending>, Call<Bus["moved"], "fire", [x: 1, y: 0]>],
    Expect<Heard["calls"], "isEmpty">
  >;
}
