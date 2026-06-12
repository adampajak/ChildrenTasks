import { useState, useEffect } from "react";
import type { Chore } from "@/types";
import type { ChoreFormValues } from "@/lib/schemas/chores.schema";

interface UseChoresReturn {
  chores: Chore[];
  isLoading: boolean;
  error: string | null;
  addChore: (data: ChoreFormValues) => Promise<void>;
  updateChore: (id: string, data: ChoreFormValues) => Promise<void>;
  deleteChore: (id: string) => Promise<void>;
}

export function useChores(): UseChoresReturn {
  const [chores, setChores] = useState<Chore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/chores")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch chores");
        return (await res.json()) as Chore[];
      })
      .then((data) => {
        if (!cancelled) {
          setChores(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const addChore = async (data: ChoreFormValues) => {
    const tempId = crypto.randomUUID();
    const optimisticChore: Chore = {
      id: tempId,
      user_id: "",
      name: data.name,
      age_category: data.age_category,
      min_weekly_frequency: data.min_weekly_frequency,
      min_time_to_complete: data.min_time_to_complete,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    setChores((prev) => [...prev, optimisticChore]);
    setError(null);

    try {
      const res = await fetch("/api/chores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create chore");
      const created = (await res.json()) as Chore;
      setChores((prev) => prev.map((c) => (c.id === tempId ? created : c)));
    } catch (err) {
      setChores((prev) => prev.filter((c) => c.id !== tempId));
      setError(err instanceof Error ? err.message : "Failed to create chore");
      throw err;
    }
  };

  const updateChore = async (id: string, data: ChoreFormValues) => {
    const previous = chores.find((c) => c.id === id);
    if (!previous) return;

    setChores((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, updated_at: new Date().toISOString() } : c)));
    setError(null);

    try {
      const res = await fetch(`/api/chores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update chore");
      const updated = (await res.json()) as Chore;
      setChores((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      setChores((prev) => prev.map((c) => (c.id === id ? previous : c)));
      setError(err instanceof Error ? err.message : "Failed to update chore");
      throw err;
    }
  };

  const deleteChore = async (id: string) => {
    const previous = chores.find((c) => c.id === id);
    if (!previous) return;

    setChores((prev) => prev.filter((c) => c.id !== id));
    setError(null);

    try {
      const res = await fetch(`/api/chores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete chore");
    } catch (err) {
      setChores((prev) => [...prev, previous]);
      setError(err instanceof Error ? err.message : "Failed to delete chore");
      throw err;
    }
  };

  return { chores, isLoading, error, addChore, updateChore, deleteChore };
}
