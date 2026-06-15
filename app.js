const form = document.querySelector("#stylistForm");
const modeButtons = document.querySelectorAll("[data-mode]");
const modePanels = document.querySelectorAll("[data-mode-panel]");
const occasionInput = document.querySelector("#occasion");
const pinterestInput = document.querySelector("#pinterest");
const aestheticInput = document.querySelector("#aesthetic");
const settingInput = document.querySelector("#setting");
const closetItemsInput = document.querySelector("#closetItems");
const wardrobePhotosInput = document.querySelector("#wardrobePhotos");
const budgetInput = document.querySelector("#budget");
const storesInput = document.querySelector("#stores");
const limitsInput = document.querySelector("#limits");
const skinUndertoneInput = document.querySelector("#skinUndertone");
const colorContrastInput = document.querySelector("#colorContrast");
const hairDepthInput = document.querySelector("#hairDepth");
const metalPreferenceInput = document.querySelector("#metalPreference");
const favoriteColorsInput = document.querySelector("#favoriteColors");
const tryOnPhotoInput = document.querySelector("#tryOnPhoto");
const tryOnClothesInput = document.querySelector("#tryOnClothes");
const tryOnNotesInput = document.querySelector("#tryOnNotes");
const resetButton = document.querySelector("#resetBtn");
const saveButton = document.querySelector("#saveLook");
const itemsGrid = document.querySelector("#itemsGrid");
const lookTitle = document.querySelector("#lookTitle");
const sourceLabel = document.querySelector("#sourceLabel");
const sourceMetric = document.querySelector("#sourceMetric");
const momentLabel = document.querySelector("#momentLabel");
const spendMetric = document.querySelector("#spendMetric");
const pieceCount = document.querySelector("#pieceCount");
const alertsList = document.querySelector("#alertsList");
const whyText = document.querySelector("#whyText");
const nextStepText = document.querySelector("#nextStepText");
const savedGrid = document.querySelector("#savedGrid");
const savedCount = document.querySelector("#savedCount");

const storageKey = "lifefit-ai-saved-looks-v2";
let currentMode = "closet";
let currentPlan = null;
let memorySavedLooks = [];
let pendingRequest = false;

const shapes = {
  avatar: { shapeW: "46px", shapeH: "86px", shapeR: "999px 999px 18px 18px" },
  top: { shapeW: "58px", shapeH: "58px", shapeR: "18px 18px 7px 7px" },
  bottom: { shapeW: "48px", shapeH: "78px", shapeR: "8px 8px 22px 22px" },
  layer: { shapeW: "68px", shapeH: "78px", shapeR: "16px 16px 8px 8px" },
  shoes: { shapeW: "76px", shapeH: "26px", shapeR: "999px 32px 22px 999px" },
  bag: { shapeW: "58px", shapeH: "48px", shapeR: "10px" },
  accessory: { shapeW: "46px", shapeH: "46px", shapeR: "50%" },
};

const colors = ["#b9895e", "#0f766e", "#d2604d", "#343a3f", "#bd8427", "#78917f"];
const backgrounds = ["#efe3d6", "#edf4f2", "#f4ded8", "#f1f1ee", "#f5ead7", "#e8eee9"];

const storeBlueprint = [
  ["Top", "a polished top", 0.2, "top"],
  ["Bottom", "an anchor bottom", 0.25, "bottom"],
  ["Layer", "a finishing layer", 0.22, "layer"],
  ["Shoes", "comfortable shoes", 0.2, "shoes"],
  ["Accessory", "one styling detail", 0.13, "accessory"],
];

function safeStorageGet() {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey)) || [];
  } catch {
    return memorySavedLooks;
  }
}

function safeStorageSet(looks) {
  memorySavedLooks = looks;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(looks));
  } catch {
    // Some embedded browser contexts block localStorage; in-memory saving keeps the demo usable.
  }
}

function setMode(mode) {
  currentMode = mode;
  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  modePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.modePanel === mode);
  });
  if (!pendingRequest) {
    form.querySelector(".primary-action").textContent = mode === "tryon" ? "Generate try-on" : mode === "colors" ? "Generate palette" : "Generate outfit";
  }
  renderPlan(makePlan());
}

function setGenerating(isGenerating) {
  pendingRequest = isGenerating;
  const label = currentMode === "tryon" ? "Generate try-on" : currentMode === "colors" ? "Generate palette" : "Generate outfit";
  const submitButton = form.querySelector(".primary-action");
  submitButton.disabled = isGenerating;
  submitButton.textContent = isGenerating ? "Generating..." : label;
}

function cleanList(text) {
  return text
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstPhrase(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Any occasion";
  return cleaned.split(",")[0].slice(0, 54);
}

function shapeForLabel(label) {
  const category = classifyClothingItem(label);
  if (category === "shoes") return "shoes";
  if (category === "accessory") return "accessory";
  if (category === "layer") return "layer";
  if (category === "bottom") return "bottom";
  return "top";
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
  if (unrelated.length) alerts.push(`These do not look like clothing pieces: ${unrelated.slice(0, 4).join(", ")}.`);
  if (notOutfit.length) alerts.push(`These are clothing, but they do not fit a styled outfit here: ${notOutfit.slice(0, 4).join(", ")}.`);
  if (duplicates.length) alerts.push(`You entered multiple ${duplicates.join(" and ")} pieces. I picked one so the result does not pretend duplicates make a complete outfit.`);
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
    color: colors[index % colors.length],
    artBg: backgrounds[index % backgrounds.length],
  }));

  const missingItems = validation.missing.map((category, index) => closetPlaceholder(category, index));
  return [...realItems, ...missingItems];
}

function titleCase(text) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function styleWord(variant) {
  if (variant === "casual") return "relaxed";
  if (variant === "dressy") return "elevated";
  if (variant === "comfort") return "comfortable";
  return "balanced";
}

function storeLink(storeList, itemName) {
  const firstStore = storeList.split(",").map((store) => store.trim()).filter(Boolean)[0] || "online store";
  return `https://www.google.com/search?q=${encodeURIComponent(`${firstStore} ${itemName}`)}`;
}

function allocateStorePrices(budget, variant) {
  const modifier = variant === "dressy" ? 1.08 : variant === "casual" ? 0.9 : 1;
  const prices = storeBlueprint.map(([, , ratio], index) => {
    const raw = budget * ratio * modifier + index * 2;
    return Math.max(9, Math.round(raw / 5) * 5 - 1);
  });
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

function pickColorSeason(inputs) {
  const undertone = inputs.skinUndertone || "neutral";
  const contrast = inputs.colorContrast || "medium";
  const hair = inputs.hairDepth || "medium";
  const metal = inputs.metalPreference || "both";

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

function makeColorPlan() {
  const inputs = {
    skinUndertone: skinUndertoneInput.value,
    colorContrast: colorContrastInput.value,
    hairDepth: hairDepthInput.value,
    metalPreference: metalPreferenceInput.value,
    favoriteColors: favoriteColorsInput.value,
  };
  const seasonName = pickColorSeason(inputs);
  const season = colorSeasons[seasonName];
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
  const favorites = cleanList(inputs.favoriteColors).slice(0, 3);

  return {
    id: crypto.randomUUID(),
    mode: "colors",
    title: `${seasonName} Palette`,
    moment: "Color analysis",
    source: "Color theory",
    spend: "No API",
    items,
    why: `This estimate uses undertone (${inputs.skinUndertone}), contrast (${inputs.colorContrast}), hair depth (${inputs.hairDepth}), and jewelry preference (${inputs.metalPreference}). ${season.note}`,
    next: `Try these colors near your face first: ${season.palette.slice(0, 3).map(([name]) => name).join(", ")}. Avoid ${season.avoid}.${favorites.length ? ` Compare them with colors you already like: ${favorites.join(", ")}.` : ""}`,
    alerts: ["This is a rule-based style estimate. For photo-based skin analysis, connect Gemini Vision later and ask for consent before processing face photos."],
  };
}

function makeClosetPlan(variant = "default") {
  const items = cleanList(closetItemsInput.value);
  const validation = validateClosetItems(items);
  const moment = firstPhrase(occasionInput.value);
  const inspiration = pinterestInput.value.trim() ? "Pinterest board" : aestheticInput.value.trim();
  const photoCount = wardrobePhotosInput.files?.length || 0;
  const outfitItems = outfitItemsFromClosetValidation(validation);
  const displayItems = outfitItems.length
    ? outfitItems
    : ["white tee", "straight jeans", "light jacket", "loafers"].map((item, index) => ({
      label: "Example",
      name: titleCase(item),
      price: 0,
      link: "",
      shape: shapeForLabel(item),
      color: colors[index % colors.length],
      artBg: backgrounds[index % backgrounds.length],
    }));

  return {
    id: crypto.randomUUID(),
    mode: "closet",
    title: `${titleCase(styleWord(variant))} Closet Look`,
    moment,
    source: "Closet",
    spend: "$0",
    items: displayItems,
    why: validation.alerts.length
      ? "This closet list is not complete yet. I used only the usable pieces and marked what is missing, instead of pretending every entered item makes a finished outfit."
      : `This look uses clothes already in the wardrobe and follows the ${inspiration || "chosen"} aesthetic for ${settingInput.value.toLowerCase()}. The outfit is built around pieces the user can actually wear today, so the recommendation stays practical instead of turning into a shopping list.`,
    next: validation.alerts.length
      ? "Fix the closet list first, then generate again for a stronger outfit."
      : photoCount
      ? `${photoCount} wardrobe photo${photoCount === 1 ? "" : "s"} added. A real AI version would analyze the uploaded images, identify garment type and color, then choose the best combination.`
      : "Add wardrobe photos later for image-based closet recognition, or paste more owned items to make the outfit plan more accurate.",
    alerts: validation.alerts,
  };
}

function makeStorePlan(variant = "default") {
  const budget = Number(budgetInput.value) || 160;
  const prices = allocateStorePrices(budget, variant);
  const moment = firstPhrase(occasionInput.value);
  const style = styleWord(variant);
  const inspiration = pinterestInput.value.trim() ? "Pinterest inspiration" : aestheticInput.value.trim();

  const outfitItems = storeBlueprint.map(([label, base, , shape], index) => {
    const name = `${titleCase(style)} ${base}`;
    return {
      label,
      name,
      price: prices[index],
      link: storeLink(storesInput.value, name),
      shape,
      color: colors[index % colors.length],
      artBg: backgrounds[index % backgrounds.length],
    };
  });

  const total = outfitItems.reduce((sum, item) => sum + item.price, 0);
  return {
    id: crypto.randomUUID(),
    mode: "stores",
    title: `${titleCase(style)} Shoppable Look`,
    moment,
    source: "Stores",
    spend: `$${total}`,
    items: outfitItems,
    why: `This look uses ${inspiration || "the selected aesthetic"} as the style direction, then fits the occasion, ${settingInput.value.toLowerCase()}, and the $${budget} budget. The store version stays separate from closet styling so the user can decide whether they want to spend money or use what they already own.`,
    next: `Start from ${storesInput.value || "preferred stores"} and replace any item that conflicts with: ${limitsInput.value || "the user's limits"}. Digital try-on can come later after product images and user photos are connected.`,
  };
}

function makeTryOnPlan(variant = "default") {
  const moment = firstPhrase(occasionInput.value);
  const photoAdded = Boolean(tryOnPhotoInput.files?.length);
  const clothingCount = tryOnClothesInput.files?.length || 0;
  const style = styleWord(variant);
  const clothingLabel = clothingCount === 1 ? "1 clothing photo" : `${clothingCount || "No"} clothing photos`;

  const outfitItems = [
    {
      label: "Person",
      name: photoAdded ? "Full-Length Photo Added" : "Upload Full-Length Photo",
      detail: photoAdded ? "Ready" : "Needed",
      actionText: "Try-on input",
      shape: "avatar",
      color: "#0f766e",
      artBg: "#edf4f2",
    },
    {
      label: "Clothes",
      name: clothingCount ? clothingLabel : "Upload Clothes",
      detail: clothingCount ? "Ready" : "Needed",
      actionText: "Garment input",
      shape: "top",
      color: "#d2604d",
      artBg: "#f4ded8",
    },
    {
      label: "Preview",
      name: `${titleCase(style)} Digital Try-On`,
      detail: "Mockup",
      actionText: "API needed",
      shape: "layer",
      color: "#343a3f",
      artBg: "#f1f1ee",
    },
  ];

  return {
    id: crypto.randomUUID(),
    mode: "tryon",
    title: `${titleCase(style)} Try-On Preview`,
    moment,
    source: "Try-on",
    spend: "API",
    items: outfitItems,
    why: `This flow is for the Zara-style feature: the user uploads a full-length photo and one or more clothing photos, then the app would generate a realistic preview of the clothes on their body. For now, this is a portfolio UI state, not real image generation.`,
    next: photoAdded && clothingCount
      ? `Ready for a future virtual try-on API. Notes: ${tryOnNotesInput.value || "realistic front-view preview"}.`
      : "To make this real, connect a virtual try-on model/API that accepts a person image and garment image, then returns a generated try-on image.",
  };
}

function makePlan(variant = "default") {
  if (currentMode === "stores") return makeStorePlan(variant);
  if (currentMode === "colors") return makeColorPlan();
  if (currentMode === "tryon") return makeTryOnPlan(variant);
  return makeClosetPlan(variant);
}

function currentInputs() {
  return {
    mode: currentMode,
    occasion: occasionInput.value,
    pinterest: pinterestInput.value,
    aesthetic: aestheticInput.value,
    setting: settingInput.value,
    closetItems: closetItemsInput.value,
    wardrobePhotoCount: wardrobePhotosInput.files?.length || 0,
    budget: Number(budgetInput.value) || 160,
    stores: storesInput.value,
    limits: limitsInput.value,
    skinUndertone: skinUndertoneInput.value,
    colorContrast: colorContrastInput.value,
    hairDepth: hairDepthInput.value,
    metalPreference: metalPreferenceInput.value,
    favoriteColors: favoriteColorsInput.value,
    tryOnNotes: tryOnNotesInput.value,
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function tryOnImagesPayload() {
  if (currentMode !== "tryon") return {};
  const personFile = tryOnPhotoInput.files?.[0];
  const clothingFiles = Array.from(tryOnClothesInput.files || []).slice(0, 4);
  return {
    personImage: personFile ? await fileToDataUrl(personFile) : "",
    garmentImages: await Promise.all(clothingFiles.map((file) => fileToDataUrl(file))),
  };
}

async function wardrobeImagesPayload() {
  if (currentMode !== "closet") return {};
  const wardrobeFiles = Array.from(wardrobePhotosInput.files || []).slice(0, 8);
  return {
    wardrobeImages: await Promise.all(wardrobeFiles.map((file) => fileToDataUrl(file))),
  };
}

function canUseBackend() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function requestBackendPlan(variant = "default") {
  if (!canUseBackend()) return null;
  const payload = {
    ...currentInputs(),
    ...(await wardrobeImagesPayload()),
    ...(await tryOnImagesPayload()),
    variant,
  };

  const response = await fetch("/api/outfit-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Backend request failed");
  }

  return response.json();
}

async function generateAndRender(variant = "default") {
  if (pendingRequest) return;
  setGenerating(true);

  try {
    const backendPlan = await requestBackendPlan(variant);
    renderPlan(backendPlan || makePlan(variant));
  } catch (error) {
    const fallbackPlan = makePlan(variant);
    fallbackPlan.next = `${fallbackPlan.next} Backend note: ${error.message}. Showing local demo output.`;
    renderPlan(fallbackPlan);
  } finally {
    setGenerating(false);
  }
}

function renderItems(items) {
  itemsGrid.innerHTML = items
    .map((item) => {
      const isStoreItem = currentPlan?.mode === "stores";
      const shape = shapes[item.shape] || shapes.top;
      const style = [
        `--art-bg:${item.artBg}`,
        `--shape:${item.color}`,
        `--shape-w:${shape.shapeW}`,
        `--shape-h:${shape.shapeH}`,
        `--shape-r:${shape.shapeR}`,
      ].join(";");

      const detail = item.detail || (item.price ? `$${item.price}` : "Already owned");
      const linkLabel = item.linkType === "merchant"
        ? "View store item"
        : item.image
          ? "View shopping result"
          : "Search item";
      const action = item.link
        ? `<a class="item-link" href="${item.link}" target="_blank" rel="noreferrer">${linkLabel}</a>`
        : `<span class="item-note">${item.actionText || "Use this piece"}</span>`;

      const art = item.image
        ? `<img src="${item.image}" alt="${item.name}" />`
        : isStoreItem
          ? `<span class="item-photo-placeholder">Product photo<small>Connect SerpAPI</small></span>`
        : "";

      return `
        <article class="item-card">
          <div class="item-art" style="${style}" ${art ? "" : "aria-hidden=\"true\""}>${art}</div>
          <div class="item-copy">
            <span>${item.source || item.label} · ${detail}</span>
            <strong>${item.name}</strong>
            ${action}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPlan(plan) {
  currentPlan = plan;
  lookTitle.textContent = plan.title;
  sourceLabel.textContent = plan.mode === "closet" ? "From your closet" : plan.mode === "stores" ? "From stores" : plan.mode === "colors" ? "Your colors" : "Try on yourself";
  sourceMetric.textContent = plan.source;
  momentLabel.textContent = plan.moment;
  spendMetric.textContent = plan.spend;
  pieceCount.textContent = String(plan.items.length);
  alertsList.innerHTML = (plan.alerts || [])
    .map((alert) => `<p>${alert}</p>`)
    .join("");
  alertsList.hidden = !(plan.alerts || []).length;
  whyText.textContent = plan.why;
  nextStepText.textContent = plan.next;
  saveButton.classList.remove("saved");
  saveButton.textContent = "Save";
  renderItems(plan.items);
}

function renderSaved() {
  const saved = safeStorageGet();
  savedCount.textContent = `${saved.length} saved`;

  if (!saved.length) {
    savedGrid.innerHTML = `<p class="empty-state">Saved outfits will appear here.</p>`;
    return;
  }

  savedGrid.innerHTML = saved
    .map(
      (look) => `
        <article class="saved-card">
          <strong>${look.title}</strong>
          <span>${look.moment}</span>
          <small>${look.source} · ${look.spend} · ${look.items.length} pieces</small>
        </article>
      `,
    )
    .join("");
}

function resetForm() {
  pinterestInput.value = "";
  occasionInput.value = "Birthday dinner with friends, polished but comfortable";
  aestheticInput.value = "clean feminine, soft minimalist";
  settingInput.value = "warm evening, restaurant patio";
  closetItemsInput.value = "black satin skirt, white fitted tee, cream cardigan, nude flats, small gold hoops, beige shoulder bag";
  budgetInput.value = "160";
  storesInput.value = "Zara, H&M, Uniqlo, ASOS";
  limitsInput.value = "avoid heels, keep it comfortable";
  skinUndertoneInput.value = "neutral";
  colorContrastInput.value = "medium";
  hairDepthInput.value = "medium";
  metalPreferenceInput.value = "both";
  favoriteColorsInput.value = "cream, sage, chocolate brown";
  tryOnPhotoInput.value = "";
  tryOnClothesInput.value = "";
  tryOnNotesInput.value = "show a realistic front-view outfit preview";
  setMode("closet");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generateAndRender();
});

document.querySelectorAll("[data-variant]").forEach((button) => {
  button.addEventListener("click", () => generateAndRender(button.dataset.variant));
});

saveButton.addEventListener("click", () => {
  if (!currentPlan) return;
  const saved = safeStorageGet();
  const next = [currentPlan, ...saved.filter((look) => look.id !== currentPlan.id)].slice(0, 6);
  safeStorageSet(next);
  saveButton.classList.add("saved");
  saveButton.textContent = "Saved";
  renderSaved();
});

resetButton.addEventListener("click", resetForm);

renderPlan(makePlan());
renderSaved();
