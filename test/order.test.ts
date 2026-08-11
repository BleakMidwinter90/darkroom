import { describe, expect, it } from 'vitest';

import { moveItem } from '../src/lib/order';

describe('moveItem', () => {
  it('moves an item later', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item earlier', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('swaps neighbours, which is what the up and down buttons do', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at the ends rather than wrapping', () => {
    // "Move the first item up" is a normal thing for someone to click.
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an index that is not in the list', () => {
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('never mutates the input', () => {
    const input = ['a', 'b', 'c'];
    moveItem(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('keeps every item, whatever the move', () => {
    const input = ['a', 'b', 'c', 'd'];
    for (let from = 0; from < input.length; from++) {
      for (let to = 0; to < input.length; to++) {
        const output = moveItem(input, from, to);
        expect(output).toHaveLength(input.length);
        expect([...output].sort()).toEqual([...input].sort());
      }
    }
  });

  it('handles a single item and an empty list', () => {
    expect(moveItem(['a'], 0, 0)).toEqual(['a']);
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
