# Knoxville house-hunt map

A private, password-protected map for scouting homes, restaurants, and shopping
around Knoxville. Click any two pins to get driving distance + time.

- **Map:** Leaflet + OpenStreetMap tiles (free)
- **Routing:** OSRM public server (free, best-effort)
- **Privacy:** your data is AES-256 encrypted with a shared password. The
  published files contain only ciphertext, so a public host (GitHub Pages) is
  safe — the addresses can't be read without the password.

## Edit the data

1. Copy the template and edit it:
   ```bash
   cp data.example.json data.json
   ```
   Add your homes, restaurants, and shops. Each point needs `name`, `lat`,
   `lng`, and optional `details` (any key/value pairs) and `iconUrl`
   (a logo image URL for a custom pin).

   Get a lat/lng by right-clicking a spot in Google Maps → the coordinates are
   the first item in the menu; click to copy.

2. Encrypt it (pick your own password):
   ```bash
   node encrypt-data.js "your-shared-password"
   ```
   This writes `data.encrypted`. **Only `data.encrypted` is committed** —
   `data.json` is git-ignored so the plaintext never leaves your machine.

## Run locally

Because the app `fetch`es a file, open it through a tiny web server (not
`file://`):

```bash
npx serve .
```

Then visit the printed URL and enter your password.

## Publish to GitHub Pages

1. Create a repo and push these files (`data.json` stays local — good).
2. Repo **Settings → Pages → Deploy from branch → main → / (root)**.
3. Share the Pages URL + the password with your people. They enter it once;
   "Remember on this device" keeps them logged in.

To change the password later, just re-run `encrypt-data.js` with a new one and
re-push `data.encrypted`.

## Switching routing to Mapbox (optional)

OSRM's public server is fine for a few people but can be slow or rate-limited.
To use Mapbox instead, get a free token and swap the `computeRoute()` fetch in
`app.js` for the Mapbox Directions API.
