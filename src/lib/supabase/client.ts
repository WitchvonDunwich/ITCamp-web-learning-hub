import { createBrowserClient } from "@supabase/ssr";
import { HUB_SCHEMA } from "@/lib/supabase/schema";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Tables and functions live in the club database's learning_hub schema.
    { db: { schema: HUB_SCHEMA } },
  );
}
