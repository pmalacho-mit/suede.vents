import { createEvents, type EventMapOf, type EventHandles } from "./events";
import type {
  Construct,
  Invoke,
  Given,
  Call,
  Expect,
} from "../suede.nests.vents/dsl.import.meta.vitest";
import type { Sprite, recorder } from "./_internal/harness";

/**
 * Optional sugar for the inheritance style. `Target` is the polymorphic `this`,
 * so listeners receive the concrete subclass instance.
 *
 * The tail is spelled out as `[target: this]` rather than `TargetTail<this>`:
 * inside the class `this` is still generic, so the conditional would never
 * resolve and listeners subscribed from within the class couldn't be typed.
 */

export class WithEvents<E extends EventMapOf<E>> {
  readonly events: EventHandles<E, this, [target: this]> = createEvents<
    E,
    this
  >(this) as any;
}

export default WithEvents;

declare namespace WithEvents {
  type Model = Construct<typeof Sprite>;
  type Other = Construct<typeof Sprite>;
  type Heard = Invoke<typeof recorder>;

  /** listeners receive the subclass instance as the target */
  export type SubclassTarget = Given<
    [
      Invoke<Model["events"]["moved"], [listener: Heard["listener"]]>,
      Call<Model["events"]["moved"], "fire", [x: 1, y: 2]>,
    ],
    Expect<Heard["calls"], "=", [[1, 2, Model]]>
  >;

  /** a subclass can listen to itself in its constructor */
  export type ListensToItself = Given<
    Call<Model["events"]["moved"], "fire", [x: 5, y: 6]>,
    [Expect<Model["x"], "=", 5>, Expect<Model["y"], "=", 6>]
  >;

  /** each instance has its own listeners */
  export type Independent = Given<
    [
      Invoke<Model["events"]["moved"], [listener: Heard["listener"]]>,
      Call<Other["events"]["moved"], "fire", [x: 1, y: 2]>,
    ],
    [Expect<Heard["calls"], "isEmpty">, Expect<Model["x"], "=", 0>]
  >;
}
