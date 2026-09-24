# Release Checklist

Use this checklist before uploading a new Firefox Add-ons package.

1. Check manifest.json version.
2. Run npx web-ext lint.
3. Run node --check background.js.
4. Run node --check options.js.
5. Run node --check alert.js.
6. Run node --check schedule-utils.js.
7. Run node --test tests/schedule-utils.test.js.
8. Build with npx web-ext build --overwrite-dest --ignore-files "docs" "docs/**" "tests" "tests/**" ".superpowers" ".superpowers/**" "icon_source.png".
9. Inspect ZIP manifest: ID must be class-alert@afkllc, version must be 1.1.
10. Test ZIP in Firefox before uploading.

Do not commit build zips, private keys, .env files, or self-hosted update files.
