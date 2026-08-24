/**
 * The kinds of work a content to-do can be.
 *
 * Deliberately the words the team uses out loud rather than ContentCalendar's PostType —
 * nobody asks for "a STATIC", they ask for a post. Shared by the to-do list and the
 * calendar so a reel is labelled the same on both.
 */
export const TASK_TYPES = [
  { value: "REEL", label: "Reel" },
  { value: "POST", label: "Post" },
  { value: "STORY", label: "Story" },
  { value: "CAROUSEL", label: "Carousel" },
  { value: "VIDEO", label: "Video" },
  { value: "OTHER", label: "Other" }
];

export const taskTypeLabel = (value) =>
  TASK_TYPES.find((type) => type.value === value)?.label || "Post";

export const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

// A task is only late if it is still open. A finished one keeps its date without ever
// turning red — the work went out, whenever it went out.
export const isOverdue = (task, today = startOfToday()) =>
  !task.isDone && Boolean(task.dueDate) && new Date(task.dueDate) < today;

/**
 * Groups dated tasks by day-of-month for one month.
 *
 * Compared on local calendar parts rather than by slicing the ISO string, because India
 * is UTC+5:30 and a date stored at midday UTC would otherwise land on the previous day.
 */
export function tasksByDay(tasks, month, year) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task.dueDate) return;
    const date = new Date(task.dueDate);
    if (date.getMonth() !== month - 1 || date.getFullYear() !== year) return;
    const day = date.getDate();
    map.set(day, [...(map.get(day) || []), task]);
  });
  return map;
}
