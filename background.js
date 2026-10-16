const API_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_KEY = "currencyRatesCache";
// The open-access rate feed refreshes daily, so keep a successful response for 24 hours.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Only keep currencies actually supported by the extension. This keeps the
// persistent cache and each message sent to tabs much smaller than the full API payload.
const SUPPORTED_RATE_CODES = [
  "USD", "VND", "IDR", "TWD", "HKD", "NZD", "AUD", "CAD", "SGD", "BRL",
  "CNY", "EUR", "GBP", "JPY", "KRW", "THB", "MYR", "PHP", "INR", "CHF",
  "TRY", "PLN", "SEK", "NOK", "DKK"
];
function keepSupportedRates(sourceRates) {
  const rates = {};
  for (const code of SUPPORTED_RATE_CODES) {
    const value = Number(sourceRates?.[code]);
    if (Number.isFinite(value) && value > 0) rates[code] = value;
  }
  return rates;
}

// Avoid duplicate concurrent API requests when several tabs start together.
let ratesRequestInFlight = null;

function getRates(forceRefresh = false) {
  if (ratesRequestInFlight) return ratesRequestInFlight;
  ratesRequestInFlight = fetchRates(forceRefresh).finally(() => {
    ratesRequestInFlight = null;
  });
  return ratesRequestInFlight;
}

async function fetchRates(forceRefresh = false) {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  const cache = stored[CACHE_KEY];
  const compactRates = keepSupportedRates(cache?.rates);
  const hasUsableCache = Boolean(
    cache && compactRates.USD > 0 && compactRates.VND > 0
  );
  const compactCache = hasUsableCache
    ? {
        rates: compactRates,
        updatedAt: cache.updatedAt || "",
        fetchedAt: Number(cache.fetchedAt) || 0
      }
    : cache;

  if (!forceRefresh && hasUsableCache && Date.now() - compactCache.fetchedAt < CACHE_TTL_MS) {
    // Migrate a previously cached full API payload/metadata to the minimal cache once.
    const oldRateCount = Object.keys(cache.rates || {}).length;
    const compactRateCount = Object.keys(compactRates).length;
    const hasLegacyMetadata = "baseCode" in cache || "nextUpdateAt" in cache || "provider" in cache;
    if (oldRateCount > compactRateCount || hasLegacyMetadata) {
      await chrome.storage.local.set({ [CACHE_KEY]: compactCache });
    }
    return { ...compactCache, fromCache: true, stale: false };
  }

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`API trả về HTTP ${response.status}.`);

    const data = await response.json();
    if (data.result !== "success" || !data.rates || data.base_code !== "USD") {
      throw new Error("API không trả về dữ liệu tỷ giá hợp lệ.");
    }
    const rates = keepSupportedRates(data.rates);
    if (!(rates.VND > 0) || !(rates.IDR > 0) || !(rates.USD > 0)) {
      throw new Error("API thiếu tỷ giá VND, IDR hoặc USD.");
    }

    const result = {
      rates,
      updatedAt: data.time_last_update_utc || new Date().toISOString(),
      fetchedAt: Date.now()
    };
    await chrome.storage.local.set({ [CACHE_KEY]: result });
    return { ...result, fromCache: false, stale: false };
  } catch (error) {
    // Prefer a previously saved rate over breaking page conversion when the API is temporarily down.
    if (hasUsableCache) return { ...compactCache, fromCache: true, stale: true, warning: error.message };
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CURRENCY_RATES") {
    getRates(Boolean(message.forceRefresh))
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});