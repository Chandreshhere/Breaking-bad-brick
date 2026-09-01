# App icons and splash screens

The SVGs here are the source of truth. The PNGs beside them are rendered
output, committed so a build never depends on a working SVG rasteriser, and
the platform assets under `android/` and `ios/` are generated from those.

| File | Becomes |
|:--|:--|
| `icon-only.svg` | The iOS app icon and the legacy square Android launcher icon |
| `icon-foreground.svg` / `icon-background.svg` | The two layers of the Android adaptive icon |
| `splash.svg` | Every splash screen, light and dark |

## Regenerating

```sh
npm run assets
```

That renders the SVGs to PNG and then runs `@capacitor/assets`, which writes
81 files across both native projects. Commit the result.

## Two things that are easy to get wrong

**The adaptive foreground must fill its canvas.** `mipmap-anydpi-v26/ic_launcher.xml`
already insets both layers by 16.7%, and that inset *is* the safe zone. Art
that also hugs a safe zone gets the margin applied twice and ends up as a
small mark adrift in a large circle.

**The splash is centre-cropped, not letterboxed.** One square is scaled to
cover every aspect ratio, so on a 9:19.5 phone only the central ~46% of its
width survives. The wordmark is sized to sit inside 40%; anything wider is
cut in half rather than merely looking tight.
