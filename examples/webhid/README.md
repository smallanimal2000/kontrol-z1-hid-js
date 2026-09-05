# WebHID demo

A [Vite](https://vitejs.dev/) app that connects to a Traktor Kontrol Z1 over
[WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API), renders
every knob/fader/button live, and drives the LEDs (an LED sweep plus an optional
gain → VU mirror).

`kontrol-z1-hid` is a `file:../..` dependency, so it resolves to the built
library in the repo root.

## Running

WebHID requires a secure context (`http://localhost` counts) and a
Chromium-based browser.

```sh
# From the repo root, build the library once so dist/ exists:
npm --prefix ../.. install
npm --prefix ../.. run build

# Then run the example:
npm install
npm run dev
```

Then open the printed URL, click **Connect**, and pick the Z1.

## Files

- `index.html` — markup and entry point
- `app.js` — demo logic (build UI, render input, drive LEDs)
- `style.css` — styling
- `vite.config.js` — dev server config
- `public/` — static assets served verbatim
