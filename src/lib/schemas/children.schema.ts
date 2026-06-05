import { z } from "zod";

const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const availableTimeSchema = z.object(
  Object.fromEntries(days.map((day) => [day, z.number().min(0).max(480)])) as Record<
    (typeof days)[number],
    z.ZodNumber
  >,
);

export const childFormSchema = z.object({
  name: z.string().min(1, "Imię jest wymagane").max(100, "Imię może mieć maksymalnie 100 znaków"),
  age_category: z.enum(["small", "medium", "large"], {
    required_error: "Kategoria wiekowa jest wymagana",
  }),
  available_time: availableTimeSchema,
});

export const createChildSchema = childFormSchema;

export const updateChildSchema = childFormSchema.partial().extend({
  id: z.uuid(),
});

export type ChildFormValues = z.infer<typeof childFormSchema>;
export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
