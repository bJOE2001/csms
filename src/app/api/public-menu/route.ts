import { readPublicMenu } from "@/lib/site/read-public-menu";

export async function GET() {
  const menu = await readPublicMenu();
  return Response.json(menu, { status: menu.status === "unavailable" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
