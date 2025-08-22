// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE") || Deno.env.get("SB_SERVICE_ROLE")!;
    const DEFAULT_USER_ID = Deno.env.get("DEFAULT_USER_ID") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const url = new URL(req.url);
    const horizon = Number(url.searchParams.get("horizon_weeks") ?? "26");

    let userId = url.searchParams.get("user_id") ?? DEFAULT_USER_ID;
    if (!userId) {
      const { data } = await admin.from("wb_stocks").select("user_id").limit(1).maybeSingle();
      userId = data?.user_id ?? "";
    }
    if (!userId) return new Response(JSON.stringify({ error: "No user_id" }), { status: 400, headers });

    const { error } = await admin.rpc("refresh_portfolio_cov", { p_user_id: userId, p_horizon_weeks: horizon, p_cov_type: "correlation" } as any);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, userId, horizonWeeks: horizon }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), { status: 500, headers });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/portfolio-refresh' \
    --header 'Authorization: Bearer YOUR_LOCAL_TOKEN_HERE' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
