# Release Checklist

Use this checklist before uploading a new Firefox Add-ons package.

1. Check `manifest.json` version.
2. Run `npx web-ext lint`.
3. Run `node --check background.js`.
4. Run `node --check options.js`.
5. Run `node --check alert.js`.
6. Build with `npx web-ext build --overwrite-dest`.
7. Upload the new zip from `web-ext-artifacts/`.

Do not commit build zips, private keys, `.env` files, or self-hosted update files.
