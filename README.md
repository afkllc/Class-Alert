# Class Alert

Class Alert is a Firefox extension that helps you join scheduled classes on time.

Save weekly class times and meeting links, then get one focused alert page for each dated lesson. The alert includes a Join button and can be dismissed without opening the link. The extension stores data locally in Firefox and does not collect or transmit personal data.

## Features

- Weekly class schedule
- One alert per scheduled lesson occurrence
- Configurable alert timing, title, and message
- Optional alert sound and Dismiss button
- Light, dark, and system theme modes
- Import and export for local config backups

## Privacy

Class Alert does not collect, transmit, sell, or share personal data. Class names, meeting links, and settings are stored in local browser storage.

See PRIVACY.md for details.

## Development

Install web-ext through npx, then run:

    npx web-ext lint
    npx web-ext build --overwrite-dest --ignore-files "docs/**" "tests/**" ".superpowers/**" "icon-source.png"

For local testing in Firefox:

    npx web-ext run

## Release

Firefox releases use the root manifest.json, which includes Firefox-specific settings and stable add-on ID class-alert@afkllc.

The alert is recorded for its calendar date, scheduled time, class name, and URL. A recurring class alerts again next week, even when it uses the same meeting link.

Build artifacts are written to web-ext-artifacts/ and are intentionally ignored by Git.

## Credit

Class Alert is developed and maintained solely by afkllc.

## License

MIT
