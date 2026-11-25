# CoverGrid design

For an operations manager on a laptop, working with dense data. Calm, clear, trustworthy.
Light theme only.

## Colour: 60 / 30 / 10

| Share | Token | Value | Used for |
|---|---|---|---|
| 60% | `paper` / `surface` | `#f5f7fa` / `#ffffff` | page and panels |
| 30% | `ink` | `#1b2a47` | sidebar, headings, body text |
| 10% | `accent` | `#0f7c74` | primary buttons, links, current page, focus ring |

Support: `muted` `#5a6681`, `line` `#dbe1ea`.
Status colours are not decoration: `danger` `#b3261e` for must-fix problems and
deleting, `warn` `#8a5a00` on `#fff3d6` for preferences. Never use them for anything else,
and never rely on colour alone: always pair with words.

## Type
IBM Plex Sans, tabular numbers in tables. Sizes 12 / 14 / 18 / 24. Sentence case everywhere.

## Shape
Radius 6px for controls, 10px for panels. Borders, not shadows. Compact rows.

## Behaviour
- Buttons say what happens: "Add employee", "Save changes", "Yes, delete".
- Errors say what is wrong and how to fix it, next to the field.
- Destructive actions need a second click.
- No page-load animation.
