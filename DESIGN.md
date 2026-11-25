# CoverGrid design

For an operations manager on a laptop, working with dense data. Friendly but professional,
easy to scan. Light theme with a navy side menu.

## Layout
- The app fills the window. The dashboard does not scroll on a laptop; long tables and
  lists scroll inside their own panel, with headers that stay in view.
- Dashboard order: numbers, then to-do list beside a month calendar, then pods.
- Side menu: daily work first (Dashboard, Roster, Time off); setup data in groups.

## Colour: 60 / 30 / 10

| Share | Token | Value | Used for |
|---|---|---|---|
| 60% | `paper` / `surface` | `#f7f7fb` / `#ffffff` | page and panels |
| 30% | `ink` | `#1c1a33` | side menu, headings, text |
| 10% | `accent` | `#5b3cc4` | buttons, links, current page, focus ring |

Support: `muted` `#5a5773`, `line` `#e3e1ee`, `accent-soft` `#f0edfb`.
`danger` `#b3261e` is only for must-fix problems and deleting. Preferences use a
grey-purple (`warn`); no orange or yellow. Never rely on colour alone: pair with words.

## Type
Manrope, tabular numbers in tables.

## Shape
Radius 6px for controls, 10px for panels. Borders, not shadows. Compact rows.

## Behaviour
- Buttons say what happens: "Add employee", "Save changes", "Yes, delete".
- Errors say what is wrong and how to fix it, next to the field.
- Destructive actions need a second click.
- No page-load animation.
