import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().url().optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  intervalSec: z.number().int().min(30).max(3600).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const rows = await db
    .select({ userId: monitors.userId })
    .from(monitors)
    .where(eq(monitors.id, id))
    .limit(1);

  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  if (rows[0].userId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await db
    .update(monitors)
    .set({ ...parsed.data, name: parsed.data.name?.trim() })
    .where(eq(monitors.id, id))
    .returning();

  return Response.json({ monitor: updated[0] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const rows = await db
    .select({ userId: monitors.userId })
    .from(monitors)
    .where(eq(monitors.id, id))
    .limit(1);

  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  if (rows[0].userId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(monitors).where(and(eq(monitors.id, id), eq(monitors.userId, user.id)));

  return Response.json({ ok: true });
}
