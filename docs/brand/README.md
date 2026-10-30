# Resolve brand

The design system for everything Resolve shows people: the hosted prototype page, the pane, the README image and the system map. Chosen by the maintainer on 2026-10-30. The brand page shows it all rendered in both themes: https://claude.ai/artifact/WpC5DuEukt6KnjEi7ZTsRk (private until the maintainer shares it).

- `tokens.css`: colours for light and dark, the three fonts, the wordmark, `mark` for highlighted SOP text, and the outcome stamps. Import it instead of copying values.
- Fonts are not loaded by `tokens.css`, so a page can self-host them (the hosted page must, since it is cross-origin isolated for Z3) or link Google Fonts: Public Sans 400/600/800, Source Serif 4 400/600, IBM Plex Mono 400/500.
- `favicon.svg`: a highlighted R on a white tile, the same in both themes so the R stays visible on a dark tab bar.
- Wordmark: `<span class="wordmark">Resolve</span>`. In light mode the whole word sits under a highlighter stroke across the lower half of the letters; in dark mode the stroke covers the full height, with dark letters on it.

## Rules

- Yellow means a person has to look or decide here: the wordmark, highlighted SOP lines, the current step, the owner's chosen option, a past case an answer changes. Nothing else is yellow.
- Pages sit on `--desk`, and content sits on `--paper` sheets with a 1px `--rule` border. No shadows, square corners.
- Public Sans for the interface, Source Serif 4 only for words quoted from an SOP, IBM Plex Mono for case IDs and stamps.
- Outcome colours (approve, request documents, escalate, decline, and a muted dashed one for incomplete, which waits on a fact rather than deciding) appear only on outcome labels and never stand in for the accent.
- The first mention of KYB on a page reads "Know Your Business (KYB)", followed by one line: the checks a bank runs to confirm who owns and controls a company before opening its account.
- Recorded runs are labelled as recorded, with their date.
- Plain words, no marketing voice.

## Where it can't carry over

The pane is drawn with Claude Code's own elements: no custom fonts, letter-spacing or per-side borders. There, labels are sentence case, SOP quotes sit in a whole 1px box, and buttons stay native, with the chosen option's row tinted.

The README image is rendered from `docs/images/resolve-hero.html`.
