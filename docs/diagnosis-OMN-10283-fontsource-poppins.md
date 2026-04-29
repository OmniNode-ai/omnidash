# OMN-10283: @fontsource/poppins missing from node_modules

## Diagnosis

`@fontsource/poppins ^5.2.7` was declared in `package.json:45` but absent from `node_modules/@fontsource/`.
The import at `src/styles/globals.css:39` (`@import "@fontsource/poppins/600.css"`) caused a vite/postcss
resolution error at build time.

Root cause: `node_modules` was not installed (or was partially installed). Running `npm install` restored
the package tree and the 600-weight CSS file.

## Verification

```
$ ls node_modules/@fontsource/poppins/600.css
node_modules/@fontsource/poppins/600.css     # exists — weight 600 ships in v5.2.7

$ npm run check
> tsc --noEmit
# (no output — clean)
```

`git status` after `npm install` showed no diff: `package-lock.json` was already correct; only
`node_modules/` was stale (gitignored).
