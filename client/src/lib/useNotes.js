import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Everything on the notes page.
 *
 * Both tabs come from one request and therefore one cache entry: sharing a note has to
 * change the card you are looking at and the count on the other tab at the same moment,
 * and two queries would have let those disagree.
 *
 * Every mutation throws rather than swallowing. The caller owns a form or a modal and is
 * the only thing that knows whether to keep what was typed.
 */
export function useNotes() {
  const queryClient = useQueryClient();
  const queryKey = ["notes"];

  const query = useQuery({ queryKey, queryFn: () => api("/notes") });

  const mine = useMemo(() => query.data?.data?.mine || [], [query.data]);
  const shared = useMemo(() => query.data?.data?.shared || [], [query.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  async function create(payload) {
    const { data } = await api("/notes", { method: "POST", body: JSON.stringify(payload) });
    refresh();
    return data;
  }

  async function update(note, payload) {
    const { data } = await api(`/notes/${note.id}`, { method: "PUT", body: JSON.stringify(payload) });
    refresh();
    return data;
  }

  // Optimistic, because a note you have decided to delete should leave the list under your
  // finger rather than after a round trip. A failure puts it back exactly where it was.
  async function remove(note) {
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (current) => current && {
      ...current,
      data: { ...current.data, mine: current.data.mine.filter((entry) => entry.id !== note.id) }
    });

    try {
      await api(`/notes/${note.id}`, { method: "DELETE" });
      refresh();
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }
  }

  async function setShares(note, userIds) {
    const { data } = await api(`/notes/${note.id}/shares`, {
      method: "PUT",
      body: JSON.stringify({ userIds })
    });
    refresh();
    return data;
  }

  return { query, mine, shared, create, update, remove, setShares, refresh };
}
