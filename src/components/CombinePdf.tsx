import { useState } from 'react';

import { imagesToPdf } from '../lib/pdf';
import { processFile } from '../lib/pipeline';
import type { QueueItem } from '../lib/queue';

type Fit = 'a4' | 'image';

const FITS: Array<{ id: Fit; label: string; hint: string }> = [
  { id: 'a4', label: 'A4 pages', hint: 'centred on a printable page' },
  { id: 'image', label: 'Image size', hint: 'one page exactly the size of each photo' },
];

/**
 * Combine the queued images into a single PDF.
 *
 * This always embeds the *converted* copy, never the file that was dropped.
 * A JPEG straight off a phone still carries its EXIF block — including the
 * coordinates of wherever it was taken — and pdf-lib embeds those bytes
 * verbatim, so using the original would quietly bury the location data inside
 * the PDF instead of removing it. That is precisely the thing this app exists
 * to prevent, and it would be invisible in the result.
 */
export function CombinePdf({
  items,
  disabled,
  onBusy,
  primary = false,
}: {
  items: QueueItem[];
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  /** True when this is the job the user actually came to do. */
  primary?: boolean;
}) {
  const [fit, setFit] = useState<Fit>('a4');
  const [error, setError] = useState<string | null>(null);

  async function combine() {
    setError(null);
    onBusy(true);

    try {
      const images: Array<{ bytes: ArrayBuffer; type: string }> = [];

      for (const item of items) {
        // A finished conversion is already stripped, so reuse it. Anything else
        // goes through the same pipeline now — at full size, since this is the
        // output rather than a preview.
        const done = item.result?.blob;
        const source =
          done && /^image\/(jpeg|png)$/.test(done.type)
            ? done
            : (
                await processFile(item.file, {
                  format: 'jpeg',
                  quality: 0.85,
                  resize: { kind: 'none' },
                })
              ).blob;

        images.push({ bytes: await source.arrayBuffer(), type: source.type });
      }

      const blob = await imagesToPdf(images, fit === 'a4' ? { kind: 'a4' } : { kind: 'image' });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'darkroom.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Those images could not be combined.',
      );
    } finally {
      onBusy(false);
    }
  }

  // Selected options and the action both read as solid amber, which is fine
  // while this is a secondary button and muddy once it is the primary one. When
  // it is the job being done, the choice gets its own labelled row instead.
  if (primary) {
    return (
      <div className="panel divide-y divide-line">
        <fieldset className="p-5">
          <legend className="eyebrow mb-3">Page size</legend>
          <div className="flex flex-wrap gap-1.5">
            {FITS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFit(option.id)}
                aria-pressed={fit === option.id}
                title={option.hint}
                className={`tap cursor-pointer rounded-lg px-4 text-sm transition-colors ${
                  fit === option.id
                    ? 'bg-amber text-on-amber font-semibold'
                    : 'bg-raised text-ink-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-faint">
            {fit === 'a4'
              ? 'Centred on a printable page, which is what a form or receipt usually wants.'
              : 'One page exactly the size of each photo, with no border.'}
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 p-5">
          <button
            type="button"
            onClick={combine}
            disabled={disabled || items.length === 0}
            className="tap inline-flex cursor-pointer items-center rounded-lg bg-amber px-6 font-semibold text-on-amber transition-colors hover:brightness-110 disabled:opacity-40"
          >
            Combine into PDF
          </button>
          {error && <p className="text-sm text-warn">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={combine}
        disabled={disabled || items.length === 0}
        className="tap inline-flex cursor-pointer items-center rounded-lg bg-raised px-5 text-sm text-ink transition-colors hover:brightness-125 disabled:opacity-40"
      >
        Combine into PDF
      </button>

      <div className="flex flex-wrap gap-1.5">
        {FITS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFit(option.id)}
            aria-pressed={fit === option.id}
            title={option.hint}
            className={`tap cursor-pointer rounded-lg px-3.5 text-xs transition-colors ${
              fit === option.id
                ? 'bg-amber text-on-amber font-semibold'
                : 'bg-raised text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}
