import { useState, useEffect } from "react";
import type { Child } from "@/types";
import type { ChildFormValues } from "@/lib/schemas/children.schema";

interface UseChildrenReturn {
  children: Child[];
  isLoading: boolean;
  error: string | null;
  addChild: (data: ChildFormValues) => Promise<void>;
  updateChild: (id: string, data: ChildFormValues) => Promise<void>;
  deleteChild: (id: string) => Promise<void>;
}

export function useChildren(): UseChildrenReturn {
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/children")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch children");
        return (await res.json()) as Child[];
      })
      .then((data) => {
        if (!cancelled) {
          setChildren(data);
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

  const addChild = async (data: ChildFormValues) => {
    // Optimistic: add a temporary child
    const tempId = crypto.randomUUID();
    const optimisticChild: Child = {
      id: tempId,
      user_id: "",
      name: data.name,
      age_category: data.age_category,
      available_time: data.available_time,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    setChildren((prev) => [...prev, optimisticChild]);
    setError(null);

    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create child");
      }
      const created = (await res.json()) as Child;
      setChildren((prev) => prev.map((c) => (c.id === tempId ? created : c)));
    } catch (err) {
      // Rollback
      setChildren((prev) => prev.filter((c) => c.id !== tempId));
      setError(err instanceof Error ? err.message : "Failed to create child");
      throw err;
    }
  };

  const updateChild = async (id: string, data: ChildFormValues) => {
    const previous = children.find((c) => c.id === id);
    if (!previous) return;

    // Optimistic update
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...data, updated_at: new Date().toISOString() } : c)));
    setError(null);

    try {
      const res = await fetch(`/api/children/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to update child");
      }
      const updated = (await res.json()) as Child;
      setChildren((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      // Rollback
      setChildren((prev) => prev.map((c) => (c.id === id ? previous : c)));
      setError(err instanceof Error ? err.message : "Failed to update child");
      throw err;
    }
  };

  const deleteChild = async (id: string) => {
    const previous = children.find((c) => c.id === id);
    if (!previous) return;

    // Optimistic removal
    setChildren((prev) => prev.filter((c) => c.id !== id));
    setError(null);

    try {
      const res = await fetch(`/api/children/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete child");
      }
    } catch (err) {
      // Rollback
      setChildren((prev) => [...prev, previous]);
      setError(err instanceof Error ? err.message : "Failed to delete child");
      throw err;
    }
  };

  return { children, isLoading, error, addChild, updateChild, deleteChild };
}
