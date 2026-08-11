import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CombinePdf } from './components/CombinePdf';
import { Controls } from './components/Controls';
import { DropZone } from './components/DropZone';
import { FileRow } from './components/FileRow';
import { PdfPanel, type PdfEntry } from './components/PdfPanel';
import { TaskPicker } from './components/TaskPicker';
import { formatBytes, plural } from './lib/format';
import { readMetadata } from './lib/metadata';
import type { OutputFormat } from './lib/naming';
import { deduplicateNames } from './lib/naming';
import { isPdf, readPdf } from './lib/pdf';
import { processFile, supportedFormats } from './lib/pipeline';
import { DEFAULT_SETTINGS, type Settings } from './lib/settings';
import {
  acceptAttribute,
  dropPrompt,
  findTask,
  hashForTask,
  taskFromHash,
  type TaskId,
} from './lib/tasks';
import {
  CONCURRENCY,
  itemId,
  mapWithConcurrency,
  releaseItem,
  summarise,
  type QueueItem,
} from './lib/queue';

export default function App() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [formats, setFormats] = useState<OutputFormat[]>(['jpeg', 'png']);
  const [pdfs, setPdfs] = useState<PdfEntry[]>([]);
  const [busy, setBusy] = useState(false);
  // Seeded from the URL so a link to a tool opens that tool.
  const [chosen, setChosen] = useState<TaskId | null>(
    () => taskFromHash(window.location.hash)?.id ?? null,
  );

  const task = chosen ? findTask(chosen) : undefined;

  // Held in a ref as well as state so cleanup on unmount can see the latest
  // list without making the effect depend on it and re-run constantly.
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    supportedFormats().then(setFormats).catch(() => setFormats(['jpeg', 'png']));
  }, []);

  // Back and forward move between the list and a tool, which is what those
  // buttons are expected to do once each tool has its own address.
  useEffect(() => {
    const onHashChange = () => setChosen(taskFromHash(window.location.hash)?.id ?? null);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // Every object URL pins its blob in memory until revoked. On a batch of a
    // hundred photos that is the whole converted set.
    return () => {
      for (const item of itemsRef.current) releaseItem(item);
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    // Documents and images take different routes through the app, so they are
    // separated at the door rather than by a mode switch the user has to find.
    const documents = files.filter(isPdf);
    const images = files.filter((file) => !isPdf(file));

    if (documents.length > 0) {
      void Promise.all(
        documents.map(async (file) => ({ file, info: await readPdf(file) })),
      )
        .then((entries) => setPdfs((current) => [...current, ...entries]))
        .catch(() => {
          // A file that cannot be opened is reported by the panel when acted
          // on; refusing to add it silently would be worse.
        });
    }

    if (images.length === 0) return;

    setItems((current) => {
      const existing = new Set(current.map((item) => item.id));
      const additions = images
        .map((file, index) => ({
          id: itemId(file, current.length + index),
          file,
          status: 'queued' as const,
          previewUrl: URL.createObjectURL(file),
        }))
        // The same file dropped twice is almost always a mistake, not a wish
        // for two copies.
        .filter((item) => !existing.has(item.id));

      return [...current, ...additions];
    });
  }, []);

  const clearPdfs = useCallback(() => setPdfs([]), []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const going = current.find((item) => item.id === id);
      if (going) releaseItem(going);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((current) => {
      for (const item of current) releaseItem(item);
      return [];
    });
  }, []);

  const run = useCallback(async () => {
    setBusy(true);

    const queue = itemsRef.current;
    setItems((current) => current.map((item) => ({ ...item, status: 'working' as const })));

    await mapWithConcurrency(queue, CONCURRENCY, async (item) => {
      // Read what the original carries before the conversion drops it — that
      // reveal is most of the point.
      const metadata = await readMetadata(item.file);

      try {
        const result = await processFile(item.file, settings);
        const downloadUrl = URL.createObjectURL(result.blob);

        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: 'done', result, metadata, downloadUrl }
              : candidate,
          ),
        );
      } catch (error) {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: 'failed',
                  metadata,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'This file could not be read as an image',
                }
              : candidate,
          ),
        );
      }
    });

    setBusy(false);
  }, [settings]);

  const downloadAll = useCallback(async () => {
    const finished = itemsRef.current.filter((item) => item.status === 'done' && item.result);
    if (finished.length === 0) return;

    // Loaded on demand: a zip library is dead weight for the many people who
    // convert a single photo and press Save.
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    const names = deduplicateNames(finished.map((item) => item.result!.name));
    finished.forEach((item, index) => zip.file(names[index], item.result!.blob));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'darkroom.zip';
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const stats = useMemo(() => summarise(items), [items]);
  const pending = items.some((item) => item.status === 'queued');
  const anyDone = stats.done > 0;

  // Choosing a task seeds the controls with what that job implies. It does not
  // lock anything: every control below stays editable, and a file of the other
  // kind is still handled rather than turned away.
  const choose = useCallback((id: TaskId) => {
    setChosen(id);
    const picked = findTask(id);
    if (picked?.settings) setSettings(picked.settings);
    // Pushed rather than replaced, so back returns to the list.
    window.location.hash = hashForTask(id);
  }, []);

  const showAllTools = useCallback(() => {
    setChosen(null);
    // `location.hash = ''` leaves a bare "#" in the bar and does not fire a
    // change event when the hash is already empty, so the entry is replaced.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-10 sm:py-16">
      <header className="mb-10">
        <h1 className="flex items-baseline gap-2.5 text-2xl font-semibold tracking-tight">
          <span aria-hidden className="readout text-amber">
            ◐
          </span>
          darkroom
        </h1>
        <p className="mt-3 max-w-lg text-pretty text-ink-muted">
          Convert HEIC, shrink and resize photos, reorganise PDFs, and strip the location data
          and author names out of both. Everything runs on this device — no upload, no account,
          no server that could keep a copy.
        </p>
      </header>

      {!task ? (
        <main className="flex-1">
          <h2 className="sr-only">What do you want to do?</h2>
          <TaskPicker onChoose={choose} />
        </main>
      ) : (
      <main className="flex-1 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">{task.label}</h2>
          <button
            type="button"
            onClick={showAllTools}
            className="cursor-pointer text-xs text-ink-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            All tools
          </button>
        </div>

        <DropZone
          onFiles={addFiles}
          busy={busy}
          accept={acceptAttribute(task)}
          prompt={dropPrompt(task)}
          compact={items.length > 0 || pdfs.length > 0}
        />

        {pdfs.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="eyebrow">
                {plural(pdfs.length, 'document')} ·{' '}
                {pdfs.map((entry) => entry.file.name).join(', ')}
              </h2>
              <button
                type="button"
                onClick={clearPdfs}
                disabled={busy}
                className="cursor-pointer text-xs text-ink-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            <PdfPanel
              // Remounted per task so switching tool reseeds the action rather
              // than leaving the panel on whatever was picked last time.
              key={chosen}
              entries={pdfs}
              onBusy={setBusy}
              initialAction={task.action}
            />
          </section>
        )}

        {items.length > 0 && (
          <>
            <Controls
              settings={settings}
              formats={formats}
              onChange={setSettings}
              disabled={busy}
            />

            <div className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="eyebrow">{plural(items.length, 'image')}</h2>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={busy}
                  className="cursor-pointer text-xs text-ink-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              <ul>
                {items.map((item) => (
                  <FileRow key={item.id} item={item} onRemove={removeItem} />
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={busy || items.length === 0}
                className="tap inline-flex cursor-pointer items-center rounded-lg bg-amber px-6 font-semibold text-on-amber transition-colors hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
              >
                {busy ? 'Working…' : pending ? 'Convert' : 'Convert again'}
              </button>

              {anyDone && (
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={busy}
                  className="tap inline-flex cursor-pointer items-center rounded-lg bg-raised px-5 text-sm text-ink transition-colors hover:brightness-125 disabled:opacity-40"
                >
                  Save all as .zip
                </button>
              )}

              {anyDone && !busy && (
                <p className="readout text-sm text-ink-muted">
                  {stats.savedBytes > 0
                    ? `${formatBytes(stats.savedBytes)} saved`
                    : stats.savedBytes < 0
                      ? `${formatBytes(-stats.savedBytes)} larger`
                      : 'same size'}
                  {stats.failed > 0 && (
                    <span className="text-warn"> · {plural(stats.failed, 'failed')}</span>
                  )}
                </p>
              )}
            </div>

            <CombinePdf items={items} disabled={busy} onBusy={setBusy} />
          </>
        )}
      </main>
      )}

      <footer className="mt-16 border-t border-line pt-6 text-xs text-ink-faint">
        <p className="max-w-lg text-pretty">
          Photos carry more than they look like they do. A picture taken at home usually holds
          the coordinates of the house. darkroom shows you what was in each one, and the copy it
          writes has none of it.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href="https://github.com/BleakMidwinter90/darkroom"
            className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Source on GitHub
          </a>
          <span>MIT licensed</span>
        </p>
      </footer>
    </div>
  );
}
