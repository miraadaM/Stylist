# LifeFit AI

AI occasion stylist prototype for generating outfits from a user's closet, online stores, color theory, and virtual try-on inputs.



## Features

- **My closet:** uses Gemini to choose a balanced outfit from typed wardrobe items and uploaded wardrobe photos, with local fallback if the API is unavailable.
- **Stores:** searches for shoppable outfit pieces with product images, prices, and links when SerpAPI is connected.
- **Colors:** suggests a personal color palette from undertone, contrast, hair depth, and jewelry preference.
- **Try on me:** sends a full-length photo and a clothing image to Wearo's Direct API, then shows the generated try-on preview.
- **Saved looks:** saves generated looks locally in the browser.

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:8765/
```

## Environment Variables

Copy `.env.example` to `.env` and add only the keys you want to test.

```bash
cp .env.example .env
```

The app still works without API keys, but API-backed features will use fallback output.

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_TIMEOUT_MS=12000

SERPAPI_KEY=

WEARO_API_KEY=
WEARO_API_URL=https://api.wearo.io/v1/tryon
PUBLIC_BASE_URL=

PORT=8765
```

Never commit `.env`. It contains private API keys and is ignored by `.gitignore`.

## What Uses APIs

- **Gemini:** AI closet selection from typed wardrobe items and uploaded wardrobe photos, plus optional styling copy in other modes.
- **SerpAPI:** optional store search, product photos, prices, and links.
- **Wearo:** optional virtual try-on generation from a person photo and a product image.
- **Colors mode:** no API. It uses local color-theory rules.

## Wearo Try-On Setup

Wearo uses a private backend API key. Add the key in Render as:

```env
WEARO_API_KEY=your_wearo_key
WEARO_API_URL=https://api.wearo.io/v1/tryon
```

Wearo requires `userPhoto` and a public `productImageUrl`. The app accepts the user's clothing upload, saves it under an ignored `uploads/try-on/` folder, and sends its public URL to Wearo.

For deployed testing, set `PUBLIC_BASE_URL` to your Render URL if Wearo cannot fetch the generated product image URL:

```env
PUBLIC_BASE_URL=https://your-render-app.onrender.com
```

Localhost try-on calls may fail because Wearo's server cannot fetch images from `http://localhost`. Test the full Wearo flow from the deployed Render URL or a public tunnel.

## How My Closet Mode Works

When Gemini is configured, My closet mode sends:

- the occasion
- aesthetic
- setting/weather
- typed closet items
- uploaded wardrobe photos, converted to image parts

Gemini returns structured JSON with the selected outfit pieces. It is instructed to choose a balanced outfit, not every item. For example, if the user enters 20 tops and one skirt, it should choose the one top that best matches the skirt, occasion, and aesthetic.

If Gemini is missing, slow, or out of credits, the app falls back to local item-type rules so the interface still works.

## How Colors Mode Works

Colors mode asks for undertone, contrast, hair depth, jewelry preference, and favorite colors. The app maps those answers to a seasonal palette:

- warm or olive undertone tends toward Spring/Autumn
- cool undertone tends toward Summer/Winter
- high contrast tends toward Winter or richer Autumn
- low contrast tends toward softer Summer/Autumn
- gold jewelry nudges warm; silver jewelry nudges cool

This is a styling estimate, not medical or biometric analysis. A future photo-based skin-analysis version could use Gemini Vision, but it should ask for consent before processing face photos.

## Debug URLs

```text
http://localhost:8765/api/health
http://localhost:8765/api/gemini-check
```

## Project Structure

```text
index.html        Frontend markup
styles.css        App styling
app.js            Browser UI and fallback logic
server.mjs        Node server and provider adapters
assets/           Local images
.env.example      Environment variable template
```
