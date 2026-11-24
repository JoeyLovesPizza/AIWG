# AIWG

Sandbox for tools made for the AI team at Wolf Greenfield (Wolf, Greenfield & Sacks, P.C., an IP law firm). Each tool is its own sub-project folder with its own `package.json`. Everything here is a presentation prototype: no backend, no network calls, no real client data.

GitHub: JoeyLovesPizza/AIWG (public). `.github/workflows/pages.yml` builds `faq/` and publishes it to GitHub Pages on every push to `main`: https://joeylovespizza.github.io/AIWG/. Vite uses `base: './'`, so the build works at that sub-path. The page carries a "Concept prototype · placeholder answers" note, because it uses the firm's real name over placeholder copy; keep it until the AI team has approved the answers.

## Sub-projects

| Folder | What it is | Run |
|---|---|---|
| `faq/` | Client-facing FAQ on how the firm uses AI: searchable accordion by topic, a "View details" sheet with sources, a recently-updated popover, and an ask/suggest form. Built from the Figma sketch `1FwXjJGHINXFKtNwcRvNWW`, node `3:823`. | `npm --prefix faq run dev`, port 5183 |

## faq/

- Vite 8 + React 19 + TypeScript, plain CSS in `src/styles.css` (tokens on `:root`; no Tailwind).
- Type sizes come from the role-named scale on `:root` (`--text-caption` 13 through `--text-display` 52). Add a step there rather than writing a pixel size; the only fixed sizes are the hero drawing's SVG labels and the error badge glyph. Display leading is 1.15 and body text 1.45–1.6.
- `src/data.ts` holds every question, answer and source. Only the patent-work answer comes from the sketch. The other answers and all sources are placeholder copy written for the demo; the AI team has to review them before anyone outside the firm sees them.
- Layout values come from the sketch: a 929px column, and questions indented 105px (`--q-indent`) so they line up with the section titles. The "View details" icon sits in that indent while a row is open. Below 900px the indent drops to zero and the icon is hidden; the sources pill still opens the sheet. The sketch puts the open row's chevron 113px further in than the closed rows'. The code keeps every chevron on the right edge so it doesn't jump when a row opens.
- Each question has a one-line `tldr` and a full `answer`. Rows open on the TL;DR; the ↕ gutter icon switches to the full answer and back, easing the height with WAAPI. A search hit found only in the full answer switches that row to full.
- The detail sheet is a native `<dialog>` with `showModal()`, which provides the focus trap, Escape, and focus return. It always shows the full answer. Hovering or focusing a source highlights the sentences it supports; clicking pins it. `citations()` in `data.ts` links sources to sentences with keyword cues, a placeholder for real authored citations. The footer is a follow-up field ("Ask a follow up") with an up-arrow send button, disabled until there's text.
- The form sends nothing. On Send, the pill cross-fades to a mint "✓ Sent" while each field's text fades up and out (180ms, 40ms stagger). The values clear while hidden, the fields fade back in on their placeholders, and Send returns after 2.4s. Focus stays on Send; a hidden live region announces the result. `LEAVE_MS` in `AskForm.tsx` must match the CSS timings. (An earlier mask-wipe "wash" read as broken and was dropped.)
- The header menu is a fake "AI at Wolf" product switcher: FAQ is current, the other six are "Soon" placeholders.
- The particle values in `PARAMS` (`ParticleMark.tsx`) were tuned with Joe on a DialKit panel, since removed. DialKit is no longer installed. To tune again, add `dialkit` and its `motion` peer, mount `DialRoot` in `main.tsx`, and wrap a `PARAMS` object in `useDialKit`.
- Search (`search.ts`) is fuzzy: each meaningful query word matches by prefix, stem, a small typo, or a plain-language synonym (`SYNONYMS`). Common words, including "AI" and "firm", are ignored. Results need half their words to match, are cut below 30% of the best score, are ranked within sections, and sections are ordered by their best hit.
- The toolbar list button opens every section with its question count. Popovers open below their trigger and flip above when there isn't room (`usePopoverSide` in `useDismiss.ts`).
- Form focus doesn't highlight the field rule and the placeholder example text stays dim (#5c5c5c). Both are Joe's call, dismissed in the design ledger.
- Hero art (`HeroGraphic.tsx`) is an isometric wireframe card index: a lens sweeps the stack, then one card slides out with an orange tab and a "Q.04 / Answer" label, on a 7s CSS loop. Geometry comes from one `iso()` projection; the CSS translations are iso vectors noted beside the keyframes. Reduced motion shows the resolved frame. It loops forever by Joe's choice, though WCAG 2.2.2 asks for a pause control on motion longer than 5s (dismissed in the design ledger).
- Drawer reveal: `main` sits in a black `.drawer` (rounded bottom corners, `z-index: 1`) and the footer is `position: sticky; bottom: 0` behind it, so scrolling slides the drawer off the footer. Only at 901px+ wide and 700px+ tall, where the footer fits; below that it scrolls normally. The page background is orange so it shows around the drawer's corners. As the footer is uncovered, `useDrawerReveal.ts` narrows the drawer: it writes `--drawer-inset` (a `clip-path` side inset with round bottom corners), `--drawer-scale` and `--drawer-radius` on scroll. Progress comes from `footerExposure()` in `reveal.ts`, which the particle intro also uses. The narrowing follows a cubic-bezier, evaluated against reveal progress by `cubicBezier()`. The clip is `none` while the drawer is full width, because an always-on `clip-path` leaves an anti-aliased hairline of orange down the sides. The tuned values (40px inset, 0.96 scale, starting at 7% revealed, bezier 0.64, 0.33, 0.68, 0.63) live in `PARAMS` in that file.
- Footer mark (`ParticleMark.tsx`) samples "A.I.@" in Geist Pixel into canvas particles that drift from the pointer and trail behind its motion. The rAF loop only runs while something moves. Particles scatter and sweep into the letters each time the footer is at least 98% uncovered, and re-scatter once it's back under 30%; `exposed()` measures the part below the drawer's edge and inside the viewport. The glyph tops are drawn flush with the canvas content box, and `.footer-brand` padding (0.42 × the label size) lines them up with the column labels. Tuning values are in `PARAMS` at the top of the file.
- Footer text is white on the orange as designed (70% white for section heads). At 19px that is below WCAG AA; Joe chose the design.
- Icons in `src/assets/icons/` were exported from the Figma file. Fonts are Geist, Geist Serif and Geist Pixel from Vercel's `geist` npm package (OFL, licence in `public/fonts/OFL.txt`), so they can be committed.

## Conventions
- No semicolons, single quotes, 2-space indent.
- Copy changes from the sketch: "Can't find what you're looking for?" (the sketch had "Cant … your"), and the fourth section is numbered 04 (the sketch repeated 03).

## Design profile

profile: site

Build UI with this profile's skills and run `/design-check` before handing back. Profiles are defined in `~/.claude/skills/design-check/profiles.json`.
