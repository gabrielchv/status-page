import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { slugify, ensureUniqueSlug } from "@/lib/slug";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  intervalSec: z.number().int().min(30).max(3600).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, user.id));

  return Response.json({ monitors: rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const existingSlugs = await db
    .select({ slug: monitors.slug })
    .from(monitors);

  const slug = ensureUniqueSlug(
    slugify(parsed.data.name),
    new Set(existingSlugs.map((m) => m.slug)),
  );

  const created = await db
    .insert(monitors)
    .values({
      userId: user.id,
      name: parsed.data.name.trim(),
      url: parsed.data.url,
      slug,
      expectedStatus: parsed.data.expectedStatus ?? 200,
      timeoutMs: parsed.data.timeoutMs ?? 10000,
      intervalSec: parsed.data.intervalSec ?? 60,
    })
    .returning();

  return Response.json({ monitor: created[0] }, { status: 201 });
}
