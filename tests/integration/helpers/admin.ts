import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const TEST_PASSWORD = "Test1234!";

function getAdminClient() {
  const url = process.env.SUPABASE_TEST_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_TEST_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const adminClient = getAdminClient();

export async function createTestUser(emailPrefix: string): Promise<{ user: User; email: string; password: string }> {
  const email = `${emailPrefix}-${Date.now()}@test.local`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  return { user: data.user, email, password: TEST_PASSWORD };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
}
