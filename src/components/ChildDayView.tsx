import type { ScheduleAssignmentView } from "@/types";
import { getTodayLocal } from "@/lib/date";

interface Props {
  child: { id: string; name: string };
  assignments: ScheduleAssignmentView[];
  onBack: () => void;
}

export function ChildDayView({ child, assignments, onBack }: Props) {
  const today = getTodayLocal();
  const chores = assignments.filter((a) => a.child_id === child.id && a.assignment_date === today);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm font-medium text-white/70 transition-colors hover:text-white">
          ← Wszystkie dzieci
        </button>
        <h2 className="text-lg font-semibold text-white">{child.name}</h2>
      </div>
      {chores.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">Brak zadań na dziś.</p>
      ) : (
        <ul className="space-y-1">
          {chores.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span>{a.chore_name}</span>
              <span className="text-muted-foreground ml-2 shrink-0">{a.chore_time} min</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
