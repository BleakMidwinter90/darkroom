import { formatBytes, plural } from '../lib/format';
import type { PdfEntry } from './PdfPanel';

/**
 * The documents that have been added, in the order they will be used.
 *
 * They used to be a row of filenames joined by commas, which was fine until
 * merging — where the order is part of the output and there was no way to see
 * it clearly, let alone change it. The only fix for a wrong order was to clear
 * everything and add the files again in sequence.
 *
 * Numbered rather than merely listed, because "which one is second" is the
 * question being asked.
 */
export function DocumentList({
  entries,
  disabled,
  onMove,
  onRemove,
}: {
  entries: PdfEntry[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const ordered = entries.length > 1;

  return (
    <ul className="panel divide-y divide-line">
      {entries.map((entry, index) => (
        <li key={`${entry.file.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
          {ordered && (
            <span aria-hidden className="readout w-5 shrink-0 text-sm text-ink-faint">
              {index + 1}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{entry.file.name}</span>
            <span className="readout mt-0.5 block text-xs text-ink-faint">
              {plural(entry.info.pageCount, 'page')} · {formatBytes(entry.file.size)}
            </span>
          </span>

          {ordered && (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(index, index - 1)}
                disabled={disabled || index === 0}
                aria-label={`Move ${entry.file.name} earlier`}
                className="readout cursor-pointer rounded-md px-2 py-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(index, index + 1)}
                disabled={disabled || index === entries.length - 1}
                aria-label={`Move ${entry.file.name} later`}
                className="readout cursor-pointer rounded-md px-2 py-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remove ${entry.file.name}`}
            className="readout shrink-0 cursor-pointer rounded-md px-2 py-1 text-ink-faint transition-colors hover:bg-raised hover:text-warn disabled:opacity-30"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
