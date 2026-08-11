/**
 * The work queue.
 */

import type { PhotoMetadata } from './metadata';
import type { ProcessResult } from './pipeline';

export type ItemStatus = 'queued' | 'working' | 'done' | 'failed';

export interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  /** Object URL for the thumbnail. Must be revoked when the item goes. */
  previewUrl?: string;
  /** Object URL for the converted blob. Must be revoked when the item goes. */
  downloadUrl?: string;
  metadata?: PhotoMetadata;
  result?: ProcessResult;
  error?: string;
}

/**
 * How many images to decode at once.
 *
 * Each in-flight image holds its full decoded bitmap in memory — a 12-megapixel
 * photo is roughly 48 MB as raw pixels, so a batch of a hundred processed in
 * parallel would ask for several gigabytes and take the tab with it. Four keeps
 * every core busy on a laptop while staying survivable on a phone.
 */
export const CONCURRENCY = 4;

/**
 * Run an async job over a list, a few at a time, in order.
 *
 * Results come back in input order regardless of which finished first, because
 * a queue that reorders itself as it completes is unreadable.
 *
 * Never rejects: one bad file out of two hundred must not abandon the rest, so
 * failures are captured per item and reported alongside the successes.
 */
export async function mapWithConcurrency<In, Out>(
  items: readonly In[],
  limit: number,
  job: (item: In, index: number) => Promise<Out>,
): Promise<Array<{ ok: true; value: Out } | { ok: false; error: unknown }>> {
  if (limit < 1) throw new RangeError('Concurrency limit must be at least 1');

  const results = new Array<{ ok: true; value: Out } | { ok: false; error: unknown }>(
    items.length,
  );
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await job(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

/** A stable id for a queue item. */
export function itemId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

/**
 * Release the object URLs an item is holding.
 *
 * Object URLs pin their blob in memory until revoked. Skipping this on a large
 * batch leaks the entire converted set, which on a phone is the difference
 * between a working tab and a dead one.
 */
export function releaseItem(item: QueueItem): void {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
}

/** Human-readable summary of a finished batch. */
export function summarise(items: readonly QueueItem[]): {
  done: number;
  failed: number;
  savedBytes: number;
} {
  let done = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const item of items) {
    if (item.status === 'failed') failed++;
    if (item.status === 'done' && item.result) {
      done++;
      savedBytes += item.result.originalBytes - item.result.outputBytes;
    }
  }

  return { done, failed, savedBytes };
}
