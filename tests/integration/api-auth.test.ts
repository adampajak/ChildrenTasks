import { describe, it, expect } from "vitest";

const BASE_URL = process.env.ASTRO_TEST_URL ?? "http://localhost:4322";
const DUMMY_UUID = "00000000-0000-0000-0000-000000000000";

describe("Unauthenticated API access → 401", () => {
  it("GET /api/children returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/children`);
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("POST /api/children returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/children`, {
      method: "POST",
      headers: { Origin: BASE_URL },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("GET /api/chores returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/chores`);
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("POST /api/chores returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/chores`, {
      method: "POST",
      headers: { Origin: BASE_URL },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("GET /api/schedule returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule`);
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("POST /api/schedule/generate returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule/generate`, {
      method: "POST",
      headers: { Origin: BASE_URL },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("PATCH /api/schedule/:id returns 401 (locals.user code path)", async () => {
    const res = await fetch(`${BASE_URL}/api/schedule/${DUMMY_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({ completed_at: null }),
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String) });
  });
});
