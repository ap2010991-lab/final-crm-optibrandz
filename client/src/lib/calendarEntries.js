import { pretty } from "./format";
import { taskTypeLabel } from "./contentTasks";

/**
 * The two kinds of thing that sit on a date in the content calendar, flattened to one shape.
 *
 * A scheduled post is a ContentCalendar row and a to-do is a ContentTask row: different
 * tables, different routes, different words for the same idea. On the grid they are the
 * same thing — something planned for a day — and the person looking at it wants the same
 * two answers from either: move it, or take it off. Collapsing them here means the sheet
 * that offers those two actions is written once instead of twice.
 */

export const postEntry = (post) => ({
  kind: "post",
  id: post.id,
  dragId: `post:${post.id}`,
  title: `${pretty(post.platform)} · ${pretty(post.postType)}`,
  detail: (post.caption || "").trim() || (post.designBrief || "").trim(),
  state: pretty(post.status),
  date: post.scheduledDate,
  record: post
});

export const taskEntry = (task) => ({
  kind: "task",
  id: task.id,
  dragId: `task:${task.id}`,
  title: task.title,
  detail: (task.notes || "").trim(),
  state: task.isDone ? "Done" : taskTypeLabel(task.type),
  date: task.dueDate,
  record: task
});

// Only the id travels with a dnd-kit drag, so it has to carry the kind with it — a post
// and a to-do can share an id and the drop handler must not guess which list to look in.
export function findEntry(dragId, posts, tasks) {
  const [kind, id] = String(dragId).split(":");
  if (kind === "post") {
    const post = posts.find((item) => item.id === id);
    return post ? postEntry(post) : null;
  }
  const task = tasks.find((item) => item.id === id);
  return task ? taskEntry(task) : null;
}
