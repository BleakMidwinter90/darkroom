import { describe, expect, it } from 'vitest';

import { describeSelection, invertSelection, parsePageRange } from '../src/lib/pageRange';

describe('parsePageRange', () => {
  it('reads a single page', () => {
    expect(parsePageRange('3', 10).pages).toEqual([3]);
  });

  it('reads a range', () => {
    expect(parsePageRange('2-5', 10).pages).toEqual([2, 3, 4, 5]);
  });

  it('reads a mixed list', () => {
    expect(parsePageRange('1-3, 7, 9-10', 10).pages).toEqual([1, 2, 3, 7, 9, 10]);
  });

  it('accepts spaces as separators too', () => {
    expect(parsePageRange('1 2   5', 10).pages).toEqual([1, 2, 5]);
  });

  it('treats an open end as "to the end"', () => {
    expect(parsePageRange('8-', 10).pages).toEqual([8, 9, 10]);
  });

  it('treats an open start as "from the beginning"', () => {
    expect(parsePageRange('-3', 10).pages).toEqual([1, 2, 3]);
  });

  it('selects everything for empty input or "all"', () => {
    expect(parsePageRange('', 3).pages).toEqual([1, 2, 3]);
    expect(parsePageRange('all', 3).pages).toEqual([1, 2, 3]);
    expect(parsePageRange('  ALL  ', 3).pages).toEqual([1, 2, 3]);
  });

  it('sorts and deduplicates', () => {
    expect(parsePageRange('5,1,5,2-3,1', 10).pages).toEqual([1, 2, 3, 5]);
  });
});

describe('parsePageRange — refusing rather than guessing', () => {
  it('rejects a page beyond the document instead of clamping', () => {
    // Someone typing 1-50 on a 10-page file has misunderstood something.
    // Quietly handing back 1-10 hides that from them.
    const result = parsePageRange('1-50', 10);
    expect(result.pages).toEqual([]);
    expect(result.error).toMatch(/10 pages/);
  });

  it('rejects a single page beyond the document', () => {
    expect(parsePageRange('11', 10).error).toMatch(/does not exist/);
  });

  it('rejects page zero and negatives', () => {
    expect(parsePageRange('0', 10).error).toMatch(/start at 1/);
    expect(parsePageRange('0-3', 10).error).toMatch(/start at 1/);
  });

  it('rejects a backwards range', () => {
    expect(parsePageRange('7-2', 10).error).toMatch(/backwards/);
  });

  it('rejects text that is not a page number', () => {
    expect(parsePageRange('two', 10).error).toMatch(/not a page number/);
    expect(parsePageRange('1-x', 10).error).toMatch(/not a page/);
  });

  it('rejects a bare dash, which says nothing', () => {
    expect(parsePageRange('-', 10).error).toMatch(/does not say which pages/);
  });

  it('handles a document with no pages', () => {
    expect(parsePageRange('1', 0).error).toMatch(/no pages/);
  });

  it('never returns pages alongside an error', () => {
    // A caller that ignores the error must not act on a partial selection.
    for (const input of ['1-50', '0', '7-2', 'two', '-']) {
      const result = parsePageRange(input, 10);
      if (result.error) expect(result.pages).toEqual([]);
    }
  });
});

describe('invertSelection', () => {
  it('returns everything not selected', () => {
    expect(invertSelection([2, 4], 5)).toEqual([1, 3, 5]);
  });

  it('returns nothing when everything is selected', () => {
    expect(invertSelection([1, 2, 3], 3)).toEqual([]);
  });

  it('returns everything when nothing is selected', () => {
    expect(invertSelection([], 3)).toEqual([1, 2, 3]);
  });
});

describe('describeSelection', () => {
  it('collapses runs into ranges', () => {
    expect(describeSelection([1, 2, 3, 7, 12, 13, 14])).toBe('1-3, 7, 12-14');
  });

  it('leaves isolated pages alone', () => {
    expect(describeSelection([1, 3, 5])).toBe('1, 3, 5');
  });

  it('handles a single page and an empty selection', () => {
    expect(describeSelection([4])).toBe('4');
    expect(describeSelection([])).toBe('nothing');
  });

  it('sorts and deduplicates before describing', () => {
    expect(describeSelection([3, 1, 2, 3])).toBe('1-3');
  });

  it('round-trips through the parser', () => {
    const pages = [1, 2, 3, 7, 9, 10];
    const described = describeSelection(pages);
    expect(parsePageRange(described, 10).pages).toEqual(pages);
  });
});
