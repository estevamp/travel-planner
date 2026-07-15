import { createClient } from "@supabase/supabase-js";

type DeleteTripInput = {
  tripId?: string;
};

const DOCS_BUCKET = "travel-documents";

const json = (res: any, status: number, body: unknown) => {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
};

function parseStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  const markers = [
    `/object/public/${DOCS_BUCKET}/`,
    `/object/sign/${DOCS_BUCKET}/`,
    `/storage/v1/object/public/${DOCS_BUCKET}/`,
    `/storage/v1/object/sign/${DOCS_BUCKET}/`,
  ];

  for (const marker of markers) {
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) {
      const path = value.slice(markerIndex + marker.length).split("?")[0];
      return decodeURIComponent(path);
    }
  }

  return null;
}

type StorageRemover = {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

async function removeStoragePaths(
  supabaseAdmin: StorageRemover,
  paths: string[]
) {
  if (paths.length === 0) return;

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await supabaseAdmin.storage.from(DOCS_BUCKET).remove(chunk);
    if (error) {
      throw error;
    }
  }
}

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
    console.error("[delete-trip] Missing Supabase server env vars", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
    });
    return json(res, 500, {
      error: "Supabase env vars are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  if (!authHeader || !String(authHeader).toLowerCase().startsWith("bearer ")) {
    return json(res, 401, { error: "Missing user Authorization bearer token" });
  }

  let payload: DeleteTripInput = {};
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const tripId = (payload.tripId || "").trim();
  if (!tripId) {
    return json(res, 400, { error: "tripId is required" });
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
    console.error("[delete-trip] Invalid user token", userError);
    return json(res, 401, {
      error: "Invalid user token",
      details: userError?.message || "auth.getUser returned no user",
    });
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
    console.error("[delete-trip] Failed to verify trip permissions", membershipError || profileError);
    return json(res, 500, { error: "Failed to verify trip permissions", details: membershipError?.message || profileError?.message });
  }

  const isSuperuser = profile?.is_superuser === true;
  if (!membership && !isSuperuser) {
    return json(res, 403, { error: "Only trip admins or superusers can delete a trip" });
  }

  const [{ data: documents, error: documentsError }, { data: ideaAssets, error: assetsError }, { data: itinerary, error: itineraryError }] = await Promise.all([
    supabaseAdmin.from("documents").select("url").eq("trip_id", tripId),
    supabaseAdmin
      .from("idea_assets")
      .select("url, ideas!inner(trip_id)")
      .eq("ideas.trip_id", tripId),
    supabaseAdmin.from("itinerary").select("photo_url").eq("trip_id", tripId).not("photo_url", "is", null),
  ]);

  if (documentsError || assetsError || itineraryError) {
    console.error("[delete-trip] Failed to load trip files before deletion", {
      documentsError,
      assetsError,
      itineraryError,
    });
    return json(res, 500, {
      error: "Failed to load trip files before deletion",
      details: documentsError?.message || assetsError?.message || itineraryError?.message,
    });
  }

  const storagePaths = Array.from(
    new Set(
      [
        ...(documents || []).map((item: { url: string }) => item.url),
        ...(ideaAssets || []).map((item: { url: string }) => item.url),
        ...(itinerary || []).map((item: { photo_url: string | null }) => parseStoragePath(item.photo_url)),
      ].filter((path): path is string => Boolean(path))
    )
  );

  try {
    await removeStoragePaths(supabaseAdmin, storagePaths);
  } catch (storageError: any) {
    console.error("[delete-trip] Failed to remove trip files from storage", storageError);
    return json(res, 500, {
      error: "Failed to remove trip files from storage",
      details: storageError?.message || String(storageError),
    });
  }

  const { error: deleteError } = await supabaseAdmin.from("trips").delete().eq("id", tripId);
  if (deleteError) {
    console.error("[delete-trip] Failed to delete trip row", deleteError);
    return json(res, 500, { error: "Failed to delete trip", details: deleteError.message });
  }

  return json(res, 200, { ok: true });
}
