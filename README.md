# LifeFit AI

AI occasion stylist prototype for generating outfits from a user's closet, online stores, color theory, and virtual try-on inputs.

![LifeFit AI preview](assets/style-board.png)

## Features

- **My closet:** turns typed wardrobe items into a complete outfit plan and warns when important pieces are missing.
- **Stores:** searches for shoppable outfit pieces with product images, prices, and links when SerpAPI is connected.
- **Colors:** suggests a personal color palette from undertone, contrast, hair depth, and jewelry preference.
- **Try on me:** upload UI and backend adapter for a future virtual try-on provider.
- **Saved looks:** saves generated looks locally in the browser.

## Run Locally

```bash
npm start
```

or:

```bash
node server.mjs
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

PHOTTA_API_URL=
PHOTTA_API_KEY=

PORT=8765
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
