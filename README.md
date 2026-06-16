# LifeFit AI

AI occasion stylist prototype for generating outfits from a user's closet, online stores, color theory, and virtual try-on inputs.



## Features

- **My closet:** uses Gemini to choose a balanced outfit from typed wardrobe items and uploaded wardrobe photos, with local fallback if the API is unavailable.
- **Stores:** searches for shoppable outfit pieces with product images, prices, and links when SerpAPI is connected.
- **Colors:** suggests a personal color palette from undertone, contrast, hair depth, and jewelry preference.
- **Try on me:** opens the Photta virtual try-on widget when a widget key is configured.
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

PHOTTA_WIDGET_KEY=
PHOTTA_PRODUCT_TYPE=apparel
PHOTTA_API_URL=
PHOTTA_API_KEY=

PORT=8765
```

Never commit `.env`. It contains private API keys and is ignored by `.gitignore`.

## What Uses APIs

- **Gemini:** AI closet selection from typed wardrobe items and uploaded wardrobe photos, plus optional styling copy in other modes.
- **SerpAPI:** optional store search, product photos, prices, and links.
- **Photta widget:** optional virtual try-on flow loaded from Photta's frontend SDK.
- **Colors mode:** no API. It uses local color-theory rules.

## Photta Widget Setup

Photta provides a publishable widget key, not a backend URL. Add the key in Render as:

```env
PHOTTA_WIDGET_KEY=your_pk_live_key
PHOTTA_PRODUCT_TYPE=apparel
```

In the Photta dashboard, add your deployed Render URL as an allowed domain. The app exposes the publishable key through `/api/public-config` and loads the widget SDK only when the user clicks the try-on button.

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
