import { Circle, CheckCircle } from "lucide-react";
import type { ScheduleAssignmentView } from "@/types";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];

function addDaysToDateStr(dateStr: string, days: number): string {
  const parts = dateStr.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return d.toISOString().split("T")[0];
}

function formatDayHeader(dateStr: string, label: string): string {
  const parts = dateStr.split("-");
  return `${label} ${parts[2]}.${parts[1]}`;
}

interface Props {
  assignments: ScheduleAssignmentView[];
  onToggleComplete?: (id: string, completedAt: string | null) => void;
}

export function WeekView({ assignments, onToggleComplete }: Props) {
  if (assignments.length === 0) return null;

  const weekStartDate = assignments[0].week_start_date;
  const weekDays = DAY_LABELS.map((label, i) => {
    const date = addDaysToDateStr(weekStartDate, i);
    return { date, header: formatDayHeader(date, label) };
  });

  const children = Array.from(
    new Map(assignments.map((a) => [a.child_id, { id: a.child_id, name: a.child_name }])).values(),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-muted-foreground border-b p-2 text-left font-medium">Dziecko</th>
            {weekDays.map((day) => (
              <th
                key={day.date}
                className="text-muted-foreground border-b p-2 text-center font-medium whitespace-nowrap"
              >
                {day.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children.map((child) => (
            <tr key={child.id} className="border-b last:border-0">
              <td className="p-2 font-medium">{child.name}</td>
              {weekDays.map((day) => {
                const chores = assignments.filter((a) => a.child_id === child.id && a.assignment_date === day.date);
                return (
                  <td key={day.date} className="p-2 text-center align-top">
                    {chores.length === 0 ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {chores.map((a) => (
                          <li key={a.id} className="text-xs leading-snug">
                            {onToggleComplete ? (
                              <span className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleComplete(a.id, a.completed_at ? null : new Date().toISOString());
                                  }}
                                  className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                                >
                                  {a.completed_at ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Circle className="h-4 w-4" />
                                  )}
                                </button>
                                <span className={cn(a.completed_at ? "line-through opacity-50" : "")}>
                                  {a.chore_name}
                                </span>
                              </span>
                            ) : (
                              a.chore_name
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
