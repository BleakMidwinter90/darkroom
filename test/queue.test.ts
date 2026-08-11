import { describe, expect, it } from 'vitest';

import { mapWithConcurrency, summarise, type QueueItem } from '../src/lib/queue';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', () => {
    // The first item is the slowest. A naive implementation that pushes on
    // completion would put it last, and the queue would visibly reshuffle.
    const delays = [30, 5, 1];
    return mapWithConcurrency(delays, 3, async (ms, index) => {
      await wait(ms);
      return index;
    }).then((results) => {
      expect(results.map((r) => (r.ok ? r.value : null))).toEqual([0, 1, 2]);
    });
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await wait(2);
      active--;
      return null;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 6, async (value) => {
      seen.push(value);
      return value;
    });

    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
  });

  it('captures a failure without abandoning the rest', async () => {
    // One corrupt file out of two hundred must not lose the other 199.
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      if (value === 2) throw new Error('bad file');
      return value * 10;
    });

    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[1].ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, value: 30 });
    expect(results[3]).toEqual({ ok: true, value: 40 });
  });

  it('never rejects, however many fail', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async () => {
      throw new Error('all bad');
    });
    expect(results.every((r) => !r.ok)).toBe(true);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('handles a limit larger than the list', async () => {
    const results = await mapWithConcurrency([1, 2], 99, async (v) => v);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([1, 2]);
  });

  it('rejects a nonsensical limit', async () => {
    // The function is async, so the guard surfaces as a rejection rather than
    // a synchronous throw.
    await expect(mapWithConcurrency([1], 0, async (v) => v)).rejects.toThrow(RangeError);
  });
});

describe('summarise', () => {
  const item = (overrides: Partial<QueueItem>): QueueItem =>
    ({
      id: 'x',
      file: new File([], 'x.jpg'),
      status: 'queued',
      ...overrides,
    }) as QueueItem;

  it('counts outcomes and adds up what was saved', () => {
    const items = [
      item({
        status: 'done',
        result: { originalBytes: 1000, outputBytes: 400 } as QueueItem['result'],
      }),
      item({
        status: 'done',
        result: { originalBytes: 2000, outputBytes: 1000 } as QueueItem['result'],
      }),
      item({ status: 'failed' }),
      item({ status: 'queued' }),
    ];

    expect(summarise(items)).toEqual({ done: 2, failed: 1, savedBytes: 1600 });
  });

  it('reports a negative saving when files grew', () => {
    // Converting a photo to PNG genuinely makes it bigger, and the summary
    // should say so rather than clamping to zero.
    const items = [
      item({
        status: 'done',
        result: { originalBytes: 500, outputBytes: 1500 } as QueueItem['result'],
      }),
    ];
    expect(summarise(items).savedBytes).toBe(-1000);
  });

  it('handles an empty queue', () => {
    expect(summarise([])).toEqual({ done: 0, failed: 0, savedBytes: 0 });
  });
});
