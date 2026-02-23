type CreateTripInput = {
  name?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
  startDate?: string;
  endDate?: string;
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
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(res, 500, {
      error: "Supabase env vars are missing. Set SUPABASE_URL/SUPABASE_ANON_KEY (or VITE_ equivalents).",
    });
  }

  let payload: CreateTripInput = {};
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const name = (payload.name || "").trim();
  const destination = (payload.destination || "").trim();

  if (!name || !destination) {
    return json(res, 400, { error: "name and destination are required" });
  }

  const now = new Date().toISOString();
  const startDate = payload.start_date || payload.startDate || now;
  const endDate = payload.end_date || payload.endDate || startDate;

  const response = await fetch(`${supabaseUrl}/rest/v1/trips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      destination,
      start_date: startDate,
      end_date: endDate,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return json(res, response.status, { error: "Failed to create trip", details: text });
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  const trip = rows?.[0];

  if (!trip) {
    return json(res, 502, { error: "Supabase did not return the created trip" });
  }

  return json(res, 201, trip);
}
