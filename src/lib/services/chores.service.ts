import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chore } from "@/types";
import type { CreateChoreInput, UpdateChoreInput } from "@/lib/schemas/chores.schema";
import { NotFoundError } from "@/lib/services/errors";

export { NotFoundError };

export async function listChores(supabase: SupabaseClient): Promise<Chore[]> {
  const { data, error } = await supabase.from("chores").select("*").order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list chores: ${error.message}`);
  }

  return data as Chore[];
}

export async function createChore(supabase: SupabaseClient, userId: string, input: CreateChoreInput): Promise<Chore> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase
    .from("chores")
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create chore: ${error.message}`);
  }

  return data as Chore;
}

export async function updateChore(
  supabase: SupabaseClient,
  id: string,
  input: Omit<UpdateChoreInput, "id">,
): Promise<Chore> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("chores").update(input).eq("id", id).select().single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new NotFoundError(`Chore not found: ${id}`);
    }
    throw new Error(`Failed to update chore: ${error.message}`);
  }

  return data as Chore;
}

export async function deleteChore(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("chores").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  if (error) {
    if (error.code === "PGRST116") {
      throw new NotFoundError(`Chore not found: ${id}`);
    }
    throw new Error(`Failed to delete chore: ${error.message}`);
  }
}
