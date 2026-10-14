const API_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_KEY = "currencyRatesCache";
// The open-access rate feed refreshes daily, so keep a successful response for 24 hours.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
  const hasUsableCache = Boolean(
    cache && cache.rates && typeof cache.rates.USD === "number" &&
    typeof cache.rates.VND === "number"
  );

  if (!forceRefresh && hasUsableCache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ...cache, fromCache: true, stale: false };
  }

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`API trả về HTTP ${response.status}.`);

    const data = await response.json();
    if (data.result !== "success" || !data.rates || data.base_code !== "USD") {
      throw new Error("API không trả về dữ liệu tỷ giá hợp lệ.");
    }
    if (!Number.isFinite(Number(data.rates.VND)) || !Number.isFinite(Number(data.rates.IDR))) {
      throw new Error("API thiếu tỷ giá VND hoặc IDR.");
    }

    const result = {
      baseCode: data.base_code,
      rates: data.rates,
      updatedAt: data.time_last_update_utc || new Date().toISOString(),
      nextUpdateAt: data.time_next_update_utc || "",
      fetchedAt: Date.now(),
      provider: "ExchangeRate-API Open Access"
    };
    await chrome.storage.local.set({ [CACHE_KEY]: result });
    return { ...result, fromCache: false, stale: false };
  } catch (error) {
    // Prefer a previously saved rate over breaking page conversion when the API is temporarily down.
    if (hasUsableCache) return { ...cache, fromCache: true, stale: true, warning: error.message };
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
