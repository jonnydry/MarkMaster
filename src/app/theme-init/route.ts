import { THEME_INIT_SCRIPT } from "@/lib/theme-init";

export function GET() {
  return new Response(THEME_INIT_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
