import type { ResizeMode } from './geometry';
import type { FormatChoice } from './outputFormat';

/**
 * What the image side is configured to produce.
 *
 * Lives here rather than beside the controls because the task list needs to
 * describe settings too, and a component importing from `lib/` is fine while
 * `lib/` importing from a component is not.
 */
export interface Settings {
  format: FormatChoice;
  quality: number;
  resize: ResizeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  format: 'jpeg',
  quality: 0.8,
  resize: { kind: 'none' },
};
