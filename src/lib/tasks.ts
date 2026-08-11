/**
 * Everything the app can do, written down as a list.
 *
 * The app used to open on a drop zone reading "choose photos", which described
 * the mechanism rather than the work. Someone arriving with a twelve page
 * statement and one page they need had no way to know that was even on offer.
 *
 * So the list is the front door. Each entry names a job in the words someone
 * would use to describe it to a colleague, and carries the configuration that
 * job implies — pick "make it small enough to email" and the quality and size
 * are already where they should be.
 *
 * Choosing a task sets a starting point; it does not lock the app into a mode.
 * Every control stays visible and editable afterwards, and a file of the other
 * kind is still handled rather than rejected, because being told "wrong tool"
 * by something that plainly could have done the job is infuriating.
 */

import type { Settings } from './settings';

export type TaskId =
  | 'convert'
  | 'shrink'
  | 'resize'
  | 'strip'
  | 'to-pdf'
  | 'pages'
  | 'rotate'
  | 'merge'
  | 'split'
  | 'to-images';

/** The document actions, shared with the panel that performs them. */
export type PdfAction = 'pages' | 'rotate' | 'merge' | 'split' | 'images';

export interface Task {
  id: TaskId;
  group: 'photos' | 'documents';
  /** What the job is called, as someone would say it out loud. */
  label: string;
  /** One line on what it is for — the reason someone would pick it. */
  blurb: string;
  /** What to ask for at the file picker. */
  accepts: 'image' | 'pdf';
  /** Where the image controls should start. */
  settings?: Settings;
  /** Which document action to preselect. */
  action?: PdfAction;
}

export const TASKS: readonly Task[] = [
  {
    id: 'convert',
    group: 'photos',
    label: 'Convert a photo',
    blurb: 'HEIC from an iPhone, or between JPEG, PNG, WebP and AVIF.',
    accepts: 'image',
    settings: { format: 'jpeg', quality: 0.9, resize: { kind: 'none' } },
  },
  {
    id: 'shrink',
    group: 'photos',
    label: 'Make a photo smaller',
    blurb: 'Below an upload limit, or small enough to email.',
    accepts: 'image',
    // Lower quality and a 1200px cap is the combination that actually gets a
    // phone photo under a few hundred kilobytes. Quality alone rarely does.
    settings: { format: 'jpeg', quality: 0.7, resize: { kind: 'longestEdge', length: 1200 } },
  },
  {
    id: 'resize',
    group: 'photos',
    label: 'Resize to fixed dimensions',
    blurb: 'Fit within 4K, Full HD, web or email width.',
    accepts: 'image',
    settings: { format: 'jpeg', quality: 0.85, resize: { kind: 'longestEdge', length: 1920 } },
  },
  {
    id: 'strip',
    group: 'photos',
    label: 'Remove location data',
    blurb: 'Take the GPS, camera and timestamp out before sharing.',
    accepts: 'image',
    // Barely any compression: the point is removing what the file carries, not
    // changing the picture. Metadata goes because re-encoding cannot keep it.
    settings: { format: 'jpeg', quality: 0.95, resize: { kind: 'none' } },
  },
  {
    id: 'to-pdf',
    group: 'photos',
    label: 'Photos into a PDF',
    blurb: 'Receipts, forms or ID photos as one document.',
    accepts: 'image',
    settings: { format: 'jpeg', quality: 0.85, resize: { kind: 'none' } },
  },
  {
    id: 'pages',
    group: 'documents',
    label: 'Keep or reorder pages',
    blurb: 'Pull a few pages out of a long document, in any order.',
    accepts: 'pdf',
    action: 'pages',
  },
  {
    id: 'rotate',
    group: 'documents',
    label: 'Rotate pages',
    blurb: 'Straighten a scan that came out sideways.',
    accepts: 'pdf',
    action: 'rotate',
  },
  {
    id: 'merge',
    group: 'documents',
    label: 'Merge PDFs',
    blurb: 'Join several documents into one, in the order you choose.',
    accepts: 'pdf',
    action: 'merge',
  },
  {
    id: 'split',
    group: 'documents',
    label: 'Split into single pages',
    blurb: 'One file per page, ready to send separately.',
    accepts: 'pdf',
    action: 'split',
  },
  {
    id: 'to-images',
    group: 'documents',
    label: 'PDF into images',
    blurb: 'Render pages as PNGs — for a slide, or to flatten a form.',
    accepts: 'pdf',
    action: 'images',
  },
];

export function findTask(id: TaskId): Task | undefined {
  return TASKS.find((task) => task.id === id);
}

export function tasksIn(group: Task['group']): Task[] {
  return TASKS.filter((task) => task.group === group);
}

/**
 * What the file picker should ask for.
 *
 * Narrowed to the task so the picker on a phone shows the photo library rather
 * than a file browser — but never so narrow that a HEIC is filtered out by an
 * OS that does not consider it an image.
 */
export function acceptAttribute(task: Task | undefined): string {
  if (task?.accepts === 'pdf') return 'application/pdf,.pdf';
  if (task?.accepts === 'image') return 'image/*,.heic,.heif';
  return 'image/*,.heic,.heif,application/pdf,.pdf';
}

/** The prompt on the drop zone, in the terms of the job being done. */
export function dropPrompt(task: Task | undefined): string {
  if (task?.accepts === 'pdf') {
    return task.action === 'merge' ? 'Choose the PDFs to merge' : 'Choose a PDF, or drop it here';
  }
  if (task?.accepts === 'image') {
    return task.id === 'to-pdf'
      ? 'Choose the photos for your PDF'
      : 'Choose photos, or drop them here';
  }
  return 'Choose a file, or drop it here';
}
