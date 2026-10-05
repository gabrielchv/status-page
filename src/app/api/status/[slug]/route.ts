import { getStatusBySlug } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const status = await getStatusBySlug(slug);

  if (!status) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(status);
}
