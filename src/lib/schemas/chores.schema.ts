import { z } from "zod";

export const choreFormSchema = z.object({
  name: z.string().min(1, "Nazwa jest wymagana").max(100, "Nazwa może mieć maksymalnie 100 znaków"),
  age_category: z.enum(["small", "medium", "large"], {
    required_error: "Kategoria wiekowa jest wymagana",
  }),
  min_weekly_frequency: z
    .number({ invalid_type_error: "Podaj liczbę" })
    .int()
    .min(1, "Minimalna częstotliwość to 1 raz w tygodniu")
    .max(7, "Maksymalna częstotliwość to 7 razy w tygodniu"),
  min_time_to_complete: z
    .number({ invalid_type_error: "Podaj liczbę" })
    .int()
    .min(5, "Minimalny czas to 5 minut")
    .max(480, "Maksymalny czas to 480 minut"),
});

export const createChoreSchema = choreFormSchema;

export const updateChoreSchema = choreFormSchema.partial().extend({
  id: z.uuid(),
});

export type ChoreFormValues = z.infer<typeof choreFormSchema>;
export type CreateChoreInput = z.infer<typeof createChoreSchema>;
export type UpdateChoreInput = z.infer<typeof updateChoreSchema>;
