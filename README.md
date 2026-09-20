# Class Alert

Class Alert is a Firefox extension that helps you join scheduled classes on time.

You can save weekly class times and meeting links, then get a focused alert page with a Join button when class starts. The extension stores data locally in Firefox and does not collect or transmit personal data.

## Features

- Weekly class schedule
- Class link alerts
- Optional alert sound
- Skip alerts when the class link is already open in a browser tab
- Light, dark, and system theme modes
- Import and export for local config backups

## Privacy

Class Alert does not collect, transmit, sell, or share personal data. Class names, meeting links, and settings are stored in local browser storage.

See [PRIVACY.md](PRIVACY.md) for details.

## Development

Install `web-ext` through `npx`, then run:

```bash
npx web-ext lint
npx web-ext build --overwrite-dest
```

For local testing in Firefox:

```bash
npx web-ext run
```

## Release

Firefox releases use the root `manifest.json`, which includes Firefox-specific settings and the public add-on ID.

Build artifacts are written to `web-ext-artifacts/` and are intentionally ignored by Git.

## License

MIT
