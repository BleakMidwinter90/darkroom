import { describeSavings, formatBytes, formatDimensions, savingsPercent } from '../lib/format';
import { describeMetadata, hasSensitiveMetadata } from '../lib/metadata';
import type { QueueItem } from '../lib/queue';

/**
 * One image in the queue.
 *
 * Shows what came in, what went out, and — the part people do not expect —
 * what the original was carrying. A photo taken at home has the house
 * coordinates in it, and most people have never been told.
 */
export function FileRow({ item, onRemove }: { item: QueueItem; onRemove: (id: string) => void }) {
  const metadataLine = item.metadata ? describeMetadata(item.metadata) : null;
  const sensitive = item.metadata ? hasSensitiveMetadata(item.metadata) : false;
  const percent = item.result ? savingsPercent(item.result.originalBytes, item.result.outputBytes) : 0;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sunk">
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span aria-hidden className="readout grid size-full place-items-center text-ink-faint">
            ?
          </span>
        )}
        {item.status === 'working' && (
          <span
            aria-hidden
            className="absolute inset-0 overflow-hidden"
          >
            <span className="absolute inset-y-0 w-1/2 animate-[develop_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-amber/35 to-transparent" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm">{item.result?.name ?? item.file.name}</p>

        <p className="readout mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
          <span>{formatBytes(item.file.size)}</span>
          {item.result && (
            <>
              <span aria-hidden>→</span>
              <span className="text-ink-muted">{formatBytes(item.result.outputBytes)}</span>
              <span className={percent > 0 ? 'text-good' : percent < 0 ? 'text-warn' : ''}>
                {describeSavings(item.result.originalBytes, item.result.outputBytes)}
              </span>
            </>
          )}
          {item.result && (
            <span className="text-ink-faint">{formatDimensions(item.result.output)}</span>
          )}
        </p>

        {metadataLine && (
          <p
            className={`mt-1 truncate text-xs ${sensitive ? 'text-amber' : 'text-ink-faint'}`}
            title={`Removed from the copy: ${metadataLine}`}
          >
            {sensitive ? 'Removed ' : 'Removed '}
            {metadataLine}
          </p>
        )}

        {item.error && <p className="mt-1 text-xs text-warn">{item.error}</p>}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {item.status === 'done' && item.result && (
          <a
            href={item.downloadUrl}
            download={item.result.name}
            className="tap inline-flex items-center rounded-lg bg-raised px-3.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Save
          </a>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name}`}
          className="tap cursor-pointer px-2 text-ink-faint transition-colors hover:text-warn"
        >
          ×
        </button>
      </div>
    </li>
  );
}
