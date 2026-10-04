/**
 * Compile-time claims about the API's types. Nothing here runs: `npm run check`
 * fails if an `@ts-expect-error` stops being an error, or a type changes.
 * (Runtime behaviour is tested in place, as namespace tests in release/events.ts.)
 */
import { expectTypeOf } from "vitest";
import {
  collect,
  createEvents,
  WithEvents,
  type Subscription,
} from "./release/index.ts";
import { Point, type PointEvents } from "./release/_internal/harness.ts";

export function typeErrors() {
  const model = new Point();
  const bus = createEvents<PointEvents>();
  const collection = collect([new Point()]);

  // @ts-expect-error wrong payload type
  model.events.renamed((name: number) => {});
  // @ts-expect-error unknown event
  model.events.nope(() => {});
  // @ts-expect-error wrong arity
  bus.moved.fire(1);
  // @ts-expect-error a listener gets (payload..., target, index), not a number first
  collection.renamed((name: number) => {});
  // @ts-expect-error unknown event on a collection
  collection.nope(() => {});
  // @ts-expect-error payload still checked when firing across a collection
  collection.renamed.fire(42, "a");
}

export function subscriptions() {
  const model = new Point();
  const bus = createEvents<PointEvents>();

  expectTypeOf(bus.moved(() => {})).toEqualTypeOf<Subscription<PointEvents>>();
  expectTypeOf(model.events.moved(() => {})).toEqualTypeOf<
    Subscription<PointEvents, Point>
  >();
  expectTypeOf(model.events.moved(() => {})).toExtend<() => void>();
}

export function subclassListensToItself() {
  // `this` is still generic inside the class; listeners must still be typed.
  class Named extends WithEvents<PointEvents> {
    name = "";
    constructor() {
      super();
      this.events.renamed((name) => (this.name = name));
      this.events.renamed((_name, _previous, target) => {
        const self: this = target;
      });
    }
  }
  return Named;
}
