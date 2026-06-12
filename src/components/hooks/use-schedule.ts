import { useState, useEffect } from "react";
import type { ScheduleAssignmentView, ScheduleWarning } from "@/types";

interface UseScheduleReturn {
  assignments: ScheduleAssignmentView[];
  warnings: ScheduleWarning[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
}

export function useSchedule(): UseScheduleReturn {
  const [assignments, setAssignments] = useState<ScheduleAssignmentView[]>([]);
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return { assignments, warnings, isLoading, isGenerating, error, generate };
}
