/**
 * Parsing page selections like "1-3, 7, 12-".
 *
 * Pure, and worth its own file because this is the part users get wrong and the
 * part that must never silently do the wrong thing. Deleting the wrong pages
 * from a contract is not recoverable by pressing undo — the original is still
 * on disk, but the person has already sent the broken one.
 *
 * Everything here is 1-indexed, because that is what the input means and what
 * every PDF reader shows. Conversion to 0-indexed happens once, at the edge.
 */

export interface RangeResult {
  /**
   * 1-indexed page numbers, in the order they were asked for, with duplicates
   * removed. The order is meaningful: `3,1` produces a document whose first
   * page is page 3.
   */
  pages: number[];
  /** Why the input could not be used, if it could not. */
  error?: string;
}

/**
 * Parse a selection against a document of `total` pages.
 *
 * Accepts: `3`, `1-5`, `2,4,6`, `5-` (five to the end), `-3` (start to three),
 * and any combination separated by commas or whitespace. `all` selects
 * everything.
 *
 * Out-of-range numbers are an error rather than being silently clamped. Someone
 * typing `1-50` on a 10-page document has misunderstood something, and quietly
 * giving them pages 1-10 hides that.
 */
export function parsePageRange(input: string, total: number): RangeResult {
  if (total < 1) return { pages: [], error: 'That document has no pages.' };

  const text = input.trim().toLowerCase();
  if (text === '' || text === 'all') {
    return { pages: Array.from({ length: total }, (_, index) => index + 1) };
  }

  const pages = new Set<number>();

  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const range = /^(\d*)-(\d*)$/.exec(part);

    if (range) {
      const [, rawFrom, rawTo] = range;
      // "5-" means five to the end; "-3" means the start through three.
      const from = rawFrom === '' ? 1 : Number(rawFrom);
      const to = rawTo === '' ? total : Number(rawTo);

      if (rawFrom === '' && rawTo === '') {
        return { pages: [], error: `"${part}" does not say which pages.` };
      }
      if (!Number.isInteger(from) || !Number.isInteger(to)) {
        return { pages: [], error: `"${part}" is not a page range.` };
      }
      if (from < 1 || to < 1) {
        return { pages: [], error: 'Pages start at 1.' };
      }
      if (from > total || to > total) {
        return {
          pages: [],
          error: `This document has ${total} page${total === 1 ? '' : 's'}, so "${part}" is out of range.`,
        };
      }
      if (from > to) {
        return { pages: [], error: `"${part}" runs backwards.` };
      }

      for (let page = from; page <= to; page++) pages.add(page);
      continue;
    }

    const single = Number(part);
    if (!Number.isInteger(single)) {
      return { pages: [], error: `"${part}" is not a page number.` };
    }
    if (single < 1) return { pages: [], error: 'Pages start at 1.' };
    if (single > total) {
      return {
        pages: [],
        error: `This document has ${total} page${total === 1 ? '' : 's'}, so page ${single} does not exist.`,
      };
    }

    pages.add(single);
  }

  if (pages.size === 0) return { pages: [], error: 'No pages selected.' };

  /*
   * Deliberately not sorted.
   *
   * "Keep pages" is advertised as reordering as well as selecting, and
   * `extractPages` has always honoured the order it is given — but sorting here
   * threw that information away before it ever got there, so entering `3,1`
   * quietly produced pages 1 and 3 in the original order. A Set preserves
   * insertion order, so duplicates keep their first position.
   */
  return { pages: [...pages] };
}

/**
 * The inverse of a selection — used by "remove these pages".
 *
 * Kept separate from the parser so the dangerous operation is expressed as
 * exactly what it is, rather than a flag threaded through the parse.
 */
export function invertSelection(pages: readonly number[], total: number): number[] {
  const selected = new Set(pages);
  const rest: number[] = [];
  for (let page = 1; page <= total; page++) {
    if (!selected.has(page)) rest.push(page);
  }
  return rest;
}

/** "1-3, 7, 12-14" — the shortest honest description of a selection. */
export function describeSelection(pages: readonly number[]): string {
  if (pages.length === 0) return 'nothing';

  // Runs are collapsed in the order given rather than sorted first, so a
  // reordered selection is described as what it is: `3,1` reads "3, 1", not
  // "1, 3". Telling someone their selection is something other than what they
  // typed is how the reordering bug stayed invisible.
  const unique = [...new Set(pages)];
  const parts: string[] = [];

  let start = unique[0];
  let previous = unique[0];

  for (const page of unique.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  parts.push(start === previous ? `${start}` : `${start}-${previous}`);

  return parts.join(', ');
}
