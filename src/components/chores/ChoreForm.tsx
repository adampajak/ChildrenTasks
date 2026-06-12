import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { choreFormSchema, type ChoreFormValues } from "@/lib/schemas/chores.schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const AGE_CATEGORIES = [
  { value: "small", label: "Małe (poniżej 9 lat)" },
  { value: "medium", label: "Średnie (9–13 lat)" },
  { value: "large", label: "Duże (powyżej 14 lat)" },
] as const;

interface ChoreFormProps {
  defaultValues?: ChoreFormValues;
  onSubmit: (data: ChoreFormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function ChoreForm({ defaultValues, onSubmit, isSubmitting }: ChoreFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ChoreFormValues>({
    resolver: zodResolver(choreFormSchema),
    defaultValues: defaultValues ?? {
      name: "",
      age_category: undefined,
      min_weekly_frequency: 1,
      min_time_to_complete: 15,
    },
  });

  const ageCategory = useWatch({ control, name: "age_category" });

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nazwa obowiązku</Label>
        <Input id="name" placeholder="np. Zmywanie naczyń" {...register("name")} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Kategoria wiekowa</Label>
        <Select
          value={ageCategory}
          onValueChange={(val) => {
            setValue("age_category", val as ChoreFormValues["age_category"], { shouldValidate: true });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Wybierz kategorię" />
          </SelectTrigger>
          <SelectContent>
            {AGE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.age_category && <p className="text-destructive text-sm">{errors.age_category.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="min_weekly_frequency">Częstotliwość (razy/tydzień)</Label>
          <Input
            id="min_weekly_frequency"
            type="number"
            min={1}
            max={7}
            {...register("min_weekly_frequency", { valueAsNumber: true })}
          />
          {errors.min_weekly_frequency && (
            <p className="text-destructive text-sm">{errors.min_weekly_frequency.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="min_time_to_complete">Czas (minuty)</Label>
          <Input
            id="min_time_to_complete"
            type="number"
            min={5}
            max={480}
            {...register("min_time_to_complete", { valueAsNumber: true })}
          />
          {errors.min_time_to_complete && (
            <p className="text-destructive text-sm">{errors.min_time_to_complete.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Zapisywanie..." : defaultValues ? "Zapisz zmiany" : "Dodaj obowiązek"}
      </Button>
    </form>
  );
}
