// Values the components' test snippets build their models from. Snippets
// import these as types and receive them as values, so none of this reaches
// a build.
import { Model as Todo } from "./TodoItem.svelte";
import { Model as TodoList } from "./TodoList.svelte";

export const newTodo = (text: string) => new Todo(text);

export const newList = (...texts: string[]) => new TodoList(...texts);

/** A listener that keeps a readable line for every argument list it hears. */
export const heard = () => {
  const lines: string[] = [];
  const listener = (...args: unknown[]) =>
    void lines.push(args.map((arg) => (arg instanceof Todo ? `<${arg.text}>` : JSON.stringify(arg))).join(" "));
  return { lines, listener };
};
