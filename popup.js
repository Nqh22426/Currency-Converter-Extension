const SETTINGS_KEY = "currencyConverterSettings";
const CACHE_KEY = "currencyRatesCache";
const DEFAULT_SETTINGS = { enabled: true, rateAmount: 1, lastRateCurrencyCode: null };

const enabledInput = document.getElementById("enabled");
const rateAmountInput = document.getElementById("rateAmount");
const rateCurrencyElement = document.getElementById("rateCurrency");
const rateConvertedElement = document.getElementById("rateConverted");
const updatedElement = document.getElementById("updated");
const statusElement = document.getElementById("status");
const refreshButton = document.getElementById("refresh");

let activeCurrency = null;
let activeTabAvailable = false;
let activeExchangeRate = null;
let settings = { ...DEFAULT_SETTINGS };

const STANDARD_MARKERS = {
  IDR: "Rp", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  KRW: "₩", THB: "฿", SGD: "S$", MYR: "RM", PHP: "₱", INR: "₹",
  HKD: "HK$", AUD: "A$", CAD: "C$", TWD: "NT$", NZD: "NZ$",
  BRL: "R$", CHF: "CHF", TRY: "₺", PLN: "zł", SEK: "SEK",
  NOK: "NOK", DKK: "DKK"
};
const NUMBER_FORMATTERS = new Map();

function formatNumber(value, maximumFractionDigits) {
  let formatter = NUMBER_FORMATTERS.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits,
      useGrouping: true
    });
    NUMBER_FORMATTERS.set(maximumFractionDigits, formatter);
  }
  return formatter.format(value);
}

function formatTimestamp(value) {
  if (!value) return "";
  // The API returns RFC-style UTC timestamps such as "... +0000".
  // Keep the same instant and replace the numeric UTC offset with "UTC".
  return String(value).replace(/\s\+0000$/, " UTC");
}

function markerForCode(code, observedMarker) {
  return observedMarker || STANDARD_MARKERS[code] || code;
}

function getRateToVnd(rates, code) {
  if (!rates || !Number.isFinite(Number(rates.VND)) || !Number.isFinite(Number(rates[code]))) return null;
  const sourcePerUsd = Number(rates[code]);
  const vndPerUsd = Number(rates.VND);
  if (sourcePerUsd <= 0 || vndPerUsd <= 0) return null;
  return vndPerUsd / sourcePerUsd;
}

async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = { ...(data[SETTINGS_KEY] || {}) };

  // Migrate from V1.3: discard the old rounding choice. This version always
  // rounds the popup result to whole VND.
  if (Object.prototype.hasOwnProperty.call(saved, "ratePrecision")) {
    delete saved.ratePrecision;
    await chrome.storage.local.set({ [SETTINGS_KEY]: saved });
  }

  settings = { ...DEFAULT_SETTINGS, ...saved };
  enabledInput.checked = settings.enabled !== false;
  const amount = Number(settings.rateAmount);
  rateAmountInput.value = Number.isFinite(amount) && amount > 0 ? String(amount) : "1";
}

async function loadActiveTabCurrency() {
  activeCurrency = null;
  activeTabAvailable = false;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (!tab?.id) throw new Error("Không xác định được tab hiện tại.");

    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CURRENCY_SUMMARY" });
    if (!result?.ok) throw new Error(result?.error || "Không đọc được giá trên trang.");
    activeTabAvailable = true;
    activeCurrency = result.currency || null;

    // On first use after upgrading, initialise the remembered currency. If
    // the detected active-tab currency has changed, reset the amount to 1.
    // If the currency is unchanged, keep the amount the user entered.
    const newCode = activeCurrency?.code || null;
    const previousCode = settings.lastRateCurrencyCode || null;
    if (newCode && newCode !== previousCode) {
      rateAmountInput.value = "1";
      await saveSettings({ rateAmount: 1, lastRateCurrencyCode: newCode });
    }

    return result;
  } catch (error) {
    // Internal Chrome pages and restricted pages do not host content scripts.
    activeTabAvailable = false;
    activeCurrency = null;
    return { ok: false, error: error?.message || "Không thể đọc tab hiện tại." };
  }
}

function renderConvertedAmount() {
  rateConvertedElement.classList.remove("validation-error");
  if (!activeTabAvailable) {
    rateCurrencyElement.textContent = "";
    rateConvertedElement.textContent = "Không đọc được tab hiện tại";
    return;
  }
  if (!activeCurrency) {
    rateCurrencyElement.textContent = "";
    rateConvertedElement.textContent = "Chưa nhận diện được tiền tệ";
    return;
  }
  if (!Number.isFinite(activeExchangeRate) || activeExchangeRate <= 0) {
    rateCurrencyElement.textContent = `${activeCurrency.code} (${markerForCode(activeCurrency.code, activeCurrency.marker)})`;
    rateConvertedElement.textContent = "Chưa có tỷ giá";
    return;
  }

  const amount = Number(rateAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    rateConvertedElement.textContent = "Số tiền phải lớn hơn 0.";
    rateConvertedElement.classList.add("validation-error");
    statusElement.textContent = "";
    return;
  }

  const code = activeCurrency.code;
  const marker = markerForCode(code, activeCurrency.marker);
  const converted = amount * activeExchangeRate;
  rateCurrencyElement.textContent = `${code} (${marker})`;
  // Show the useful rate precision in the main line: whole VND for high-value
  // currencies (for example USD), up to 4 decimals for low-value currencies (for example IDR).
  // The input amount scales the displayed result; when it is 1, this line is the unit exchange rate.
  const maxDigits = activeExchangeRate >= 100 ? 0 : 4;
  rateConvertedElement.textContent = `${formatNumber(converted, maxDigits)} VND`;
}

async function showRate() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const cache = data[CACHE_KEY];
  activeExchangeRate = null;
  if (!activeTabAvailable) {
    rateCurrencyElement.textContent = "";
    rateConvertedElement.textContent = "Không đọc được tab hiện tại";
    updatedElement.textContent = "Hãy mở website bán hàng rồi tải lại trang.";
    return;
  }

  if (!activeCurrency) {
    rateCurrencyElement.textContent = "";
    rateConvertedElement.textContent = "Chưa nhận diện được tiền tệ";
    updatedElement.textContent = cache?.updatedAt ? `Dữ liệu tỷ giá gần nhất: ${formatTimestamp(cache.updatedAt)}` : "";
    return;
  }

  const code = activeCurrency.code;
  if (!cache?.rates) {
    rateCurrencyElement.textContent = `${code} (${markerForCode(code, activeCurrency.marker)})`;
    rateConvertedElement.textContent = "Đang tải tỷ giá...";
    updatedElement.textContent = "";
    return;
  }

  activeExchangeRate = getRateToVnd(cache.rates, code);
  if (activeExchangeRate === null) {
    rateCurrencyElement.textContent = `${code} (${markerForCode(code, activeCurrency.marker)})`;
    rateConvertedElement.textContent = "API chưa có tỷ giá này";
    updatedElement.textContent = `Dữ liệu cập nhật: ${formatTimestamp(cache.updatedAt) || "không rõ"}`;
    return;
  }

  renderConvertedAmount();
  updatedElement.textContent = `Dữ liệu cập nhật: ${formatTimestamp(cache.updatedAt) || "không rõ"}`;
}

async function saveSettings(patch) {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const previous = { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  settings = { ...previous, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

enabledInput.addEventListener("change", async () => {
  await saveSettings({ enabled: enabledInput.checked });
  statusElement.textContent = enabledInput.checked
    ? "Đã bật. Nếu tab chưa đổi, hãy tải lại trang."
    : "Đã tắt quy đổi; giá gốc được giữ nguyên.";
});

rateAmountInput.addEventListener("input", renderConvertedAmount);
rateAmountInput.addEventListener("change", async () => {
  const amount = Number(rateAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    renderConvertedAmount();
    statusElement.textContent = "";
    return;
  }
  await saveSettings({ rateAmount: amount });
  statusElement.textContent = "Đã cập nhật số tiền quy đổi.";
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  statusElement.textContent = "Đang cập nhật tỷ giá...";
  try {
    await loadActiveTabCurrency();
    const result = await chrome.runtime.sendMessage({ type: "GET_CURRENCY_RATES", forceRefresh: true });
    if (!result?.ok) throw new Error(result?.error || "Không lấy được tỷ giá.");
    await showRate();
    statusElement.textContent = result.stale
      ? `Không tải được dữ liệu mới; đang dùng tỷ giá đã lưu. ${result.warning || ""}`
      : "Đã cập nhật tỷ giá.";
  } catch (error) {
    statusElement.textContent = `Lỗi: ${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
});

(async () => {
  await loadSettings();
  await loadActiveTabCurrency();
  await showRate();

  const data = await chrome.storage.local.get(CACHE_KEY);
  if (!data[CACHE_KEY]) refreshButton.click();
})();
