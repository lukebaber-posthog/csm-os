# Channel icons

Vendored rather than loaded from a CDN: the renderer should not reach the network
for chrome, and an offline board still has to draw its cards.

| File | Source | Retrieved |
| --- | --- | --- |
| `slack.svg` | [Wikimedia Commons — `Slack_icon_2019.svg`](https://commons.wikimedia.org/wiki/File:Slack_icon_2019.svg) | 2026-07-31 |
| `gmail.svg` | [Wikimedia Commons — `Gmail_icon_(2020).svg`](https://commons.wikimedia.org/wiki/File:Gmail_icon_(2020).svg) | 2026-07-31 |
| `teams.svg` | [Wikimedia Commons — `Microsoft_Office_Teams_(2025–present).svg`](https://commons.wikimedia.org/wiki/File:Microsoft_Office_Teams_(2025%E2%80%93present).svg) | 2026-07-31 |
| `discord.svg` | [simple-icons `discord.svg`](https://github.com/simple-icons/simple-icons/blob/develop/icons/discord.svg), filled with Discord blurple `#5865F2` | 2026-08-03 |

simple-icons publishes monochrome silhouettes, so `discord.svg` is Clyde in
Discord's own blurple rather than a black-on-transparent glyph — that matches how
Discord presents the mark, and how the other four read in the pill.

Each file is the official mark as published, with one edit: `slack.svg` shipped
with `width`/`height` but **no `viewBox`**, and an SVG without a viewBox does not
scale its contents — rendered into a 14px `<img>` box it would have been cropped
to its top-left corner rather than shrunk. `viewBox="0 0 127 127"` was added and
the path data left byte-for-byte identical.

These are third-party trademarks, included only to identify the service each one
belongs to inside a private internal tool. They are not covered by this
repository's licence.
