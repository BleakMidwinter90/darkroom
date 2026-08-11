import { tasksIn, type Task, type TaskId } from '../lib/tasks';

/**
 * The front door: what do you want to do?
 *
 * Two columns rather than one grid of ten, because "photo" and "document" is
 * the first split anyone makes in their head, and it means the list can be read
 * without reading all of it.
 *
 * Each row is a whole button. Titles alone would be a menu; the second line is
 * what turns it into an answer to "can this thing do the thing I need".
 */
export function TaskPicker({ onChoose }: { onChoose: (id: TaskId) => void }) {
  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      <Group title="Photos" tasks={tasksIn('photos')} onChoose={onChoose} />
      <Group title="Documents" tasks={tasksIn('documents')} onChoose={onChoose} />
    </div>
  );
}

function Group({
  title,
  tasks,
  onChoose,
}: {
  title: string;
  tasks: Task[];
  onChoose: (id: TaskId) => void;
}) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      <ul className="panel divide-y divide-line">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onChoose(task.id)}
              className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium transition-colors group-hover:text-amber">
                  {task.label}
                </span>
                <span className="mt-0.5 block text-pretty text-sm text-ink-muted">
                  {task.blurb}
                </span>
              </span>
              <span
                aria-hidden
                className="readout mt-0.5 shrink-0 text-ink-faint transition-colors group-hover:text-amber"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
