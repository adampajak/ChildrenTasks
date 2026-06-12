import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { toggleCompletion } from "@/lib/services/scheduler.service";

export const prerender = false;

const patchSchema = z.object({
  completed_at: z.string().nullable(),
});

export const PATCH: APIRoute = async (context) => {
  const { params, request, locals, cookies } = context;

  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 500 });
  }

  try {
    await toggleCompletion(supabase, id, locals.user.id, parsed.data.completed_at);
    return new Response(JSON.stringify({ id, completed_at: parsed.data.completed_at }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
