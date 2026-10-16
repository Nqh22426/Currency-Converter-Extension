const SETTINGS_KEY = "currencyConverterSettings";
const CACHE_KEY = "currencyRatesCache";
const DEFAULT_SETTINGS = {
  enabled: true,
  rateAmount: 1,
  lastRateCurrencyCode: null
};

const enabledInput = document.getElementById("enabled");
const rateAmountInput = document.getElementById("rateAmount");
const rateCurrencyElement = document.getElementById("rateCurrency");
const manualCurrencyInput = document.getElementById("manualCurrency");
const rateLineElement = document.getElementById("rateLine");
const manualNoticeTitle = document.getElementById("manualNoticeTitle");
const rateConvertedElement = document.getElementById("rateConverted");
const updatedElement = document.getElementById("updated");
const statusElement = document.getElementById("status");
const refreshButton = document.getElementById("refresh");

let activeCurrency = null;
let activeTabAvailable = false;
let activeExchangeRate = null;
let cachedRates = null;
let settings = { ...DEFAULT_SETTINGS };

// Keep this list aligned with the source currencies supported in content.js.
// VND is intentionally omitted because the target currency is fixed to VND.
const MANUAL_CURRENCIES = [
  "USD", "IDR", "EUR", "GBP", "THB", "MYR", "SGD", "AUD", "CAD", "CNY",
  "JPY", "KRW", "TWD", "HKD", "NZD", "BRL", "PHP", "INR", "CHF", "TRY",
  "PLN", "SEK", "NOK", "DKK"
];

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

function populateManualCurrencies() {
  const fragment = document.createDocumentFragment();

  // Leave the source currency unselected every time the popup opens.
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Loại tiền tệ";
  placeholder.disabled = true;
  placeholder.selected = true;
  fragment.appendChild(placeholder);

  for (const code of MANUAL_CURRENCIES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} (${STANDARD_MARKERS[code] || code})`;
    fragment.appendChild(option);
  }

  manualCurrencyInput.replaceChildren(fragment);
  manualCurrencyInput.value = "";
}

function isManualMode() {
  // Use manual conversion only when the page cannot be read or no supported
  // source currency was detected. Detected shopping pages keep the old UI.
  return !activeTabAvailable || !activeCurrency;
}

function setTextIfChanged(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function updateManualModeUI() {
  const manualMode = isManualMode();
  if (document.body.classList.contains("manual-converter-mode") !== manualMode) {
    document.body.classList.toggle("manual-converter-mode", manualMode);
  }
  if (rateLineElement.classList.contains("manual-mode") !== manualMode) {
    rateLineElement.classList.toggle("manual-mode", manualMode);
  }
  if (manualCurrencyInput.hidden === manualMode) manualCurrencyInput.hidden = !manualMode;
  if (rateCurrencyElement.hidden !== manualMode) rateCurrencyElement.hidden = manualMode;
  if (manualNoticeTitle.hidden === manualMode) manualNoticeTitle.hidden = !manualMode;

  if (manualMode) {
    setTextIfChanged(
      manualNoticeTitle,
      activeTabAvailable ? "Chưa nhận diện được tiền tệ" : "Không đọc được tab hiện tại"
    );
    setTextIfChanged(
      updatedElement,
      activeTabAvailable
        ? "Trang hiện tại chưa có giá tiền được nhận diện. Bạn có thể quy đổi thủ công."
        : "Hãy mở website bán hàng rồi tải lại trang."
    );
  }
  return manualMode;
}

function getRateToVnd(rates, code) {
  if (!rates) return null;
  const sourcePerUsd = Number(rates[code]);
  const vndPerUsd = Number(rates.VND);
  if (!Number.isFinite(sourcePerUsd) || !Number.isFinite(vndPerUsd) ||
      sourcePerUsd <= 0 || vndPerUsd <= 0) return null;
  return vndPerUsd / sourcePerUsd;
}

async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = { ...(data[SETTINGS_KEY] || {}) };

  // Remove obsolete preferences from earlier builds.
  let settingsCleaned = false;
  for (const obsoleteKey of ["ratePrecision", "manualCurrencyCode"]) {
    if (Object.prototype.hasOwnProperty.call(saved, obsoleteKey)) {
      delete saved[obsoleteKey];
      settingsCleaned = true;
    }
  }
  if (settingsCleaned) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: saved });
  }

  settings = { ...DEFAULT_SETTINGS, ...saved };
  enabledInput.checked = settings.enabled !== false;
  const amount = Number(settings.rateAmount);
  rateAmountInput.value = Number.isFinite(amount) && amount > 0 ? String(amount) : "1";
  populateManualCurrencies();
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
  const manualMode = updateManualModeUI();
  const code = manualMode ? manualCurrencyInput.value : activeCurrency?.code;

  if (!code) {
    // VND remains fixed as the target, but do not calculate until a source
    // currency has been selected manually.
    setTextIfChanged(rateConvertedElement, manualMode ? "  ...... VND" : "Chưa nhận diện được tiền tệ");
    return;
  }

  const rate = manualMode ? getRateToVnd(cachedRates, code) : activeExchangeRate;
  if (!Number.isFinite(rate) || rate <= 0) {
    setTextIfChanged(rateConvertedElement, cachedRates ? "API chưa có tỷ giá này" : "Đang tải tỷ giá...");
    return;
  }

  const amount = Number(rateAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    setTextIfChanged(rateConvertedElement, "Số tiền phải lớn hơn 0.");
    rateConvertedElement.classList.add("validation-error");
    statusElement.textContent = "";
    return;
  }

  if (!manualMode) {
    const marker = markerForCode(activeCurrency.code, activeCurrency.marker);
    rateCurrencyElement.textContent = `${activeCurrency.code} (${marker})`;
  }

  const converted = amount * rate;
  // Preserve V1.6 display precision: low-value units keep up to 4 decimals;
  // high-value units such as USD show whole VND.
  const maxDigits = rate >= 100 ? 0 : 4;
  setTextIfChanged(rateConvertedElement, `${formatNumber(converted, maxDigits)} VND`);
}

async function showRate() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const cache = data[CACHE_KEY];
  cachedRates = cache?.rates || null;
  activeExchangeRate = null;

  if (isManualMode()) {
    renderConvertedAmount();
    return Boolean(cachedRates);
  }

  const code = activeCurrency.code;
  if (!cachedRates) {
    rateCurrencyElement.textContent = `${code} (${markerForCode(code, activeCurrency.marker)})`;
    rateConvertedElement.textContent = "Đang tải tỷ giá...";
    setTextIfChanged(updatedElement, "");
    return false;
  }

  activeExchangeRate = getRateToVnd(cachedRates, code);
  if (activeExchangeRate === null) {
    rateCurrencyElement.textContent = `${code} (${markerForCode(code, activeCurrency.marker)})`;
    rateConvertedElement.textContent = "API chưa có tỷ giá này";
    setTextIfChanged(updatedElement, `Dữ liệu cập nhật: ${formatTimestamp(cache.updatedAt) || "không rõ"}`);
    return true;
  }

  renderConvertedAmount();
  setTextIfChanged(updatedElement, `Dữ liệu cập nhật: ${formatTimestamp(cache.updatedAt) || "không rõ"}`);
  return true;
}

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

enabledInput.addEventListener("change", async () => {
  await saveSettings({ enabled: enabledInput.checked });
  statusElement.textContent = enabledInput.checked
    ? "Đã bật. Nếu tab chưa đổi, hãy tải lại trang."
    : "Đã tắt quy đổi; giá gốc được giữ nguyên.";
});

manualCurrencyInput.addEventListener("change", () => {
  renderConvertedAmount();
  // Currency selection updates the result immediately without a status toast.
  statusElement.textContent = "";
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
  const hasCachedRates = await showRate();
  if (!hasCachedRates) refreshButton.click();
})();