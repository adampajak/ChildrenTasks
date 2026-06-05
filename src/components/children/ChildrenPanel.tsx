import { useState } from "react";
import { useChildren } from "@/components/hooks/use-children";
import { ChildForm } from "@/components/children/ChildForm";
import type { ChildFormValues } from "@/lib/schemas/children.schema";
import type { Child } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const AGE_LABELS: Record<string, string> = {
  small: "Małe",
  medium: "Średnie",
  large: "Duże",
};

export function ChildrenPanel() {
  const { children, isLoading, error, addChild, updateChild, deleteChild } = useChildren();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async (data: ChildFormValues) => {
    setIsSubmitting(true);
    try {
      await addChild(data);
      setIsAddOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: ChildFormValues) => {
    if (!editingChild) return;
    setIsSubmitting(true);
    try {
      await updateChild(editingChild.id, data);
      setEditingChild(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteChild(id);
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
        <h2 className="text-xl font-semibold">Dzieci</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>Dodaj dziecko</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj dziecko</DialogTitle>
            </DialogHeader>
            <ChildForm onSubmit={handleAdd} isSubmitting={isSubmitting} />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="border-destructive/50 bg-destructive/10 rounded-md border p-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {children.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground">Nie dodano jeszcze żadnych dzieci.</p>
            <p className="text-muted-foreground text-sm">Kliknij &quot;Dodaj dziecko&quot; aby rozpocząć.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {children.map((child) => (
            <Card key={child.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{child.name}</CardTitle>
                <span className="bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                  {AGE_LABELS[child.age_category] ?? child.age_category}
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    {Object.values(child.available_time).reduce((a, b) => a + b, 0)} min/tydzień
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingChild(child);
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void handleDelete(child.id)}>
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
        open={!!editingChild}
        onOpenChange={(open) => {
          if (!open) setEditingChild(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj dziecko</DialogTitle>
          </DialogHeader>
          {editingChild && (
            <ChildForm
              defaultValues={{
                name: editingChild.name,
                age_category: editingChild.age_category,
                available_time: editingChild.available_time as ChildFormValues["available_time"],
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
