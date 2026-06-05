import type { SupabaseClient } from "@supabase/supabase-js";
import type { Child } from "@/types";
import type { CreateChildInput, UpdateChildInput } from "@/lib/schemas/children.schema";

export async function listChildren(supabase: SupabaseClient): Promise<Child[]> {
  const { data, error } = await supabase.from("children").select("*").order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list children: ${error.message}`);
  }

  return data as Child[];
}

export async function createChild(supabase: SupabaseClient, input: CreateChildInput): Promise<Child> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("children").insert(input).select().single();

  if (error) {
    throw new Error(`Failed to create child: ${error.message}`);
  }

  return data as Child;
}

export async function updateChild(
  supabase: SupabaseClient,
  id: string,
  input: Omit<UpdateChildInput, "id">,
): Promise<Child> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("children").update(input).eq("id", id).select().single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new NotFoundError(`Child not found: ${id}`);
    }
    throw new Error(`Failed to update child: ${error.message}`);
  }

  return data as Child;
}

export async function deleteChild(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("children").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  if (error) {
    if (error.code === "PGRST116") {
      throw new NotFoundError(`Child not found: ${id}`);
    }
    throw new Error(`Failed to delete child: ${error.message}`);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
