# LifeFit AI

AI occasion stylist prototype for generating outfits from a user's closet, online stores, color theory, and virtual try-on inputs.



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




## Project Structure

```text
index.html        Frontend markup
styles.css        App styling
app.js            Browser UI and fallback logic
server.mjs        Node server and provider adapters
assets/           Local images
.env.example      Environment variable template
```
