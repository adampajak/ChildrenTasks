import type { ScheduleAssignmentView } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  assignments: ScheduleAssignmentView[];
  onFocusChild?: (child: { id: string; name: string }) => void;
}

export function TodayView({ assignments, onFocusChild }: Props) {
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
              <CardTitle className="text-base">
                {onFocusChild ? (
                  <button
                    className="cursor-pointer hover:underline"
                    onClick={() => {
                      onFocusChild(child);
                    }}
                  >
                    {child.name}
                  </button>
                ) : (
                  child.name
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chores.length === 0 ? (
                <p className="text-muted-foreground text-sm">Brak zadań na dziś</p>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
