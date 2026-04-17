const json = (res: any, status: number, body: unknown) => {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
};

const first = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.FREECURRENCYAPI_KEY || process.env.FREECURRENCY_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      error: "Missing FREECURRENCYAPI_KEY environment variable",
    });
  }

  const baseCurrency = (first(req.query?.base_currency) || "USD").toUpperCase();
  const currencies = first(req.query?.currencies);

  const params = new URLSearchParams({
    apikey: apiKey,
    base_currency: baseCurrency,
  });
  if (currencies && currencies.trim()) {
    params.set("currencies", currencies);
  }

  let upstreamResponse: any;
  try {
    upstreamResponse = await fetch(`https://api.freecurrencyapi.com/v1/latest?${params.toString()}`);
  } catch (error) {
    return json(res, 502, { error: "Failed to contact currency provider", details: String(error) });
  }

  const rawText = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    return json(res, upstreamResponse.status, {
      error: "Currency provider error",
      details: rawText,
    });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json(res, 502, { error: "Currency provider returned invalid JSON" });
  }

  const rates: Record<string, number> = {};
  const payloadRates = parsed?.data || {};
  Object.keys(payloadRates).forEach((key) => {
    const normalized = String(key || "").toUpperCase();
    const value = Number(payloadRates[key]);
    if (normalized && Number.isFinite(value) && value > 0) {
      rates[normalized] = value;
    }
  });
  rates[baseCurrency] = 1;

  const providerDateRaw = parsed?.meta?.last_updated_at as string | undefined;
  const providerDate = providerDateRaw && providerDateRaw.includes("T")
    ? providerDateRaw.split("T")[0]
    : new Date().toISOString().split("T")[0];

  return json(res, 200, {
    base: baseCurrency,
    date: providerDate,
    rates,
  });
}
