(() => {
  const DEFAULT_SETTINGS = {
    enabled: true
  };

  // Symbols such as $ and ¥ are ambiguous internationally. In this MVP,
  // a bare $ is interpreted as USD and a bare ¥ as JPY. Explicit codes/prefixes win.
  const CURRENCY_RULES = [
    { code: "IDR", pattern: /(?:\bIDR\b|\bRp\.?)/i, noMinorUnits: true },
    { code: "TWD", pattern: /(?:NT\$|\bTWD\b)/i },
    { code: "HKD", pattern: /(?:HK\$|\bHKD\b)/i },
    { code: "NZD", pattern: /(?:NZ\$|\bNZD\b)/i },
    { code: "AUD", pattern: /(?:A\$|\bAUD\b)/i },
    { code: "CAD", pattern: /(?:C\$|\bCAD\b)/i },
    { code: "SGD", pattern: /(?<!U)S\$|\bSGD\b/i },
    { code: "BRL", pattern: /(?:R\$|\bBRL\b)/i },
    { code: "CNY", pattern: /(?:CN¥|\bCNY\b|\bRMB\b|元)/i },
    { code: "USD", pattern: /(?:US\$|\bUSD\b|\$)/i },
    { code: "EUR", pattern: /(?:€|\bEUR\b)/i },
    { code: "GBP", pattern: /(?:£|\bGBP\b)/i },
    { code: "JPY", pattern: /(?:JP¥|\bJPY\b|¥)/i, noMinorUnits: true },
    { code: "KRW", pattern: /(?:₩|\bKRW\b)/i, noMinorUnits: true },
    { code: "THB", pattern: /(?:฿|\bTHB\b)/i },
    { code: "MYR", pattern: /(?:\bMYR\b|\bRM\b)/i },
    { code: "PHP", pattern: /(?:₱|\bPHP\b)/i },
    { code: "INR", pattern: /(?:₹|\bINR\b)/i },
    { code: "CHF", pattern: /\bCHF\b/i },
    { code: "TRY", pattern: /(?:₺|\bTRY\b)/i },
    { code: "PLN", pattern: /(?:zł|\bPLN\b)/i },
    { code: "SEK", pattern: /\bSEK\b/i },
    { code: "NOK", pattern: /\bNOK\b/i },
    { code: "DKK", pattern: /\bDKK\b/i },
    { code: "VND", pattern: /(?:₫|\bVND\b)/i, targetOnly: true }
  ];

  // Frequently reused lookups and formatters are constructed once per tab.
  const NO_MINOR_UNIT_CURRENCIES = new Set();
  for (const rule of CURRENCY_RULES) {
    if (rule.noMinorUnits) NO_MINOR_UNIT_CURRENCIES.add(rule.code);
  }
  const IGNORED_TAGS = new Set(["script", "style", "noscript", "textarea", "input", "select", "option", "svg", "canvas"]);
  const UI_SELECTOR = '[data-currency-converter-ui="true"]';
  const MAX_PRICE_TEXT_LENGTH = 120;
  const MAX_PENDING_ROOTS = 80;
  const VND_FORMATTER = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0, useGrouping: true });

  let settings = { ...DEFAULT_SETTINGS };
  let ratesFromUsd = null;
  let pendingRoots = new Set();
  let scanQueued = false;
  let observer = null;

  function cleanText(element) {
    // Avoid cloneNode/querySelectorAll/remove allocations for every price node.
    // The extension's own suffix contains VND only and cannot replace a source
    // currency match such as Rp, $, €, USD or IDR in the original price text.
    return element ? (element.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function identifyCurrency(text) {
    for (const rule of CURRENCY_RULES) {
      if (rule.targetOnly) continue;
      const match = rule.pattern.exec(text);
      if (match) return { rule, marker: match[0], markerIndex: match.index };
    }
    return null;
  }

  function normaliseAmount(raw, currency, preserveCoefficientDecimal = false) {
    let value = String(raw || "").replace(/[\s'’]/g, "");
    if (!value || !/\d/.test(value)) return null;

    if (NO_MINOR_UNIT_CURRENCIES.has(currency) && !preserveCoefficientDecimal) {
      value = value.replace(/[.,]/g, "");
    } else {
      const lastDot = value.lastIndexOf(".");
      const lastComma = value.lastIndexOf(",");
      const lastSeparator = Math.max(lastDot, lastComma);
      if (lastSeparator >= 0) {
        const digitsAfter = value.length - lastSeparator - 1;
        const hasBothSeparators = lastDot >= 0 && lastComma >= 0;
        if (hasBothSeparators) {
          // The right-most separator is treated as the decimal separator.
          value = value.slice(0, lastSeparator).replace(/[.,]/g, "") + "." + value.slice(lastSeparator + 1).replace(/[.,]/g, "");
        } else if (digitsAfter === 3 || digitsAfter === 0) {
          value = value.replace(/[.,]/g, "");
        } else {
          const integerPart = value.slice(0, lastSeparator).replace(/[.,]/g, "");
          const fractionalPart = value.slice(lastSeparator + 1).replace(/[.,]/g, "");
          value = `${integerPart}.${fractionalPart}`;
        }
      }
    }

    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function getNumberNearMarker(text, currencyMatch) {
    const markerStart = currencyMatch.markerIndex;
    const markerEnd = markerStart + currencyMatch.marker.length;
    const before = text.slice(0, markerStart);
    const after = text.slice(markerEnd);

    // Prefix currencies: Rp 250.000, $25, USD 4.67 triệu.
    const afterMatch = after.match(/^\s*([0-9][0-9.,\s'’]*)/);
    if (afterMatch && /\d/.test(afterMatch[1])) {
      const raw = afterMatch[1].trim();
      const relativeStart = afterMatch[0].indexOf(raw);
      return { raw, end: markerEnd + relativeStart + raw.length };
    }

    // Suffix currencies: 250.000 Rp, 4.67 triệu USD.
    const numberPattern = /[0-9][0-9.,\s'’]*/g;
    let lastCandidate = null;
    let candidateMatch;
    while ((candidateMatch = numberPattern.exec(before)) !== null) {
      const raw = candidateMatch[0].trim();
      if (!raw) continue;
      const relativeStart = candidateMatch.index + candidateMatch[0].indexOf(raw);
      lastCandidate = {
        raw,
        end: relativeStart + raw.length
      };
    }
    return lastCandidate;
  }

  // Common Vietnamese magnitude words used after a number in text prices.
  // Longest phrases must be matched before their shorter suffixes.
  const AMOUNT_SCALE_RULES = [
    { pattern: /^(?:nghìn|ngàn)\s+(?:tỷ|tỉ)(?=$|\s|[.,;:()])/i, multiplier: 1e12 },
    { pattern: /^triệu\s+(?:tỷ|tỉ)(?=$|\s|[.,;:()])/i, multiplier: 1e15 },
    { pattern: /^trăm\s+(?:tỷ|tỉ)(?=$|\s|[.,;:()])/i, multiplier: 1e11 },
    { pattern: /^chục\s+(?:tỷ|tỉ)(?=$|\s|[.,;:()])/i, multiplier: 1e10 },
    { pattern: /^trăm\s+triệu\b/i, multiplier: 1e8 },
    { pattern: /^chục\s+triệu\b/i, multiplier: 1e7 },
    { pattern: /^nghìn\s+triệu\b/i, multiplier: 1e9 },
    { pattern: /^ngàn\s+triệu\b/i, multiplier: 1e9 },
    { pattern: /^trăm\s+(?:nghìn|ngàn)\b/i, multiplier: 1e5 },
    { pattern: /^chục\s+(?:nghìn|ngàn)\b/i, multiplier: 1e4 },
    { pattern: /^trăm\s+vạn\b/i, multiplier: 1e6 },
    { pattern: /^chục\s+vạn\b/i, multiplier: 1e5 },
    { pattern: /^nghìn\s+vạn\b/i, multiplier: 1e7 },
    { pattern: /^ngàn\s+vạn\b/i, multiplier: 1e7 },
    { pattern: /^nghìn\b/i, multiplier: 1e3 },
    { pattern: /^ngàn\b/i, multiplier: 1e3 },
    { pattern: /^triệu\b/i, multiplier: 1e6 },
    { pattern: /^(?:tỷ|tỉ)(?=$|\s|[.,;:()])/i, multiplier: 1e9 },
    { pattern: /^vạn\b/i, multiplier: 1e4 },
    { pattern: /^trăm\b/i, multiplier: 1e2 },
    { pattern: /^chục\b/i, multiplier: 1e1 }
  ];

  function getAmountScaleMultiplier(text, amountMatch, currencyMatch) {
    if (!amountMatch) return 1;

    // For suffix currency, inspect only the phrase between the amount and
    // currency marker. For prefix currency, inspect a short phrase following
    // the amount. This avoids picking a scale word from unrelated page text.
    const markerStart = currencyMatch.markerIndex;
    let phrase;
    if (amountMatch.end <= markerStart) {
      phrase = text.slice(amountMatch.end, markerStart);
    } else {
      phrase = text.slice(amountMatch.end, Math.min(text.length, amountMatch.end + 48));
    }

    // Ignore opening punctuation such as "(", but require the scale to be the
    // first meaningful word after the number.
    phrase = phrase.replace(/^[\s([{,;:–—-]+/, "");
    for (const rule of AMOUNT_SCALE_RULES) {
      if (rule.pattern.test(phrase)) return rule.multiplier;
    }
    return 1;
  }
  function parsePrice(text) {
    if (!text || text.length > MAX_PRICE_TEXT_LENGTH) return null;
    const currency = identifyCurrency(text);
    if (!currency) return null;

    const amountMatch = getNumberNearMarker(text, currency);
    if (!amountMatch) return null;

    const scaleMultiplier = getAmountScaleMultiplier(text, amountMatch, currency);
    const coefficient = normaliseAmount(
      amountMatch.raw,
      currency.rule.code,
      scaleMultiplier !== 1
    );
    if (!coefficient) return null;

    const amount = coefficient * scaleMultiplier;
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return {
      currency: currency.rule.code,
      amount,
      marker: currency.marker
    };
  }

  function getRate(fromCode) {
    if (!ratesFromUsd) return null;
    const fromPerUsd = Number(ratesFromUsd[fromCode]);
    const vndPerUsd = Number(ratesFromUsd.VND);
    if (!Number.isFinite(fromPerUsd) || !Number.isFinite(vndPerUsd) ||
        fromPerUsd <= 0 || vndPerUsd <= 0) return null;
    return vndPerUsd / fromPerUsd;
  }

  function formatVnd(value) {
    return VND_FORMATTER.format(Math.round(value)) + " ₫";
  }

  function isIgnoredElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    if (IGNORED_TAGS.has(element.localName)) return true;
    if (element.closest(UI_SELECTOR)) return true;
    if (element.isContentEditable) return true;
    return false;
  }

  // Return parsed price data once per candidate rather than parsing the same
  // node multiple times for validation, conversion and currency detection.
  function getPriceCandidate(element) {
    if (isIgnoredElement(element)) return null;
    const text = cleanText(element);
    if (!text || text.length > MAX_PRICE_TEXT_LENGTH) return null;
    const parsed = parsePrice(text);
    if (!parsed) return null;

    // Prefer the smallest element containing a price over its card/container.
    for (const child of element.children) {
      if (child.matches?.(UI_SELECTOR) || child.closest?.(UI_SELECTOR)) continue;
      const childText = cleanText(child);
      if (childText && childText.length <= MAX_PRICE_TEXT_LENGTH && parsePrice(childText)) {
        return null;
      }
    }
    return { parsed };
  }

  function removeElementLabel(element) {
    if (!element || element.dataset.currencyConverted !== "true") return;
    element.querySelectorAll(UI_SELECTOR).forEach((label) => label.remove());
    delete element.dataset.currencyConverted;
    delete element.dataset.currencySource;
  }

  function styleLabel(label) {
    if (label.dataset.currencyConverterStyled === "true") return;
    // Style once; repeated style writes can trigger needless mutations/layout.
    label.style.cssText = "display:inline;font-size:0.88em;font-weight:600;color:#087443;white-space:normal;vertical-align:middle;line-height:1.35;margin-left:0.35em;overflow-wrap:normal;";
    label.dataset.currencyConverterStyled = "true";
  }

  function processElement(element) {
    if (!settings.enabled || !ratesFromUsd || !element) return;
    const candidate = getPriceCandidate(element);
    if (!candidate) {
      removeElementLabel(element);
      return;
    }

    const parsed = candidate.parsed;
    const rate = getRate(parsed.currency);
    if (!rate) {
      removeElementLabel(element);
      return;
    }

    let label = null;
    for (const child of element.children) {
      if (child.dataset?.currencyConverterUi === "true") {
        label = child;
        break;
      }
    }
    if (!label) {
      label = document.createElement("span");
      label.dataset.currencyConverterUi = "true";
      label.setAttribute("aria-label", "Giá quy đổi tham khảo sang VND");
      element.appendChild(label);
    }

    styleLabel(label);
    const convertedText = `≈ ${formatVnd(parsed.amount * rate)}`;
    // Avoid replacing the label's text node if the displayed value is unchanged.
    if (label.textContent !== convertedText) label.textContent = convertedText;

    element.dataset.currencyConverted = "true";
    element.dataset.currencySource = parsed.currency;
  }

  function scan(root = document.body) {
    if (!settings.enabled || !ratesFromUsd || !root) return;
    if (root.nodeType === Node.ELEMENT_NODE) processElement(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.dataset?.currencyConverterUi === "true" || isIgnoredElement(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) processElement(node);
  }

  function addPendingRoot(root) {
    if (root?.nodeType !== Node.ELEMENT_NODE) root = root?.parentElement || document.body;
    if (!root?.isConnected) return;

    if (root === document.body || root === document.documentElement) {
      pendingRoots.clear();
      pendingRoots.add(root);
      return;
    }

    // Keep only outermost roots so a single framework render does not queue
    // overlapping scans for a parent, children and grandchildren.
    for (const existing of pendingRoots) {
      if (existing === root || existing.contains(root)) return;
    }
    for (const existing of pendingRoots) {
      if (root.contains(existing)) pendingRoots.delete(existing);
    }
    pendingRoots.add(root);

    if (pendingRoots.size > MAX_PENDING_ROOTS && document.body) {
      pendingRoots.clear();
      pendingRoots.add(document.body);
    }
  }

  function queueScan(root) {
    addPendingRoot(root);
    if (scanQueued || pendingRoots.size === 0) return;

    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      for (const rootNode of roots) {
        if (rootNode.isConnected) scan(rootNode);
      }
    });
  }

  async function loadRates() {
    const result = await chrome.runtime.sendMessage({ type: "GET_CURRENCY_RATES" });
    if (!result?.ok) throw new Error(result?.error || "Không lấy được tỷ giá.");
    ratesFromUsd = result.rates;
    scan(document.body);
  }

  function getPageCurrencySummary() {
    if (!document.body) return { currency: null };

    const counts = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.dataset?.currencyConverterUi === "true" || isIgnoredElement(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const candidate = getPriceCandidate(node);
      if (!candidate) continue;

      const parsed = candidate.parsed;
      let item = counts.get(parsed.currency);
      if (!item) {
        item = { code: parsed.currency, count: 0, markers: new Map() };
        counts.set(parsed.currency, item);
      }
      item.count += 1;

      const marker = parsed.marker || parsed.currency;
      item.markers.set(marker, (item.markers.get(marker) || 0) + 1);
    }

    let mostCommon = null;
    for (const item of counts.values()) {
      if (mostCommon && item.count <= mostCommon.count) continue;

      let marker = item.code;
      let markerCount = -1;
      for (const [candidateMarker, count] of item.markers) {
        if (count > markerCount) {
          marker = candidateMarker;
          markerCount = count;
        }
      }
      mostCommon = { code: item.code, count: item.count, marker };
    }

    return { currency: mostCommon };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "GET_PAGE_CURRENCY_SUMMARY") return false;
    try {
      sendResponse({ ok: true, ...getPageCurrencySummary() });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Không đọc được tiền tệ trên trang." });
    }
    return false;
  });

  function removeConvertedLabels() {
    document.querySelectorAll(UI_SELECTOR).forEach((label) => label.remove());
    document.querySelectorAll("[data-currency-converted]").forEach((element) => {
      delete element.dataset.currencyConverted;
      delete element.dataset.currencySource;
    });
  }

  function startObservingPage() {
    if (observer || !settings.enabled || !ratesFromUsd || !document.documentElement) return;

    observer = new MutationObserver((mutations) => {
      if (!settings.enabled || !ratesFromUsd) return;
      for (const mutation of mutations) {
        const targetElement = mutation.target?.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target?.parentElement;

        // Ignore changes inside our own output.
        if (targetElement?.closest(UI_SELECTOR)) continue;

        if (mutation.type === "childList") {
          let siteChanged = false;
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches?.(UI_SELECTOR) || node.closest?.(UI_SELECTOR)) continue;
              siteChanged = true;
              queueScan(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
              siteChanged = true;
              queueScan(mutation.target);
            }
          }
          for (const node of mutation.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.(UI_SELECTOR) || node.closest?.(UI_SELECTOR))) continue;
            siteChanged = true;
          }
          if (siteChanged && targetElement?.dataset?.currencyConverted === "true") {
            queueScan(targetElement);
          }
        } else if (mutation.type === "characterData") {
          queueScan(targetElement);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopObservingPage() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    pendingRoots.clear();
    // Any already queued frame will see an empty set and exit without scanning.
  }

  async function init() {
    const stored = await chrome.storage.local.get("currencyConverterSettings");
    settings = { ...DEFAULT_SETTINGS, ...(stored.currencyConverterSettings || {}) };
    if (settings.enabled) {
      try {
        await loadRates();
        startObservingPage();
      } catch (error) {
        console.warn("[Currency to VND] Không lấy được tỷ giá:", error.message);
      }
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.currencyConverterSettings) return;
    const previousEnabled = settings.enabled;
    settings = { ...DEFAULT_SETTINGS, ...(changes.currencyConverterSettings.newValue || {}) };

    // Rate calculator input/rounding preferences belong to the popup only;
    // rescan the page only if the conversion enable/disable state changes.
    if (previousEnabled === settings.enabled) return;

    if (!settings.enabled) {
      stopObservingPage();
      removeConvertedLabels();
      return;
    }

    if (ratesFromUsd) {
      scan(document.body);
      startObservingPage();
    } else {
      loadRates()
        .then(startObservingPage)
        .catch((error) => console.warn("[Currency to VND]", error.message));
    }
  });

  init();
})();