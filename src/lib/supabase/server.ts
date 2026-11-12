import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { HUB_SCHEMA } from "@/lib/supabase/schema";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Tables and functions live in the club database's learning_hub schema.
      db: { schema: HUB_SCHEMA },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies; src/proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
