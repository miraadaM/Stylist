import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnvFile(join(root, ".env"));
const port = Number(process.env.PORT || 8765);
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const geminiTimeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 12_000);
const tryOnApiUrl = process.env.PHOTTA_API_URL || process.env.TRYON_API_URL;
const tryOnApiKey = process.env.PHOTTA_API_KEY || process.env.TRYON_API_KEY;
const phottaWidgetKey = process.env.PHOTTA_WIDGET_KEY || process.env.PHOTTA_PUBLIC_KEY || "";
const phottaProductType = process.env.PHOTTA_PRODUCT_TYPE || "apparel";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const storeBlueprint = [
  ["Top", "polished top", 0.2, "top"],
  ["Bottom", "anchor bottom", 0.25, "bottom"],
  ["Layer", "finishing layer", 0.22, "layer"],
  ["Shoes", "comfortable shoes", 0.2, "shoes"],
  ["Accessory", "styling detail", 0.13, "accessory"],
];

function loadEnvFile(path) {
  try {
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional. Missing keys keep the app in demo/fallback mode.
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

function scrubSecretText(text = "") {
  const secret = process.env.GEMINI_API_KEY || "";
  return secret ? text.replaceAll(secret, "[hidden-api-key]") : text;
}

function providerError(message, details = {}) {
  const error = new Error(scrubSecretText(message));
  Object.assign(error, details);
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function titleCase(text = "") {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function firstPhrase(text = "") {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.split(",")[0].slice(0, 54) : "Any occasion";
}

function styleWord(variant = "default") {
  if (variant === "casual") return "relaxed";
  if (variant === "dressy") return "elevated";
  if (variant === "comfort") return "comfortable";
  return "balanced";
}

function cleanList(text = "") {
  return text
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKeyword(text = "", words = []) {
  return words.some((word) => {
    const boundary = `(^|[^a-z0-9])${escapeRegExp(word)}($|[^a-z0-9])`;
    return new RegExp(boundary, "i").test(text);
  });
}

function classifyClothingItem(label = "") {
  const normalized = label.toLowerCase();
  const matches = (words) => hasKeyword(normalized, words);

  if (matches(["pajama", "pajamas", "pyjama", "pyjamas", "pijama", "pijamas", "sleepwear", "nightgown", "nightgowns", "robe", "robes"])) return "not-outfit";
  if (matches(["dress", "dresses", "jumpsuit", "jumpsuits", "romper", "rompers", "playsuit", "playsuits", "suit set", "matching set"])) return "one-piece";
  if (matches(["shoe", "shoes", "flat", "flats", "loafer", "loafers", "sneaker", "sneakers", "heel", "heels", "boot", "boots", "sandal", "sandals", "pump", "pumps", "mule", "mules"])) return "shoes";
  if (matches(["bag", "bags", "purse", "purses", "tote", "totes", "clutch", "clutches", "belt", "belts", "scarf", "scarves", "hat", "hats", "watch", "watches", "earring", "earrings", "necklace", "necklaces", "bracelet", "bracelets", "ring", "rings", "hoop", "hoops", "sunglasses"])) return "accessory";
  if (matches(["cardigan", "cardigans", "jacket", "jackets", "blazer", "blazers", "coat", "coats", "trench", "trenches", "trench coat", "vest", "vests", "overshirt", "overshirts", "layer", "layers"])) return "layer";
  if (matches(["skirt", "skirts", "jean", "jeans", "pant", "pants", "trouser", "trousers", "short", "shorts", "legging", "leggings", "bottom", "bottoms", "culotte", "culottes"])) return "bottom";
  if (matches(["shirt", "shirts", "tee", "tees", "t-shirt", "t-shirts", "top", "tops", "blouse", "blouses", "sweater", "sweaters", "hoodie", "hoodies", "tank", "tanks", "tank top", "camisole", "camisoles", "bodysuit", "bodysuits", "polo", "polos", "knit", "knits"])) return "top";
  return "unknown";
}

function shapeForLabel(label = "") {
  const category = classifyClothingItem(label);
  if (category === "shoes") return "shoes";
  if (category === "accessory") return "accessory";
  if (category === "layer") return "layer";
  if (category === "bottom") return "bottom";
  return "top";
}

function validateClosetItems(items) {
  const classified = items.map((item) => ({ item, category: classifyClothingItem(item) }));
  const relevant = classified.filter(({ category }) => !["unknown", "not-outfit"].includes(category));
  const unrelated = classified.filter(({ category }) => category === "unknown").map(({ item }) => item);
  const notOutfit = classified.filter(({ category }) => category === "not-outfit").map(({ item }) => item);
  const categories = new Set(relevant.map(({ category }) => category));
  const hasOnePiece = categories.has("one-piece");
  const missing = [];
  const categoryCounts = relevant.reduce((counts, { category }) => {
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const duplicates = Object.entries(categoryCounts)
    .filter(([category, count]) => count > 1 && ["top", "bottom", "shoes", "one-piece"].includes(category))
    .map(([category]) => category);

  if (!categories.has("top") && !hasOnePiece) missing.push("top");
  if (!categories.has("bottom") && !hasOnePiece) missing.push("bottom");
  if (!categories.has("shoes")) missing.push("shoes");

  const alerts = [];
  if (unrelated.length) {
    alerts.push(`These do not look like clothing pieces: ${unrelated.slice(0, 4).join(", ")}.`);
  }
  if (notOutfit.length) {
    alerts.push(`These are clothing, but they do not fit a styled outfit here: ${notOutfit.slice(0, 4).join(", ")}.`);
  }
  if (duplicates.length) {
    alerts.push(`You entered multiple ${duplicates.join(" and ")} pieces. I picked one so the result does not pretend duplicates make a complete outfit.`);
  }
  if (!relevant.length) {
    alerts.push("Add real wardrobe items such as a white shirt, black trousers, a skirt, loafers, sneakers, or a dress.");
  } else if (missing.length) {
    alerts.push(`Your closet list is missing: ${missing.join(", ")}. Add those pieces for a complete outfit.`);
  }

  return { classified, relevant, unrelated, notOutfit, missing, alerts };
}

function closetPlaceholder(category, index) {
  const names = {
    top: "Add A Top",
    bottom: "Add A Bottom",
    shoes: "Add Shoes",
  };
  return {
    label: "Missing",
    name: names[category] || `Add ${titleCase(category)}`,
    detail: "Needed",
    actionText: "Missing piece",
    price: 0,
    link: "",
    shape: category === "bottom" ? "bottom" : category === "shoes" ? "shoes" : "top",
    color: "#8a665d",
    artBg: ["#fff6e2", "#f4ded8", "#edf4f2"][index % 3],
  };
}

function outfitItemsFromClosetValidation(validation) {
  const byCategory = validation.relevant.reduce((groups, entry) => {
    if (!groups[entry.category]) groups[entry.category] = [];
    groups[entry.category].push(entry.item);
    return groups;
  }, {});
  const selected = [];

  if (byCategory["one-piece"]?.[0]) {
    selected.push({ item: byCategory["one-piece"][0], category: "one-piece" });
  } else {
    if (byCategory.top?.[0]) selected.push({ item: byCategory.top[0], category: "top" });
    if (byCategory.bottom?.[0]) selected.push({ item: byCategory.bottom[0], category: "bottom" });
  }

  if (byCategory.layer?.[0]) selected.push({ item: byCategory.layer[0], category: "layer" });
  if (byCategory.shoes?.[0]) selected.push({ item: byCategory.shoes[0], category: "shoes" });
  if (byCategory.accessory?.[0]) selected.push({ item: byCategory.accessory[0], category: "accessory" });

  const realItems = selected.map(({ item, category }, index) => ({
    label: "Owned",
    name: titleCase(item),
    price: 0,
    link: "",
    shape: category === "one-piece" ? "top" : shapeForLabel(item),
    color: ["#b9895e", "#0f766e", "#d2604d", "#343a3f", "#bd8427", "#78917f"][index % 6],
    artBg: ["#efe3d6", "#edf4f2", "#f4ded8", "#f1f1ee", "#f5ead7", "#e8eee9"][index % 6],
  }));

  const missingItems = validation.missing.map((category, index) => closetPlaceholder(category, index));
  return [...realItems, ...missingItems];
}

function googleSearchLink(stores, itemName) {
  const firstStore = stores.split(",").map((store) => store.trim()).filter(Boolean)[0] || "online store";
  return `https://www.google.com/search?q=${encodeURIComponent(`${firstStore} ${itemName}`)}`;
}

function preferredStores(stores = "") {
  return stores
    .split(",")
    .map((store) => store.trim())
    .filter(Boolean);
}

function occasionSearchTerm(occasion = "") {
  const normalized = occasion.toLowerCase();
  if (normalized.includes("wedding")) return "wedding guest";
  if (normalized.includes("interview")) return "interview outfit";
  if (normalized.includes("work") || normalized.includes("office") || normalized.includes("intern")) return "business casual";
  if (normalized.includes("date")) return "date night";
  if (normalized.includes("birthday")) return "birthday dinner";
  if (normalized.includes("vacation") || normalized.includes("travel")) return "vacation outfit";
  if (normalized.includes("gala") || normalized.includes("formal")) return "formal event";
  return "";
}

function itemSearchTerm(label, limits = "") {
  const normalized = `${label} ${limits}`.toLowerCase();
  if (label === "Top") return "top blouse shirt knit";
  if (label === "Bottom") return "trousers skirt pants jeans";
  if (label === "Layer") return "blazer cardigan jacket coat";
  if (label === "Shoes") {
    if (normalized.includes("avoid heels") || normalized.includes("no heels")) return "flats loafers comfortable shoes";
    return "shoes loafers flats sandals";
  }
  if (label === "Accessory") return "bag earrings necklace accessory";
  return label.toLowerCase();
}

function audienceSearchTerm(payload) {
  const text = `${payload.aesthetic || ""} ${payload.limits || ""}`.toLowerCase();
  if (/\b(men|mens|male|masculine)\b/.test(text)) return "mens clothing";
  return "women clothing";
}

function compactSearchWords(text = "") {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !["balanced", "relaxed", "elevated", "comfortable", "polished", "anchor", "finishing", "styling", "detail"].includes(word.toLowerCase()))
    .slice(0, 8)
    .join(" ");
}

function limitSearchTerm(limits = "") {
  const normalized = limits.toLowerCase();
  const terms = [];
  if (normalized.includes("avoid heels") || normalized.includes("no heels")) terms.push("flats loafers");
  if (normalized.includes("comfort")) terms.push("comfortable");
  if (normalized.includes("petite")) terms.push("petite");
  if (normalized.includes("plus")) terms.push("plus size");
  return compactSearchWords(terms.join(" "));
}

function buildStoreQuery(item, payload) {
  const store = preferredStores(payload.stores)[0] || "";
  const occasion = occasionSearchTerm(payload.occasion);
  const itemTerm = itemSearchTerm(item.label, payload.limits);
  const aesthetic = compactSearchWords(payload.aesthetic);
  const limits = limitSearchTerm(payload.limits);
  const query = [store, audienceSearchTerm(payload), occasion, aesthetic, itemTerm, limits].filter(Boolean).join(" ");
  return query || item.name;
}

function isDirectMerchantLink(link = "") {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "");
    return Boolean(
      hostname
        && !hostname.endsWith("google.com")
        && !hostname.endsWith("googleusercontent.com")
        && !hostname.endsWith("googleadservices.com")
        && !hostname.endsWith("serpapi.com"),
    );
  } catch {
    return false;
  }
}

function normalizedStoreName(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function storeMatches(source = "", stores = []) {
  const sourceName = normalizedStoreName(source);
  if (!sourceName) return false;
  return stores.some((store) => {
    const storeName = normalizedStoreName(store);
    return storeName && (sourceName.includes(storeName) || storeName.includes(sourceName));
  });
}

function numericPrice(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function firstImage(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value) && value[0]) {
      const image = value[0];
      if (typeof image === "string") return image;
      if (image.link || image.url || image.thumbnail) return image.link || image.url || image.thumbnail;
    }
    if (typeof value === "string") return value;
    if (value.link || value.url || value.thumbnail) return value.link || value.url || value.thumbnail;
  }
  return "";
}

function directMerchantLinkForItem(item) {
  return [item.direct_link, item.link].filter(Boolean).find(isDirectMerchantLink) || "";
}

function bestLinkForSerpItem(item, query) {
  return directMerchantLinkForItem(item) || item.product_link || item.link || googleSearchLink("", query);
}

function scoreShoppingItem(item, budget, query, stores = []) {
  const price = numericPrice(item.extracted_price);
  let score = 0;
  if (item.thumbnail) score += 4;
  if (directMerchantLinkForItem(item)) score += 4;
  if (storeMatches(item.source || "", stores)) score += 3;
  if (item.source) score += 1;
  if (price && price <= budget * 1.35) score += 2;
  if (price && price > budget * 2) score -= 3;
  if (String(item.title || "").toLowerCase().includes(query.split(" ").at(-1) || "")) score += 1;
  return score;
}

function mapSerpShoppingItem(item, query, budget, merchantOverride = null) {
  const link = merchantOverride?.link || bestLinkForSerpItem(item, query);
  return {
    name: merchantOverride?.name || item.title || query,
    price: Math.round(numericPrice(merchantOverride?.price ?? item.extracted_price, budget)),
    link,
    linkType: isDirectMerchantLink(link) ? "merchant" : "shopping",
    image: merchantOverride?.image || firstImage(item.thumbnail, item.thumbnails, item.image),
    source: merchantOverride?.source || item.source,
  };
}

function serpApiImmersiveUrl(item) {
  if (item.serpapi_immersive_product_api) {
    const url = new URL(item.serpapi_immersive_product_api);
    url.searchParams.set("api_key", process.env.SERPAPI_KEY);
    url.searchParams.set("more_stores", "true");
    return url;
  }
  if (item.immersive_product_page_token) {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_immersive_product");
    url.searchParams.set("page_token", item.immersive_product_page_token);
    url.searchParams.set("more_stores", "true");
    url.searchParams.set("api_key", process.env.SERPAPI_KEY);
    return url;
  }
  return null;
}

function scoreMerchantStore(store, budget, stores = []) {
  const link = store.link || store.direct_link || "";
  const price = numericPrice(store.extracted_price ?? store.price);
  const name = store.name || store.source || store.seller || store.merchant || "";
  let score = 0;
  if (isDirectMerchantLink(link)) score += 5;
  if (storeMatches(name, stores)) score += 5;
  if (price && price <= budget * 1.35) score += 2;
  if (price && price > budget * 2) score -= 3;
  return score;
}

async function resolveSerpApiMerchantLink(item, query, budget, stores = []) {
  if (process.env.SERPAPI_RESOLVE_MERCHANT_LINKS === "false") return null;
  const url = serpApiImmersiveUrl(item);
  if (!url) return null;

  try {
    const response = await fetchWithTimeout(url, {}, 5_000);
    if (!response.ok) return null;
    const data = await response.json();
    const product = data.product_results || data.product || {};
    const storesList = [
      ...(product.stores || []),
      ...(data.stores || []),
      ...(data.online_sellers || []),
      ...(data.sellers_results?.online_sellers || []),
    ].filter((store) => store.link || store.direct_link);

    const selected = storesList
      .slice()
      .sort((a, b) => scoreMerchantStore(b, budget, stores) - scoreMerchantStore(a, budget, stores))
      .find((store) => isDirectMerchantLink(store.link || store.direct_link));

    if (!selected) return null;
    const link = selected.link || selected.direct_link;
    return {
      name: product.title || item.title || query,
      price: numericPrice(selected.extracted_price ?? selected.price ?? item.extracted_price, budget),
      link,
      image: firstImage(product.thumbnail, product.thumbnails, product.images, item.thumbnail),
      source: selected.name || selected.source || item.source,
    };
  } catch {
    return null;
  }
}

function allocatePrices(budget, variant) {
  const modifier = variant === "dressy" ? 1.08 : variant === "casual" ? 0.9 : 1;
  const prices = storeBlueprint.map(([, , ratio], index) => Math.max(9, Math.round(((budget * ratio * modifier) + index * 2) / 5) * 5 - 1));
  const total = prices.reduce((sum, price) => sum + price, 0);
  if (total > budget) {
    const largestIndex = prices.reduce((best, price, index) => (price > prices[best] ? index : best), 0);
    prices[largestIndex] = Math.max(12, prices[largestIndex] - (total - budget));
  }
  return prices;
}

const colorSeasons = {
  "Soft Autumn": {
    palette: [
      ["Moss", "#7b8462"],
      ["Camel", "#c39b68"],
      ["Warm Taupe", "#9a7a68"],
      ["Terracotta", "#b7654b"],
      ["Cream", "#f2e2c8"],
    ],
    avoid: "icy white, neon pink, pure black",
    note: "muted warm colors keep the face softer and more even.",
  },
  "Warm Autumn": {
    palette: [
      ["Olive", "#6f7445"],
      ["Chocolate", "#5c3b2e"],
      ["Rust", "#a64f32"],
      ["Mustard", "#c4942f"],
      ["Ivory", "#f4e6c8"],
    ],
    avoid: "blue-gray, cool pastels, optic white",
    note: "rich golden colors echo warm undertones without looking harsh.",
  },
  "Warm Spring": {
    palette: [
      ["Coral", "#ee735f"],
      ["Peach", "#f0a478"],
      ["Clear Aqua", "#4fb7ad"],
      ["Warm Ivory", "#fff0d7"],
      ["Leaf Green", "#7cae52"],
    ],
    avoid: "dusty mauve, charcoal, muddy browns",
    note: "clear warm colors add brightness while staying friendly.",
  },
  "Soft Summer": {
    palette: [
      ["Dusty Rose", "#c98f9c"],
      ["Slate Blue", "#6f819c"],
      ["Soft Navy", "#38465f"],
      ["Mushroom", "#b9aaa0"],
      ["Lavender Gray", "#aaa3bc"],
    ],
    avoid: "orange, neon yellow, high-contrast black and white",
    note: "cool muted colors work with lower contrast and avoid overpowering the face.",
  },
  "Cool Summer": {
    palette: [
      ["Powder Blue", "#93b8d9"],
      ["Rose", "#b95f7d"],
      ["Plum", "#67435f"],
      ["Cool Gray", "#a6aab1"],
      ["Soft White", "#f2f3f0"],
    ],
    avoid: "camel, tomato red, warm beige",
    note: "blue-based shades support cool undertones and a polished look.",
  },
  "Deep Winter": {
    palette: [
      ["Black", "#141414"],
      ["Emerald", "#006c5b"],
      ["Burgundy", "#6e2438"],
      ["Cool White", "#f7f7f2"],
      ["Royal Blue", "#244f9e"],
    ],
    avoid: "dusty beige, muted orange, washed-out pastels",
    note: "deep cool contrast keeps strong features crisp and intentional.",
  },
  "Bright Winter": {
    palette: [
      ["Fuchsia", "#c81d77"],
      ["Cobalt", "#1e5bb8"],
      ["Clear Red", "#d92936"],
      ["Icy Pink", "#f7dbe8"],
      ["Black", "#101010"],
    ],
    avoid: "muddy olive, camel, faded dusty colors",
    note: "clear cool colors match high contrast without dulling the face.",
  },
  "Neutral Classic": {
    palette: [
      ["Soft Black", "#252525"],
      ["Cream", "#f0dfc2"],
      ["Teal", "#1f7c78"],
      ["Rosewood", "#9f5d61"],
      ["Stone", "#b8aa99"],
    ],
    avoid: "extreme neon colors before testing them near the face",
    note: "balanced neutrals are flexible while you test warm vs cool colors.",
  },
};

function pickColorSeason(payload) {
  const undertone = payload.skinUndertone || "neutral";
  const contrast = payload.colorContrast || "medium";
  const hair = payload.hairDepth || "medium";
  const metal = payload.metalPreference || "both";

  if (undertone === "warm" || undertone === "olive" || metal === "gold" || hair === "red") {
    if (contrast === "high" || hair === "dark") return "Warm Autumn";
    if (contrast === "low") return "Soft Autumn";
    return "Warm Spring";
  }

  if (undertone === "cool" || metal === "silver" || hair === "gray") {
    if (contrast === "high" && hair === "dark") return "Deep Winter";
    if (contrast === "high") return "Bright Winter";
    if (contrast === "low") return "Soft Summer";
    return "Cool Summer";
  }

  if (contrast === "high") return hair === "dark" ? "Deep Winter" : "Bright Winter";
  if (contrast === "low") return "Soft Summer";
  return "Neutral Classic";
}

function colorPlan(payload) {
  const seasonName = pickColorSeason(payload);
  const season = colorSeasons[seasonName];
  const favorites = cleanList(payload.favoriteColors).slice(0, 3);
  const items = season.palette.map(([name, hex]) => ({
    label: "Best color",
    name,
    detail: hex,
    actionText: "Wear near face",
    price: 0,
    link: "",
    shape: "accessory",
    color: hex,
    artBg: "#fffaf6",
  }));

  return {
    id: randomUUID(),
    provider: "local-color-theory",
    mode: "colors",
    title: `${seasonName} Palette`,
    moment: "Color analysis",
    source: "Color theory",
    spend: "No API",
    items,
    why: `This estimate uses undertone (${payload.skinUndertone || "neutral"}), contrast (${payload.colorContrast || "medium"}), hair depth (${payload.hairDepth || "medium"}), and jewelry preference (${payload.metalPreference || "both"}). ${season.note}`,
    next: `Try these colors near your face first: ${season.palette.slice(0, 3).map(([name]) => name).join(", ")}. Avoid ${season.avoid}.${favorites.length ? ` Compare them with colors you already like: ${favorites.join(", ")}.` : ""}`,
    alerts: ["This is a rule-based style estimate. For photo-based skin analysis, connect Gemini Vision later and ask for consent before processing face photos."],
  };
}

function fallbackPlan(payload, provider = "demo") {
  const mode = payload.mode || "closet";
  const variant = payload.variant || "default";
  const style = styleWord(variant);
  const moment = firstPhrase(payload.occasion);
  const inspiration = payload.pinterest ? "Pinterest inspiration" : payload.aesthetic;

  if (mode === "colors") return colorPlan(payload);

  if (mode === "stores") {
    const budget = Number(payload.budget) || 160;
    const prices = allocatePrices(budget, variant);
    const items = storeBlueprint.map(([label, base, , shape], index) => {
      const name = `${titleCase(style)} ${base}`;
      return {
        label,
        name,
        price: prices[index],
        link: googleSearchLink(payload.stores || "", name),
        shape,
        color: ["#b9895e", "#0f766e", "#d2604d", "#343a3f", "#bd8427"][index],
        artBg: ["#efe3d6", "#edf4f2", "#f4ded8", "#f1f1ee", "#f5ead7"][index],
      };
    });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    return {
      id: randomUUID(),
      provider,
      mode,
      title: `${titleCase(style)} Shoppable Look`,
      moment,
      source: "Stores",
      spend: `$${total}`,
      items,
      why: `This outfit uses ${inspiration || "the selected aesthetic"} for ${payload.setting || "the setting"} and keeps the total near the $${budget} budget.`,
      next: provider === "demo"
        ? "Add SERPAPI_KEY or EBAY_ACCESS_TOKEN to return real products and prices instead of search links."
        : "Products were pulled from a live search provider. Review sizes, shipping, and stock before buying.",
    };
  }

  if (mode === "tryon") {
    const hasPerson = Boolean(payload.personImage);
    const garmentCount = payload.garmentImages?.length || 0;
    return {
      id: randomUUID(),
      provider,
      mode,
      title: `${titleCase(style)} Try-On Preview`,
      moment,
      source: "Try-on",
      spend: provider === "try-on-api" ? "Rendered" : "API",
      items: [
        { label: "Person", name: hasPerson ? "Full-Length Photo Added" : "Upload Full-Length Photo", detail: hasPerson ? "Ready" : "Needed", actionText: "Try-on input", shape: "avatar", color: "#0f766e", artBg: "#edf4f2" },
        { label: "Clothes", name: garmentCount ? `${garmentCount} clothing photo${garmentCount === 1 ? "" : "s"}` : "Upload Clothes", detail: garmentCount ? "Ready" : "Needed", actionText: "Garment input", shape: "top", color: "#d2604d", artBg: "#f4ded8" },
        { label: "Preview", name: provider === "try-on-api" ? "Rendered Try-On Image" : "Digital Try-On Placeholder", detail: provider === "try-on-api" ? "Ready" : "Provider needed", actionText: provider === "try-on-api" ? "Preview ready" : "API needed", shape: "layer", color: "#343a3f", artBg: "#f1f1ee" },
      ],
      why: "This mode needs a virtual try-on model that accepts a person photo and garment images, then returns a generated preview.",
    next: "Set PHOTTA_API_URL and PHOTTA_API_KEY after checking Photta's API docs. Provider response shapes differ, so the adapter may need one small mapping change.",
    };
  }

  const owned = cleanList(payload.closetItems);
  const validation = validateClosetItems(owned);
  const items = outfitItemsFromClosetValidation(validation);
  const displayItems = items.length ? items : ["white tee", "straight jeans", "light jacket", "loafers"].map((item, index) => ({
    label: "Example",
    name: titleCase(item),
    price: 0,
    link: "",
    shape: shapeForLabel(item),
    color: ["#b9895e", "#0f766e", "#d2604d", "#343a3f"][index % 4],
    artBg: ["#efe3d6", "#edf4f2", "#f4ded8", "#f1f1ee"][index % 4],
  }));

  return {
    id: randomUUID(),
    provider,
    mode: "closet",
    title: `${titleCase(style)} Closet Look`,
    moment,
    source: "Closet",
    spend: "$0",
    items: displayItems,
    why: validation.alerts.length
      ? `This closet list is not complete yet. I used only the usable pieces and marked what is missing, instead of pretending every entered item makes a finished outfit.`
      : `This outfit uses owned clothes and follows ${inspiration || "the selected aesthetic"} for ${payload.setting || "the setting"}.`,
    next: validation.alerts.length
      ? "Fix the closet list first, then generate again for a stronger outfit."
      : "Generated from typed closet items. For better results, add exact colors, fits, and clear wardrobe photos when image recognition is connected.",
    alerts: validation.alerts,
  };
}

function extractGeminiText(data) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function dataUrlToGeminiPart(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const [, mimeType, data] = match;
  if (!mimeType.startsWith("image/")) return null;
  return {
    inline_data: {
      mime_type: mimeType,
      data,
    },
  };
}

function shapeFromCategory(category = "", name = "") {
  const normalized = category.toLowerCase();
  if (normalized.includes("shoe")) return "shoes";
  if (normalized.includes("accessor") || normalized.includes("bag") || normalized.includes("jewel")) return "accessory";
  if (normalized.includes("layer") || normalized.includes("jacket") || normalized.includes("coat") || normalized.includes("cardigan")) return "layer";
  if (normalized.includes("bottom") || normalized.includes("skirt") || normalized.includes("pant") || normalized.includes("jean") || normalized.includes("short")) return "bottom";
  return shapeForLabel(name);
}

function normalizeAiClosetItems(rawItems = []) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  return items
    .slice(0, 6)
    .map((item, index) => {
      const category = item.category || item.label || "Owned";
      const name = item.name || item.item || item.description || `${titleCase(category)} Piece`;
      return {
        label: titleCase(category),
        name: titleCase(name),
        detail: item.detail || item.reason || item.role || "AI selected",
        actionText: "AI selected",
        price: 0,
        link: "",
        shape: shapeFromCategory(category, name),
        color: ["#b9895e", "#0f766e", "#d2604d", "#343a3f", "#bd8427", "#78917f"][index % 6],
        artBg: ["#efe3d6", "#edf4f2", "#f4ded8", "#f1f1ee", "#f5ead7", "#e8eee9"][index % 6],
      };
    });
}

function mergeAiClosetPlan(basePlan, aiPlan) {
  const items = normalizeAiClosetItems(aiPlan.items);
  if (!items.length) return null;
  return {
    ...basePlan,
    provider: "gemini-closet",
    title: aiPlan.title || basePlan.title,
    source: "AI closet",
    spend: "$0",
    items,
    why: aiPlan.why || basePlan.why,
    next: aiPlan.next || basePlan.next,
    alerts: Array.isArray(aiPlan.alerts) ? aiPlan.alerts : [],
    diagnostics: {
      ...(basePlan.diagnostics || {}),
      gemini: {
        ok: true,
        model: geminiModel,
        status: "CONNECTED",
        role: "closet-selection",
      },
    },
  };
}

async function callGeminiClosetStylist(payload, basePlan) {
  if (!process.env.GEMINI_API_KEY || payload.mode !== "closet") return null;
  const imageParts = (payload.wardrobeImages || [])
    .map(dataUrlToGeminiPart)
    .filter(Boolean)
    .slice(0, 8);

  const userText = {
    occasion: payload.occasion,
    aesthetic: payload.aesthetic,
    setting: payload.setting,
    pinterest: payload.pinterest,
    closetItems: cleanList(payload.closetItems),
    uploadedWardrobeImageCount: imageParts.length,
    fallbackDraft: basePlan,
  };

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: [
              "You are an AI closet stylist. Choose a balanced outfit from the user's typed closet items and uploaded wardrobe photos.",
              "Detect garment categories from images when possible. Select at most one main top, one bottom or one dress/jumpsuit, one pair of shoes, and optional layer/accessory.",
              "If the user gives many tops and one skirt, choose the one top that best matches the skirt, occasion, aesthetic, weather, and balance.",
              "Do not include duplicate categories unless it is an intentional layer/accessory. Do not include pajamas/sleepwear unless the occasion asks for it.",
              "If a required category is missing, add an alert instead of inventing owned items.",
              "Return only valid JSON with keys: title, items, why, next, alerts.",
              "items must be an array of objects with category, name, detail, reason.",
            ].join(" "),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: JSON.stringify(userText) },
            ...imageParts,
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  }, Math.max(geminiTimeoutMs, 18_000));

  if (!response.ok) {
    throw providerError("Gemini closet request failed", await geminiErrorFromResponse(response));
  }

  const data = await response.json();
  const text = extractGeminiText(data);
  return text ? JSON.parse(text) : null;
}

function readGeminiErrorBody(statusCode, text = "") {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some provider failures return plain text or HTML. Keep a short scrubbed snippet.
  }

  const provider = parsed?.error || parsed || {};
  const status = provider.status || provider.code || `HTTP_${statusCode}`;
  const message = scrubSecretText(provider.message || text || "Gemini request failed").slice(0, 480);
  return {
    httpStatus: statusCode,
    providerStatus: String(status),
    providerMessage: message,
    message: `Gemini ${statusCode} ${status}: ${message}`,
  };
}

async function geminiErrorFromResponse(response) {
  const text = await response.text().catch(() => "");
  return readGeminiErrorBody(response.status, text);
}

function geminiErrorForUser(error) {
  if (error?.name === "AbortError") {
    return `Gemini request timed out after ${Math.round(geminiTimeoutMs / 1000)} seconds. Try a lighter model or raise GEMINI_TIMEOUT_MS while debugging.`;
  }
  return scrubSecretText(error?.message || "Gemini request failed.");
}

async function callGemini(payload, basePlan) {
  if (!process.env.GEMINI_API_KEY) return null;

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: "You are a practical AI stylist. Improve the title, styling logic, and next step for the outfit plan. Keep it concise, realistic, and budget-aware. Do not invent brand availability. Return only valid JSON with keys: title, why, next.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({ userInputs: payload, draftPlan: basePlan }),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 800,
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  }, geminiTimeoutMs);

  if (!response.ok) {
    throw providerError("Gemini request failed", await geminiErrorFromResponse(response));
  }

  const data = await response.json();
  const text = extractGeminiText(data);
  return text ? JSON.parse(text) : null;
}

async function checkGemini() {
  if (!process.env.GEMINI_API_KEY) {
    return {
      ok: false,
      model: geminiModel,
      status: "MISSING_KEY",
      message: "GEMINI_API_KEY is missing from .env.",
    };
  }

  try {
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with only: ok" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
        },
      }),
    }, Math.max(geminiTimeoutMs, 10_000));

    if (!response.ok) {
      const details = await geminiErrorFromResponse(response);
      return {
        ok: false,
        model: geminiModel,
        status: details.providerStatus,
        httpStatus: details.httpStatus,
        message: details.providerMessage,
      };
    }

    const data = await response.json();
    return {
      ok: true,
      model: geminiModel,
      status: "CONNECTED",
      message: extractGeminiText(data) || "Gemini connected.",
    };
  } catch (error) {
    return {
      ok: false,
      model: geminiModel,
      status: error?.name === "AbortError" ? "TIMEOUT" : "REQUEST_FAILED",
      message: geminiErrorForUser(error),
    };
  }
}

async function searchSerpApi(query, budget, stores = []) {
  if (!process.env.SERPAPI_KEY) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", process.env.SERPAPI_KEY);
  url.searchParams.set("num", "10");
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");

  try {
    const response = await fetchWithTimeout(url, {}, 8_000);
    if (!response.ok) return [];
    const data = await response.json();
    const sorted = (data.shopping_results || [])
      .slice(0, 8)
      .sort((a, b) => scoreShoppingItem(b, budget, query, stores) - scoreShoppingItem(a, budget, query, stores));

    const directResult = sorted.slice(0, 3).find((item) => directMerchantLinkForItem(item));
    if (directResult) return [mapSerpShoppingItem(directResult, query, budget)];

    const primary = sorted[0];
    if (!primary) return [];

    const merchant = await resolveSerpApiMerchantLink(primary, query, budget, stores);
    return [mapSerpShoppingItem(primary, query, budget, merchant)];
  } catch {
    return [];
  }
}

async function searchEbay(query, budget) {
  if (!process.env.EBAY_ACCESS_TOKEN) return [];
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "3");
  url.searchParams.set("sort", "price");
  if (budget) url.searchParams.set("filter", `price:[1..${Math.ceil(budget)}]`);

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${process.env.EBAY_ACCESS_TOKEN}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    }, 8_000);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.itemSummaries || []).slice(0, 1).map((item) => ({
      name: item.title || query,
      price: Number(item.price?.value) || budget,
      link: item.itemWebUrl || googleSearchLink("", query),
      linkType: item.itemWebUrl ? "merchant" : "shopping",
      image: item.image?.imageUrl,
      source: "eBay",
    }));
  } catch {
    return [];
  }
}

async function enrichStoreItems(plan, payload) {
  if (payload.mode !== "stores") return plan;
  const budget = Number(payload.budget) || 160;
  const perItemBudget = Math.max(20, budget / Math.max(1, plan.items.length));

  const stores = preferredStores(payload.stores);
  const enriched = await Promise.all(plan.items.map(async (item) => {
    const query = buildStoreQuery(item, payload);
    const matches = [
      ...(await searchSerpApi(query, perItemBudget, stores)),
      ...(await searchEbay(query, perItemBudget)),
    ];
    const match = matches[0];
    return match ? { ...item, name: match.name, price: Math.round(match.price), link: match.link, linkType: match.linkType, image: match.image, source: match.source } : item;
  }));

  const total = enriched.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const liveCount = enriched.filter((item) => item.image || item.source).length;
  const provider = process.env.SERPAPI_KEY && liveCount ? "serpapi" : process.env.EBAY_ACCESS_TOKEN && liveCount ? "ebay" : plan.provider;
  const merchantCount = enriched.filter((item) => item.linkType === "merchant").length;
  const next = liveCount
    ? `Product photos, prices, and item links came from ${provider === "serpapi" ? "SerpAPI" : "the shopping provider"}. ${merchantCount ? `${merchantCount} link${merchantCount === 1 ? "" : "s"} open closer to the merchant page; the rest may still open through Google Shopping.` : "Google did not expose direct merchant links for these results, so links may open through Google Shopping."}`
    : process.env.SERPAPI_KEY
      ? "SerpAPI is connected, but it did not return usable product photos for these exact searches. Try a clearer store name or aesthetic."
      : plan.next;

  return {
    ...plan,
    provider,
    spend: total ? `$${total}` : plan.spend,
    items: enriched,
    next,
  };
}

async function callTryOnProvider(payload, plan) {
  if (payload.mode !== "tryon" || !tryOnApiUrl || !payload.personImage || !payload.garmentImages?.length) return plan;
  const response = await fetchWithTimeout(tryOnApiUrl, {
    method: "POST",
    headers: {
      Authorization: tryOnApiKey ? `Bearer ${tryOnApiKey}` : "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      person_image: payload.personImage,
      garment_images: payload.garmentImages,
      notes: payload.tryOnNotes,
    }),
  }, 30_000);

  if (!response.ok) throw new Error(`Try-on provider failed: ${response.status}`);
  const data = await response.json();
  const image = data.previewImage || data.image || data.image_url || data.output?.[0] || data.result?.image;
  if (!image) return plan;

  return {
    ...plan,
    provider: "try-on-api",
    spend: "Rendered",
    items: plan.items.map((item) => item.label === "Preview" ? { ...item, name: "Rendered Try-On Image", detail: "Ready", actionText: "Preview ready", image } : item),
    next: "Try-on image returned by provider. Next production step: store the generated image and add consent/privacy controls.",
  };
}

async function createOutfitPlan(payload) {
  let plan = fallbackPlan(payload);
  plan = await enrichStoreItems(plan, payload);
  plan = await callTryOnProvider(payload, plan);

  let aiCopy = null;
  if (payload.mode === "closet") {
    try {
      const aiClosetPlan = await callGeminiClosetStylist(payload, plan);
      const merged = aiClosetPlan ? mergeAiClosetPlan(plan, aiClosetPlan) : null;
      if (merged) return merged;
    } catch (error) {
      plan = {
        ...plan,
        diagnostics: {
          ...(plan.diagnostics || {}),
          gemini: {
            ok: false,
            model: geminiModel,
            status: error?.providerStatus || error?.name || "REQUEST_FAILED",
            message: geminiErrorForUser(error),
            role: "closet-selection",
          },
        },
        next: `${plan.next} AI closet note: ${geminiErrorForUser(error)} Showing local fallback outfit.`,
      };
    }
  }

  const shouldPolishCopy = payload.mode !== "closet" && plan.mode !== "colors";
  if (shouldPolishCopy) {
    try {
      aiCopy = await callGemini(payload, plan);
    } catch (error) {
      plan = {
        ...plan,
        diagnostics: {
          ...(plan.diagnostics || {}),
          gemini: {
            ok: false,
            model: geminiModel,
            status: error?.providerStatus || error?.name || "REQUEST_FAILED",
            message: geminiErrorForUser(error),
          },
        },
        next: `${plan.next} Gemini API note: ${geminiErrorForUser(error)} Showing fallback stylist copy.`,
      };
    }
  }

  if (aiCopy) {
    plan = {
      ...plan,
      provider: plan.provider === "demo" ? "gemini" : `${plan.provider}+gemini`,
      diagnostics: {
        ...(plan.diagnostics || {}),
        gemini: {
          ok: true,
          model: geminiModel,
          status: "CONNECTED",
        },
      },
      title: aiCopy.title || plan.title,
      why: aiCopy.why || plan.why,
      next: aiCopy.next || plan.next,
    };
  }

  return plan;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url?.startsWith("/api/health")) {
      json(res, 200, {
        ok: true,
        gemini: Boolean(process.env.GEMINI_API_KEY),
        geminiModel,
        serpapi: Boolean(process.env.SERPAPI_KEY),
        ebay: Boolean(process.env.EBAY_ACCESS_TOKEN),
        photta: Boolean(tryOnApiUrl || phottaWidgetKey),
        phottaApi: Boolean(tryOnApiUrl),
        phottaWidget: Boolean(phottaWidgetKey),
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/public-config")) {
      json(res, 200, {
        phottaWidgetKey,
        phottaProductType,
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/gemini-check")) {
      json(res, 200, await checkGemini());
      return;
    }

    if (req.method === "POST" && req.url === "/api/outfit-plan") {
      const payload = await readJson(req);
      const plan = await createOutfitPlan(payload);
      json(res, 200, plan);
      return;
    }

    if (req.method === "POST" && req.url === "/api/try-on") {
      const payload = await readJson(req);
      const plan = await callTryOnProvider({ ...payload, mode: "tryon" }, fallbackPlan({ ...payload, mode: "tryon" }));
      json(res, 200, plan);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
      return;
    }

    json(res, 405, { message: "Method not allowed" });
  } catch (error) {
    json(res, 500, { message: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`LifeFit AI running at http://localhost:${port}/`);
});
