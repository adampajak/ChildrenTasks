import { Circle, CheckCircle } from "lucide-react";
import type { ScheduleAssignmentView } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  assignments: ScheduleAssignmentView[];
  onToggleComplete?: (id: string, completedAt: string | null) => void;
}

export function TodayView({ assignments, onToggleComplete }: Props) {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  const todayAssignments = assignments.filter((a) => a.assignment_date === today);

  // All children who appear anywhere in the weekly schedule
  const children = Array.from(
    new Map(assignments.map((a) => [a.child_id, { id: a.child_id, name: a.child_name }])).values(),
  );

  if (children.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Brak dzieci w harmonogramie.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {children.map((child) => {
        const chores = todayAssignments.filter((a) => a.child_id === child.id);
        return (
          <Card key={child.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{child.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {chores.length === 0 ? (
                <p className="text-muted-foreground text-sm">Brak zadań na dziś</p>
              ) : (
                <ul className="space-y-1">
                  {chores.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      <span className="flex flex-1 items-center gap-2">
                        {onToggleComplete && (
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
                        )}
                        <span className={cn("flex-1", a.completed_at ? "line-through opacity-50" : "")}>
                          {a.chore_name}
                        </span>
                      </span>
                      <span className="text-muted-foreground ml-2 shrink-0">{a.chore_time} min</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
