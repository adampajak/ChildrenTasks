import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { childFormSchema, type ChildFormValues } from "@/lib/schemas/children.schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const AGE_CATEGORIES = [
  { value: "small", label: "Małe (poniżej 9 lat)" },
  { value: "medium", label: "Średnie (9–13 lat)" },
  { value: "large", label: "Duże (powyżej 14 lat)" },
] as const;

const DAYS = [
  { key: "mon", label: "Pon" },
  { key: "tue", label: "Wt" },
  { key: "wed", label: "Śr" },
  { key: "thu", label: "Czw" },
  { key: "fri", label: "Pt" },
  { key: "sat", label: "Sob" },
  { key: "sun", label: "Ndz" },
] as const;

const DEFAULT_AVAILABLE_TIME = {
  mon: 30,
  tue: 30,
  wed: 30,
  thu: 30,
  fri: 30,
  sat: 60,
  sun: 60,
};

interface ChildFormProps {
  defaultValues?: ChildFormValues;
  onSubmit: (data: ChildFormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function ChildForm({ defaultValues, onSubmit, isSubmitting }: ChildFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ChildFormValues>({
    resolver: zodResolver(childFormSchema),
    defaultValues: defaultValues ?? {
      name: "",
      age_category: undefined,
      available_time: DEFAULT_AVAILABLE_TIME,
    },
  });
  
  const ageCategory = useWatch({ control, name: "age_category" });

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Imię dziecka</Label>
        <Input id="name" placeholder="np. Ania" {...register("name")} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Kategoria wiekowa</Label>
        <Select
          value={ageCategory}
          onValueChange={(val) => {
            setValue("age_category", val as ChildFormValues["age_category"], { shouldValidate: true });
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

      <div className="space-y-2">
        <Label>Dostępny czas (minuty dziennie)</Label>
        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((day) => (
            <div key={day.key} className="space-y-1">
              <Label className="text-muted-foreground text-xs">{day.label}</Label>
              <Input
                type="number"
                min={0}
                max={480}
                className="h-8 text-center text-sm"
                {...register(`available_time.${day.key}`, { valueAsNumber: true })}
              />
            </div>
          ))}
        </div>
        {errors.available_time && <p className="text-destructive text-sm">Czas musi być między 0 a 480 minut</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Zapisywanie..." : defaultValues ? "Zapisz zmiany" : "Dodaj dziecko"}
      </Button>
    </form>
  );
}
