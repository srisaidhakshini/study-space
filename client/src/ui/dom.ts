export type Child = Node | string | number | null | undefined | false;

type Listeners = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface Props {
  class?: string;
  /** Plain attributes such as type, title, aria-label, min, max. */
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Listeners;
}

/** Creates an element: h('button', { class: 'btn', on: { click } }, 'Save'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    el.addEventListener(type, listener as EventListener);
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces everything inside an element. */
export function setChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

/**
 * A button that gives focus back after a mouse click, so keys like Space keep
 * going to the game instead of pressing the button again.
 */
export function button(label: Child, className: string, onClick: () => void, attrs: Props['attrs'] = {}): HTMLButtonElement {
  const el = h('button', { class: className, attrs: { type: 'button', ...attrs } }, label);
  el.addEventListener('click', (event) => {
    if (event.detail > 0) el.blur();
    onClick();
  });
  return el;
}
