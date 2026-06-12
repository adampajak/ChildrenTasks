import { useState, useEffect } from "react";
import type { ScheduleAssignmentView, ScheduleWarning } from "@/types";

interface UseScheduleReturn {
  assignments: ScheduleAssignmentView[];
  warnings: ScheduleWarning[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
  reloadSchedule: () => Promise<void>;
  toggleCompletion: (id: string, completedAt: string | null) => Promise<void>;
}

export function useSchedule(): UseScheduleReturn {
  const [assignments, setAssignments] = useState<ScheduleAssignmentView[]>([]);
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSchedule = async () => {
    const res = await fetch("/api/schedule");
    if (!res.ok) throw new Error("Nie udało się wczytać harmonogramu");
    const data = (await res.json()) as ScheduleAssignmentView[];
    setAssignments(data);
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;

    fetch("/api/schedule")
      .then(async (res) => {
        if (!res.ok) throw new Error("Nie udało się wczytać harmonogramu");
        return (await res.json()) as ScheduleAssignmentView[];
      })
      .then((data) => {
        if (!cancelled) {
          setAssignments(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nieznany błąd");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Nie udało się wygenerować harmonogramu");
      const data = (await res.json()) as { assignments: ScheduleAssignmentView[]; warnings: ScheduleWarning[] };
      setAssignments(data.assignments);
      setWarnings(data.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wygenerować harmonogramu");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCompletion = async (id: string, completedAt: string | null) => {
    const res = await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: completedAt }),
    });
    if (!res.ok) throw new Error("Nie udało się zaktualizować zadania");
    await reloadSchedule();
  };

  return { assignments, warnings, isLoading, isGenerating, error, generate, reloadSchedule, toggleCompletion };
}
