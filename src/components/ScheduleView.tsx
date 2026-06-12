import { useState } from "react";
import { useSchedule } from "@/components/hooks/use-schedule";
import { ChildDayView } from "@/components/ChildDayView";
import { TodayView } from "@/components/TodayView";
import { WeekView } from "@/components/WeekView";
import { Button } from "@/components/ui/button";

type Tab = "today" | "week";

export function ScheduleView() {
  const { assignments, warnings, isLoading, isGenerating, error, generate, toggleCompletion } = useSchedule();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [focusedChild, setFocusedChild] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  const hasSchedule = assignments.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="border-destructive/50 bg-destructive/10 rounded-md border p-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
            Nie udało się zaplanować wszystkich obowiązków:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w.chore_id} className="text-sm text-yellow-700 dark:text-yellow-400">
                {w.chore_name} — zaplanowano {w.placed} z {w.needed} razy
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasSchedule ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <p className="text-muted-foreground text-center">Brak harmonogramu na ten tydzień.</p>
          <Button onClick={() => void generate()} disabled={isGenerating}>
            {isGenerating ? "Generowanie…" : "Generuj harmonogram"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            {focusedChild ? (
              <div className="flex items-center gap-3">
                <button
                  className="text-sm font-medium text-white/70 transition-colors hover:text-white"
                  onClick={() => {
                    setFocusedChild(null);
                  }}
                >
                  ← Wszystkie dzieci
                </button>
                <span className="text-base font-semibold text-white">{focusedChild.name}</span>
              </div>
            ) : (
              <div className="flex rounded-lg border border-white/20 bg-white/10 p-0.5">
                <button
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "today" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"
                  }`}
                  onClick={() => {
                    setActiveTab("today");
                  }}
                >
                  Dziś
                </button>
                <button
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "week" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"
                  }`}
                  onClick={() => {
                    setActiveTab("week");
                    setFocusedChild(null);
                  }}
                >
                  Ten tydzień
                </button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => void generate()} disabled={isGenerating}>
              {isGenerating ? "Generowanie…" : "Wygeneruj ponownie"}
            </Button>
          </div>

          {activeTab === "today" && focusedChild ? (
            <ChildDayView
              child={focusedChild}
              assignments={assignments}
              onBack={() => {
                setFocusedChild(null);
              }}
            />
          ) : activeTab === "today" ? (
            <TodayView assignments={assignments} onFocusChild={setFocusedChild} onToggleComplete={toggleCompletion} />
          ) : (
            <WeekView assignments={assignments} onToggleComplete={toggleCompletion} />
          )}
        </div>
      )}
    </div>
  );
}
