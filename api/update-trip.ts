import { createClient } from "@supabase/supabase-js";

type UpdateTripInput = {
  tripId?: string;
  name?: string;
  destination?: string;
};

const json = (res: any, status: number, body: unknown) => {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers?.authorization || req.headers?.Authorization;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(res, 500, { error: "Supabase env vars are missing." });
  }

  if (!authHeader || !String(authHeader).toLowerCase().startsWith("bearer ")) {
    return json(res, 401, { error: "Missing user Authorization bearer token" });
  }

  let payload: UpdateTripInput = {};
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const tripId = (payload.tripId || "").trim();
  const name = (payload.name || "").trim();
  const destination = (payload.destination || "").trim();

  if (!tripId || !name || !destination) {
    return json(res, 400, { error: "tripId, name and destination are required" });
  }

  const accessToken = String(authHeader).slice(7);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return json(res, 401, { error: "Invalid user token" });
  }

  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    supabaseAdmin
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("is_superuser")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (membershipError || profileError) {
    return json(res, 500, {
      error: "Failed to verify trip permissions",
      details: membershipError?.message || profileError?.message,
    });
  }

  const isSuperuser = profile?.is_superuser === true;
  if (!membership && !isSuperuser) {
    return json(res, 403, { error: "Only trip admins or superusers can update a trip" });
  }

  const { error: updateError } = await supabaseAdmin
    .from("trips")
    .update({ name, destination })
    .eq("id", tripId);

  if (updateError) {
    return json(res, 500, { error: "Failed to update trip", details: updateError.message });
  }

  return json(res, 200, { ok: true });
}
