import { describe, expect, it } from 'vitest';

import {
  acceptAttribute,
  dropPrompt,
  findTask,
  hashForTask,
  TASKS,
  taskFromHash,
  tasksIn,
  type Task,
} from '../src/lib/tasks';

describe('TASKS', () => {
  it('has no duplicate ids', () => {
    const ids = TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both halves of the app', () => {
    expect(tasksIn('photos').length).toBeGreaterThan(0);
    expect(tasksIn('documents').length).toBeGreaterThan(0);
  });

  it('gives every image task a starting configuration', () => {
    // A task that lands on the workspace with nothing set is just the old drop
    // zone with extra steps.
    for (const task of TASKS.filter((entry) => entry.accepts === 'image')) {
      expect(task.settings, task.id).toBeDefined();
    }
  });

  it('gives every document task an action to preselect', () => {
    for (const task of TASKS.filter((entry) => entry.accepts === 'pdf')) {
      expect(task.action, task.id).toBeDefined();
    }
  });

  it('never mixes a document action into an image task', () => {
    for (const task of TASKS.filter((entry) => entry.accepts === 'image')) {
      expect(task.action, task.id).toBeUndefined();
    }
  });

  it('describes each task in plain words rather than repeating the label', () => {
    for (const task of TASKS) {
      expect(task.label.length, task.id).toBeGreaterThan(0);
      expect(task.blurb.length, task.id).toBeGreaterThan(0);
      expect(task.blurb, task.id).not.toBe(task.label);
    }
  });

  it('keeps quality within range and resize coherent', () => {
    for (const task of TASKS) {
      if (!task.settings) continue;
      expect(task.settings.quality, task.id).toBeGreaterThan(0);
      expect(task.settings.quality, task.id).toBeLessThanOrEqual(1);
      if (task.settings.resize.kind === 'longestEdge') {
        expect(task.settings.resize.length, task.id).toBeGreaterThan(0);
      }
    }
  });

  it('makes "remove location data" barely touch the picture', () => {
    // The job is removing what the file carries, not re-compressing it. A low
    // quality here would quietly degrade every photo someone sanitised.
    const strip = findTask('strip');
    expect(strip?.settings?.quality).toBeGreaterThanOrEqual(0.95);
    expect(strip?.settings?.resize.kind).toBe('none');
  });

  it('actually shrinks things for the shrink task', () => {
    // Quality alone rarely gets a modern phone photo under a mail limit; the
    // dimension cap is the part that does the work.
    const shrink = findTask('shrink');
    expect(shrink?.settings?.resize.kind).toBe('longestEdge');
    expect(shrink?.settings?.quality).toBeLessThan(0.85);
  });
});

describe('findTask', () => {
  it('finds a task by id', () => {
    expect(findTask('merge')?.label).toBe('Merge PDFs');
  });

  it('returns undefined for an id that is not a task', () => {
    expect(findTask('nonsense' as Task['id'])).toBeUndefined();
  });
});

describe('acceptAttribute', () => {
  it('asks for PDFs on a document task', () => {
    expect(acceptAttribute(findTask('split'))).toBe('application/pdf,.pdf');
  });

  it('asks for images on a photo task, including HEIC', () => {
    const accept = acceptAttribute(findTask('convert'));
    expect(accept).toContain('image/*');
    // Several systems do not class HEIC as an image, and an accept list of
    // "image/*" alone hides exactly the files this app exists to convert.
    expect(accept).toContain('.heic');
  });

  it('accepts everything when no task has been chosen', () => {
    const accept = acceptAttribute(undefined);
    expect(accept).toContain('image/*');
    expect(accept).toContain('.pdf');
  });
});

describe('dropPrompt', () => {
  it('speaks in the terms of the job', () => {
    expect(dropPrompt(findTask('merge'))).toMatch(/merge/i);
    expect(dropPrompt(findTask('to-pdf'))).toMatch(/photos/i);
    expect(dropPrompt(findTask('rotate'))).toMatch(/pdf/i);
  });

  it('falls back to something sensible with no task', () => {
    expect(dropPrompt(undefined).length).toBeGreaterThan(0);
  });
});

describe('taskFromHash', () => {
  it('reads a task from a fragment', () => {
    expect(taskFromHash('#merge')?.id).toBe('merge');
  });

  it('tolerates the forms a URL actually arrives in', () => {
    expect(taskFromHash('merge')?.id).toBe('merge');
    expect(taskFromHash('#/merge')?.id).toBe('merge');
    expect(taskFromHash('#MERGE')?.id).toBe('merge');
    expect(taskFromHash('  #merge  '.trim())?.id).toBe('merge');
  });

  it('treats an empty or unknown fragment as no task', () => {
    // A stale bookmark should open the list, not an error.
    expect(taskFromHash('')).toBeUndefined();
    expect(taskFromHash('#')).toBeUndefined();
    expect(taskFromHash('#not-a-tool')).toBeUndefined();
  });

  it('round-trips with hashForTask for every task', () => {
    for (const task of TASKS) {
      expect(taskFromHash(hashForTask(task.id))?.id).toBe(task.id);
    }
  });
});

describe('hashForTask', () => {
  it('clears the fragment when nothing is chosen', () => {
    expect(hashForTask(null)).toBe('');
  });
});
