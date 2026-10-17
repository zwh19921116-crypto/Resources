# Edgeducate — Resources

Static website for the Edgeducate Resources page.

## Files

- `index.html` — page markup
- `styles.css` — styling
- `script.js` — nav toggle, resource search/filter, save toggles

## Run locally

Open `index.html` in a browser, or serve the folder:

```powershell
python -m http.server 8000
```

## Deploy with GitHub Pages

Repository → Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `root`.

## Admin Save Now workflow

In the Electron Admin app, **Save Now** saves the resource data, regenerates the resource pages, commits the changed project files, and pushes them to `origin/main` on GitHub. A successful GitHub push does not by itself deploy the Cloudflare Worker.

To publish the pushed resources to Cloudflare, run this from the repository root:

```powershell
npx wrangler deploy
```

The `.assetsignore` file keeps repository metadata and Wrangler files out of public assets.

Verify the deployment on `https://resources.edgeducate.com.au/`. Resource pages use trailing-slash URLs; the Cloudflare Worker serves each directory's `index.html` while `wrangler.toml` keeps `html_handling = "none"`.
