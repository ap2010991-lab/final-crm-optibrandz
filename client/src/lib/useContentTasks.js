import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useToast } from "./useToast";

/**
 * One client's content to-dos.
 *
 * Three screens read the same list — the To-do tab, the calendar grid and the day sheet
 * you get by tapping a date — and all three can tick a task off, move it to another day
 * or drop it. They share this hook and therefore one react-query cache entry, so ticking a
 * reel on the day sheet strikes it through on the calendar behind it with no second
 * request, and a reel dragged to the 12th is gone from the 5th everywhere at once.
 *
 * @param clientId  the client whose list to read
 * @param enabled   false while the list is not on screen, to skip the request entirely
 */
export function useContentTasks(clientId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const queryKey = ["content-tasks", clientId];

  const query = useQuery({
    queryKey,
    queryFn: () => api(`/content-tasks?clientId=${encodeURIComponent(clientId)}`),
    enabled: Boolean(clientId) && enabled
  });

  const tasks = useMemo(() => query.data?.data || [], [query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  // Ticking is the action these screens exist for, so the line strikes through on the tap
  // and the request catches up behind it. A failure puts the cache back as it was.
  async function toggle(task) {
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (current) => current && {
      ...current,
      data: current.data.map((entry) => entry.id === task.id
        ? { ...entry, isDone: !entry.isDone, completedAt: entry.isDone ? null : new Date().toISOString() }
        : entry)
    });

    try {
      await api(`/content-tasks/${task.id}/toggle`, { method: "PUT" });
      refresh();
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      notify(error.message, "error");
    }
  }

  // Moving and removing are done from the calendar, where the chip has to leave the day
  // you dragged it off before the request comes back or the drag looks like it failed.
  // Both roll the cache back and re-throw, so the sheet that asked shows the reason.
  async function patch(task, changes) {
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (current) => current && {
      ...current,
      data: current.data.map((entry) => entry.id === task.id ? { ...entry, ...changes } : entry)
    });

    try {
      await api(`/content-tasks/${task.id}`, { method: "PUT", body: JSON.stringify(changes) });
      refresh();
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }
  }

  async function remove(task) {
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (current) => current && {
      ...current,
      data: current.data.filter((entry) => entry.id !== task.id)
    });

    try {
      await api(`/content-tasks/${task.id}`, { method: "DELETE" });
      refresh();
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }
  }

  // Throws on failure rather than swallowing: the caller owns the form and decides
  // whether to keep what was typed.
  async function add({ title, type, dueDate = null }) {
    await api("/content-tasks", {
      method: "POST",
      body: JSON.stringify({ clientId, title, type, dueDate })
    });
    refresh();
  }

  return { query, tasks, toggle, add, patch, remove, refresh };
}
