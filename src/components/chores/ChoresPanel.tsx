import { useState } from "react";
import { useChores } from "@/components/hooks/use-chores";
import { ChoreForm } from "@/components/chores/ChoreForm";
import type { ChoreFormValues } from "@/lib/schemas/chores.schema";
import type { Chore } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const AGE_LABELS: Record<string, string> = {
  small: "Małe",
  medium: "Średnie",
  large: "Duże",
};

export function ChoresPanel() {
  const { chores, isLoading, error, addChore, updateChore, deleteChore } = useChores();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async (data: ChoreFormValues) => {
    setIsSubmitting(true);
    try {
      await addChore(data);
      setIsAddOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: ChoreFormValues) => {
    if (!editingChore) return;
    setIsSubmitting(true);
    try {
      await updateChore(editingChore.id, data);
      setEditingChore(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteChore(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Obowiązki</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>Dodaj obowiązek</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj obowiązek</DialogTitle>
            </DialogHeader>
            <ChoreForm onSubmit={handleAdd} isSubmitting={isSubmitting} />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="border-destructive/50 bg-destructive/10 rounded-md border p-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {chores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground">Brak obowiązków. Dodaj pierwszy obowiązek.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {chores.map((chore) => (
            <Card key={chore.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{chore.name}</CardTitle>
                <span className="bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                  {AGE_LABELS[chore.age_category] ?? chore.age_category}
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    {chore.min_weekly_frequency}×/tydz. · {chore.min_time_to_complete} min
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingChore(chore);
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void handleDelete(chore.id)}>
                      Usuń
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog
        open={!!editingChore}
        onOpenChange={(open) => {
          if (!open) setEditingChore(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj obowiązek</DialogTitle>
          </DialogHeader>
          {editingChore && (
            <ChoreForm
              defaultValues={{
                name: editingChore.name,
                age_category: editingChore.age_category,
                min_weekly_frequency: editingChore.min_weekly_frequency,
                min_time_to_complete: editingChore.min_time_to_complete,
              }}
              onSubmit={handleEdit}
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
