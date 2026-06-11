# Landing page overhaul: design spec

Phase 3 artifact. The sensibility: a well set charter. Brass, waxed canvas,
letterpress, translated to the web as paper, ink, one accent, serif type,
mono numerals, hairline rules, and almost nothing else. The existing Poa
logo (black typewriter slab "poa" between two heavy rules) already belongs
to this world; the page finally agrees with its own mark.

## Palette (added to the Chakra theme as named palettes)

Three colors total, plus derived tints of ink for secondary text and rules.

```
paper.50   #FCFAF4   lifted panels (specimen card)
paper.100  #F7F2E8   page background (warm ivory)
paper.200  #EFE7D7   alternate band background, used at most once
paper.300  #E3D9C4   borders on panels

ink.300    #C9C0AF   hairline rules (1px)
ink.500    #57503F   secondary text (7.0:1 on paper.100)
ink.900    #211D15   primary text (14.9:1 on paper.100)

meadow.600 #33523B   accent: links, mono labels, primary button bg
meadow.700 #2A4431   hover, active
```

Accent rationale: the brief sanctions brass, ochre, oxblood, or deep green.
Deep green wins because Poa is the botanical name of meadow grass, because
ledger green reads institutional rather than decorative, and because it
holds AA contrast at small mono sizes where brass and ochre fail.
meadow.600 on paper.100 is 6.6:1; ink.900 is 14.9:1; ink.500 is 7.0:1.
All pass AA, the first two pass AAA for normal text.

No gradients. No shadows except a 1px border on the one lifted panel.
No paper grain texture: the brief says if in doubt, none, and I was in doubt.

## Type

- **Serif, display and body**: Newsreader (Google Fonts, self hosted woff2,
  variable: optical size + weight axes, roman + italic). Chosen over EB
  Garamond (too costume) and Source Serif (too neutral): Newsreader is built
  for on screen text and its display cuts have real character.
- **Mono, numerals and labels**: IBM Plex Mono (400, 500). Typewriter
  skeleton without the costume of Courier. Used for: section numbers, dates,
  ledger rows, template names, the nav wordmark echo, button labels.
- App fonts (Inter, Roboto Mono via Google `<link>`) are untouched; the app
  keeps its theme. Two new theme font keys: `fonts.charter` (Newsreader),
  `fonts.ledger` (IBM Plex Mono). Landing components reference the keys,
  never raw family strings.
- Self hosting: woff2 files in `public/fonts/`, `@font-face` in
  `globals.css`, `font-display: swap`, latin subset only. Preload the two
  files the hero needs (serif roman, mono regular) from the landing page
  head only.

Scale (desktop → mobile via clamp):

```
display   clamp(2.75rem, 6.5vw, 4.75rem)   lh 1.04   wght 460  hero only
h2        clamp(1.9rem, 3.5vw, 2.6rem)     lh 1.15   wght 470
h3        1.3125rem                         lh 1.3    wght 540
body      1.0625rem (17px)                  lh 1.65   wght 400
small     0.9375rem                         lh 1.6
mono-label 0.8125rem, tracking 0.14em, uppercase, wght 500
mono-data  0.875rem, tracking 0.02em
```

Body measure capped at 65ch. Headings tracked very slightly tight
(-0.015em). Italic reserved for the vignettes and nothing else.

## Spacing, grid, rules

- Container: max-width 1100px, side padding clamp(1.25rem, 5vw, 3rem).
- Prose column: max-width 680px inside the container.
- Section rhythm: vertical padding clamp(4.5rem, 9vw, 7rem).
- Each numbered section opens with a hairline rule (1px ink.300) and a mono
  label row: number left (`01`), running label right. Like a legal exhibit.
- Multi-column moments (steps, pillars): CSS grid, 1 column under 768px,
  3 columns at 768px+, generous 3rem gaps. Who it is for: a single column
  list of ledger rows separated by hairlines at every width.
- The one lifted panel (charter specimen) gets paper.50 bg, 1px paper.300
  border, no radius beyond 2px, no shadow.

## Motion

- Hero: the existing pure CSS `.poa-fade` (opacity only, 0.6s) on the hero
  block, nothing staggered. Already wrapped in
  `prefers-reduced-motion: no-preference`.
- Below the fold: nothing. No scroll triggered reveals (`.poa-reveal` is not
  used on the new page). No parallax, no hover lifts.
- Links: underline 1px → 2px on hover, color shift to meadow.700. Buttons:
  background shift only. Both are non-motion state changes.
- This satisfies the repo constraint that above the fold animation is pure
  CSS (static export bakes framer-motion's opacity:0 into the HTML).

## Imagery

Typographic only. One diagrammatic element: the charter specimen, a small
document fragment set in the real type system (org name in serif, mono
ledger rows: founded date, members, rules, a recorded decision), clearly
labeled `specimen` in mono small caps so it cannot be mistaken for a real
organization. It echoes the logo's rule-above, rule-below construction.
No photographs, no illustrations, no screenshots, no video placeholder.

## Components (all new, in `src/components/landing/charter/`)

- `tokens.js`: shared constants (container widths, section padding, label
  styles) so sections never restate magic values.
- `Bones.jsx`: `Wrap` (container), `SectionRule` (hairline + mono number +
  running label), `CharterButton` (primary/quiet), `LedgerRow`.
- `CharterNav.jsx`: logo, three anchors, Docs, Browse, auth button (logic
  identical to today's accountMenuItem, labels re-cased).
- `CharterHero.jsx`: frontispiece. Mono eyebrow, display headline, subline,
  two actions. Centered single column, like a title page.
- `Specimen.jsx`: the charter specimen panel.
- `ProblemSection.jsx` (01), `HowItWorks.jsx` (02, includes Specimen),
  `Pillars.jsx` (03), `WhoItsFor.jsx` (04 + proof line), `Ethos.jsx` (06,
  labeled 05 on the page if proof merges into 04; numbering finalized in
  build), `CharterFooter.jsx`.
- `src/pages/index.js`: keeps all auth/white-label/solidarity logic exactly
  as is; swaps section imports and rewrites meta + JSON-LD.

Old section components (HeroSection, ValuesSection, WhatIsPoa,
UseCaseShowcase, FeatureCards, ClosingCTA, HowItWorks) are deleted once the
new page lands. `Navbar.jsx` and `Footer.jsx` stay untouched because
/u, /protocol, /about, /explore import them.

## Pass 3 additions (after Hudson's review: "too basic, not visually appealing")

The first build was so restrained it read as a wireframe. Pass 3 added
typographic drama without leaving the system; every element below is still
paper, ink, one accent, serif, mono, rules.

- **The hero is built like the logo**: a 3px rule above and below the
  headline (the mark is "poa" between two rules; the page now is too).
  Display size up to 5.25rem, with `that lasts.` set in italic. Eyebrow
  splits into `est. 2024` / `poa.box` corner folios.
- **Large serif section numerals** (4.25rem, meadow.600) hang beside each
  H2; the tiny mono `01` stays on the rule line. Letterpress pages live on
  scale contrast; the first build had none.
- **Double rules** (3px over 1px hairline) open every section: the classic
  fine-print device.
- **Section 02 is two columns at lg**: numbered steps left (large serif
  `1. 2. 3.`), the specimen sticky on the right, so the steps are read
  against the thing they produce. The specimen gained a treasury row and a
  two-entry decision record.
- **New section 03, "What an organization gets"**: the product enumerated
  as ledger rows (Votes, Tasks, Treasury, Members, Learning), each with a
  one-line description and a mono annotation. The page now shows the
  product's surface, which the first build never did.
- **Ethos is an inverted plate**: paper type on meadow.700, the page's one
  color moment, like the cloth cover of the book. Contrast paper.100 on
  meadow.700 is 9.5:1.
- **A colophon close**: "Starting takes minutes. Lasting is the point."
  with the primary action repeated once, quietly, for readers who reach
  the end.
- **Nav gains a compact `Start` button** so the action persists while
  reading.
- Vignettes scaled up (to 1.875rem italic) and the problem section's
  closing line extended ("The group stayed a group chat, and everything it
  built stayed borrowed.").

## Pass 4: the broadside (after Hudson: "not colorful, too minimal, like a
## Google Slides template; the landing page is a first impression")

The reference moved from "university press charter" to **union broadside /
WPA poster**: the same letterpress DNA, printed with a full set of spot
colors. The brief's bans still hold (no gradients, no glassmorphism, no
photography, no parallax); the restraint now lives in the *materials*, not
the volume.

- **Palette grew to a print shop's ink rack**: meadow green, oxblood
  (`#76322B` text 8.3:1, `#5E2722` plate 10.5:1), ochre (`#D9A84E` gold on
  dark plates 4.9:1+, `#A8741F` large-size-only on paper 3.6:1). Paper and
  ink unchanged.
- **The ribbon (TriRule)**: green/oxblood/ochre rules stacked, the page's
  signature device — hero frame (mirrored below the headline), colophon
  ornament, footer rule. The logo is a name between rules; the ribbon is
  those rules in banner colors.
- **Hero at broadsheet scale**: display to 6.25rem, `that lasts.` in
  oxblood italic, lowercase `poa.box` folio, and a mission line: "Built
  for worker and community ownership."
- **Vignettes became three color plates** (meadow.700 / oxblood.700 /
  ink.900) with paper italic and gold numerals: the broadside's panels.
- **Letterpress offset shadows** (solid, never blurred) on buttons and the
  specimen card: a misregistered second impression.
- **Color stations rotate** through numerals, step numbers, pillar rules,
  and ledger bullets (green → oxblood → ochre).
- **The footer is the ink-black base of the poster**, with the mark pasted
  on as a paper label, ochre column heads, and the ribbon above the
  substrate line.
- **Brand casing**: the name is `poa`, lowercase, everywhere — including
  sentence starts, the title tag, JSON-LD `name` fields, alt text, and the
  OG image (the uppercase `POA.BOX` folio came from a mono label's
  text-transform and is gone). "Poa" survives only as a JSON-LD
  alternateName for search.
- **Mission copy**: the ethos now says it plainly: "We built poa because
  worker and community ownership is how a better future gets made, and the
  tools for it should be a public good." (Open-source + free: the claim is
  verifiable.)

## Deviations from the brief's section 4, with reasons

1. Accent is deep green, not brass: named above (botany, ledgers, AA at
   small sizes). Brass appears nowhere; one accent only, as directed.
2. Mono is IBM Plex Mono rather than a literal typewriter face: typewriter
   adjacent was the requirement; Plex keeps numerals tabular and screens
   well at 13px, where Courier Prime gets woolly.
3. Built with Chakra primitives (Box/Text with `as=` semantics) rather than
   raw HTML and a parallel stylesheet: the brief says extend the repo's
   system, and the repo's system is Chakra. Semantic HTML is preserved via
   `as="section"`, `as="h2"`, real `<a>`/`<button>` elements.
4. The numbered-section device skips the hero (a title page carries no
   exhibit number).
5. Buttons are set in mono, not serif: buttons are controls, and the mono
   is the page's voice for the mechanical. (Tested in review; reverted if
   it reads gimmicky.)
6. OG image: regenerated in the new system (paper, ink serif, the mark) at
   1200x630. The default `/images/poa_og.webp` used by every other page is
   left untouched; the landing passes its own `ogImage` prop.

## Pass 6: receipts (live registry + the money band)

- The charter card is no longer fiction-first in spirit: it renders the
  fictional specimen only as first-paint fallback and swaps to a live
  organization from the public registry (label flips to
  `from the registry / live`). Same figure dimensions, no animation, no
  skeleton, zero hydration mismatch.
- The proof band carries a live count line in a height-reserved slot.
- New section 04 "Where the money lives": dl/dt/dd Q&A rows on the page's
  single paper.200 full-bleed band, breaking the long paper run the cold
  review called the "mid-page flatline". Sections renumbered 05/06/07.
- Ethos plate closes with the skin-in-the-game line ("Poa itself runs as
  an organization on Poa"), linked live when the registry confirms it.
