/**
 * Reordering a list.
 *
 * Merging joins documents in the order given, which makes that order part of
 * the output rather than a display detail — and until there was a way to change
 * it, the only way to fix a wrong order was to clear everything and re-add the
 * files in the right sequence.
 */

/**
 * Move the item at `from` to `to`, returning a new array.
 *
 * Out-of-range indices return the list unchanged rather than throwing or
 * wrapping: this is driven by buttons at the ends of a list, so "move the first
 * item up" is a normal thing to ask for and should simply do nothing.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length) return [...items];
  if (to < 0 || to >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
