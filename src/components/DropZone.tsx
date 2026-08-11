import { useCallback, useRef, useState } from 'react';

import { isAcceptedFile } from '../lib/naming';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  busy: boolean;
  /**
   * Shrink once there is a queue.
   *
   * Full height it is the entire empty state and the obvious thing to do. With
   * files loaded it becomes a secondary action, and keeping it enormous pushes
   * the actual results below the fold.
   */
  compact?: boolean;
}

/**
 * The drop target, which is also the empty state and the primary control.
 *
 * Clicking anywhere opens a file picker, because a drop zone that only accepts
 * drops excludes every phone. The whole surface is the button.
 */
export function DropZone({ onFiles, busy, compact = false }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire on every child element, so a boolean flickers as the
  // pointer crosses inner nodes. Counting enters and leaves is the fix.
  const depth = useRef(0);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter(isAcceptedFile);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        accept(event.dataTransfer.files);
      }}
      className={`relative rounded-2xl border-2 border-dashed transition-colors ${
        dragging ? 'border-amber bg-amber-wash' : 'border-line-strong bg-surface hover:border-ink-faint'
      }`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex w-full cursor-pointer items-center justify-center text-center disabled:cursor-wait ${
          compact ? 'gap-2.5 px-6 py-5' : 'flex-col gap-3 px-6 py-16'
        }`}
      >
        <span
          aria-hidden
          className={`readout transition-colors ${compact ? 'text-lg' : 'text-3xl'} ${
            dragging ? 'text-amber' : 'text-ink-faint'
          }`}
        >
          [ + ]
        </span>
        <span className={compact ? 'text-sm text-ink-muted' : 'text-lg font-medium'}>
          {dragging ? 'Drop them here' : compact ? 'Add more' : 'Choose photos, or drop them here'}
        </span>
        {!compact && (
          <span className="max-w-sm text-sm text-ink-muted">
            Images or PDFs. Nothing is uploaded — the work happens on this device.
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif,application/pdf,.pdf"
        onChange={(event) => {
          accept(event.target.files);
          // Reset, or picking the same file twice in a row does nothing.
          event.target.value = '';
        }}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
