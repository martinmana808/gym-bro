import { requireUserId } from "@/auth";
import { getProgramSheet } from "@/db/queries";
import { programSheetToCsv } from "@/lib/sheet";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const sheet = await getProgramSheet(id, userId);
  if (!sheet) return new Response("Not found", { status: 404 });
  const csv = programSheetToCsv(sheet.program.name, sheet.days);
  const safeName = sheet.program.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "workout";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.csv"`,
    },
  });
}
