import { useMemo, useState } from 'react';

import { formatBytes, plural } from '../lib/format';
import { describeSelection, parsePageRange } from '../lib/pageRange';
import {
  extractPages,
  mergePdfs,
  pdfToImages,
  rotatePages,
  splitPages,
  type PdfInfo,
} from '../lib/pdf';

export interface PdfEntry {
  file: File;
  info: PdfInfo;
}

import type { PdfAction } from '../lib/tasks';

const TASKS: Array<{ id: PdfAction; label: string; hint: string }> = [
  { id: 'pages', label: 'Keep pages', hint: 'select, drop or reorder pages' },
  { id: 'rotate', label: 'Rotate', hint: 'turn selected pages' },
  { id: 'merge', label: 'Merge', hint: 'join every file into one' },
  { id: 'split', label: 'Split', hint: 'one file per page' },
  { id: 'images', label: 'To images', hint: 'render pages as PNG or JPEG' },
];

interface Output {
  name: string;
  blob: Blob;
  url: string;
}

/**
 * The document half of the app.
 *
 * Deliberately task-first rather than a wall of buttons: you have a document
 * and one thing you want done to it, and the page selection means different
 * things depending on which. Choosing the task first makes the selection field
 * unambiguous.
 */
export function PdfPanel({
  entries,
  onBusy,
  initialAction = 'pages',
}: {
  entries: PdfEntry[];
  onBusy: (busy: boolean) => void;
  /** Where to start, from the task the user picked on the way in. */
  initialAction?: PdfAction;
}) {
  const [task, setTask] = useState<PdfAction>(initialAction);
  const [selection, setSelection] = useState('');
  const [turn, setTurn] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);

  const first = entries[0];
  const totalPages = first?.info.pageCount ?? 0;

  // Page selection applies to the first document only. Merging is the one task
  // that spans files, and it takes whole documents.
  const parsed = useMemo(
    () => (totalPages > 0 ? parsePageRange(selection, totalPages) : { pages: [], error: undefined }),
    [selection, totalPages],
  );

  const needsSelection = task === 'pages' || task === 'rotate' || task === 'images';

  // Merging one file with itself is not a thing anyone wants, and it used to be
  // possible: the button was hidden below two documents, which left the panel
  // with nothing selected and a "Do it" that quietly produced a copy called
  // merged.pdf. Say what is missing instead of hiding the action that was asked
  // for.
  const needsAnother = task === 'merge' && entries.length < 2;
  const disabled =
    entries.length === 0 || needsAnother || (needsSelection && Boolean(parsed.error));

  function release() {
    for (const output of outputs) URL.revokeObjectURL(output.url);
  }

  async function run() {
    if (!first) return;

    setError(null);
    onBusy(true);
    release();
    setOutputs([]);

    try {
      const produced: Array<{ name: string; blob: Blob }> = [];
      const stem = first.file.name.replace(/\.pdf$/i, '');

      if (task === 'merge') {
        produced.push({
          name: 'merged.pdf',
          blob: await mergePdfs(entries.map((entry) => entry.file)),
        });
      } else if (task === 'pages') {
        produced.push({
          name: `${stem} (${describeSelection(parsed.pages)}).pdf`,
          blob: await extractPages(first.file, parsed.pages),
        });
      } else if (task === 'rotate') {
        produced.push({
          name: `${stem} (rotated).pdf`,
          blob: await rotatePages(first.file, parsed.pages, turn),
        });
      } else if (task === 'split') {
        const parts = await splitPages(first.file);
        parts.forEach((blob, index) => produced.push({ name: `${stem} ${index + 1}.pdf`, blob }));
      } else {
        const rendered = await pdfToImages(first.file, parsed.pages, 'png', 2);
        for (const page of rendered) {
          produced.push({ name: `${stem} ${page.page}.png`, blob: page.blob });
        }
      }

      setOutputs(
        produced.map((output) => ({ ...output, url: URL.createObjectURL(output.blob) })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'That document could not be read.',
      );
    } finally {
      onBusy(false);
    }
  }

  if (!first) return null;

  return (
    <div className="panel divide-y divide-line">
      <fieldset className="p-5">
        <legend className="eyebrow mb-3">What do you want to do?</legend>
        <div className="flex flex-wrap gap-1.5">
          {TASKS.map((entry) => {
            const active = task === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTask(entry.id)}
                aria-pressed={active}
                title={entry.hint}
                className={`tap cursor-pointer rounded-lg px-4 text-sm transition-colors ${
                  active ? 'bg-amber text-on-amber font-semibold' : 'bg-raised text-ink-muted hover:text-ink'
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {needsSelection && (
        <fieldset className="p-5">
          <legend className="eyebrow mb-3">
            Which pages{' '}
            <span className="normal-case tracking-normal text-ink-faint">
              of {first.file.name} · {plural(totalPages, 'page')}
            </span>
          </legend>
          <input
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            placeholder="all — or 1-3, 7, 12-"
            aria-label="Page selection"
            className="tap w-full rounded-lg border border-line bg-raised px-3.5 font-mono text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-amber/50"
          />
          <p className={`mt-2 text-xs ${parsed.error ? 'text-warn' : 'text-ink-faint'}`}>
            {parsed.error ?? `${describeSelection(parsed.pages)} — ${plural(parsed.pages.length, 'page')}`}
          </p>
        </fieldset>
      )}

      {task === 'rotate' && (
        <fieldset className="p-5">
          <legend className="eyebrow mb-3">Turn by</legend>
          <div className="flex flex-wrap gap-1.5">
            {[90, 180, 270].map((angle) => (
              <button
                key={angle}
                type="button"
                onClick={() => setTurn(angle)}
                aria-pressed={turn === angle}
                className={`tap readout cursor-pointer rounded-lg px-4 text-sm transition-colors ${
                  turn === angle
                    ? 'bg-amber text-on-amber font-semibold'
                    : 'bg-raised text-ink-muted hover:text-ink'
                }`}
              >
                {angle}°
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-faint">
            Added to whatever rotation the page already had, so a sideways scan ends up where
            you expect.
          </p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 p-5">
        <button
          type="button"
          onClick={run}
          disabled={disabled}
          className="tap inline-flex cursor-pointer items-center rounded-lg bg-amber px-6 font-semibold text-on-amber transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Do it
        </button>
        {needsAnother && (
          <p className="text-sm text-ink-muted">
            Add another PDF to merge — there is only one here.
          </p>
        )}
        {error && <p className="text-sm text-warn">{error}</p>}
      </div>

      {outputs.length > 0 && (
        <ul className="divide-y divide-line">
          {outputs.map((output) => (
            <li key={output.name} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1 truncate text-sm">{output.name}</span>
              <span className="readout shrink-0 text-xs text-ink-faint">
                {formatBytes(output.blob.size)}
              </span>
              <a
                href={output.url}
                download={output.name}
                className="tap inline-flex shrink-0 items-center rounded-lg bg-raised px-3.5 text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Save
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
