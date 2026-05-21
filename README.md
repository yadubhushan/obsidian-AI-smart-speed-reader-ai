# Speed Reader AI

Read long Obsidian notes faster without losing focus.

Speed Reader AI uses RSVP (rapid serial visual presentation) to turn your notes into a focused word-by-word reading flow, so you can move through dense writing, saved articles, drafts, and study notes with less eye movement and fewer distractions.

Repository: [github.com/yadubhushan/obsidian-AI-smart-speed-reader-ai](https://github.com/yadubhushan/obsidian-AI-smart-speed-reader-ai)

## Why Speed Reader AI?

Long notes are easy to skim badly and hard to read deeply. Speed Reader AI helps you stay locked on one word at a time, control your pace, and finish notes without constantly losing your place.

Use it when you want to:

- Get through long notes faster
- Review research or study material
- Read drafts without visual clutter
- Stay focused when your attention keeps jumping
- Read selected passages without leaving Obsidian

## Features

- **Word-by-word reading** — Read in a focused RSVP view instead of scanning full paragraphs.
- **Tabbed reader** — Home (RSVP), Content (full source scroll), Settings, Shortcuts, and Advanced panes inside the reader modal.
- **In-modal settings** — Configure pacing, display, themes, bookmarks, and dictionary from Settings / Advanced tabs (or **Open speed reader preferences** without opening a document).
- **Reader themes** — Dark, light, or auto color scheme with high-contrast WCAG palettes for the reading surface.
- **Optimal recognition point highlighting** — Highlights the key letter in each word to help your eyes recognize words faster.
- **Markdown-aware cleanup** — Removes formatting noise like links, bold text, code, frontmatter, and comments before reading.
- **Natural pacing** — Adds small pauses at punctuation, numbers, and longer words so the flow feels less robotic.
- **Live speed control** — Change WPM, skip forward or backward, and jump between sections while reading.
- **Focus mode** — Hide controls and keep only the current word on screen.
- **Selection support** — Read selected text, or start from the whole note.
- **EPUB books** — Speed read vault EPUBs with chapter navigation and resume.
- **Word lookup** — Press **D** to look up the current word in an inline overlay (English; requires internet).

## How it works

1. Open a note in Obsidian.
2. Select text, or leave nothing selected to read the full note.
3. Run **Speed Reader AI: Start speed reading**.
4. Press **Space** to start, pause, or resume.
5. Use the bottom tab dock to switch between **Home**, **Content**, **Settings**, **Shortcuts**, and **Advanced**.

## Install

### BRAT (beta)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin and enable it.
2. Open **Settings → BRAT → Add Beta plugin**.
3. Enter: `yadubhushan/obsidian-AI-smart-speed-reader-ai`
4. Enable **Speed Reader AI** under **Settings → Community plugins**.

BRAT installs release assets from GitHub into `.obsidian/plugins/speed-reader-ai/` on each device.

### Community catalog

When listed, open **Settings → Community plugins → Browse**, search for **Speed Reader AI**, then install and enable it.

### Manual install

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yadubhushan/obsidian-AI-smart-speed-reader-ai/releases), then copy them to:

```
<vault>/.obsidian/plugins/speed-reader-ai/
```

Reload Obsidian and enable the plugin.

### Obsidian Sync and mobile

Do **not** rely on Sync to deliver plugin binaries. Install via BRAT or the community catalog on each device (~350 KB per install).

| Path | Sync? | Why |
|------|-------|-----|
| `.obsidian/plugins/` | **No** | Large; changes every release — use BRAT/catalog instead |
| `.speedreader/` | **Yes** | Reading progress, AI prepare cache, EPUB parse cache |
| Notes and EPUBs | **Yes** | Source content |

Plugin settings (API keys, reader prefs) live in `.obsidian/plugins/speed-reader-ai/data.json`. If you exclude the plugins folder from Sync, configure LLM settings once on each device.

### Mobile reader

On iOS/Android Obsidian, the reader uses touch-first controls (desktop layout unchanged):

- **Tap** the word area — play / pause
- **Swipe** left / right — previous / next word
- **Swipe** on the chapter pill (when paused) — previous / next chapter or section
- **☰** (FAB) — bottom sheet for Home, Content, Settings, Shortcuts, Advanced; chapter jump when paused

While playing, chrome collapses to maximize the RSVP area.

## Build from source

Requires Node.js 18+.

```bash
npm install
npm run test
npm run build          # outputs main.js, manifest.json, styles.css to repo root (release layout)
```

For local vault development inside a monorepo, build into the vault plugin folder:

```bash
SPEED_READER_OUT=vault npm run build
npm run dev            # watch mode; always writes to vault .obsidian/plugins/speed-reader-ai/
```

Copy built artifacts to `<vault>/.obsidian/plugins/speed-reader-ai/` or use the vault outDir above.

## Settings

**Reader** options (in-modal):

- **Settings tab** — font, WPM, chunk size, color scheme, auto-start, display toggles
- **Advanced tab** — micropause, bookmark templates, dictionary

Open without a document: command palette **Open speed reader preferences**, or **Settings → Speed Reader AI → Open speed reader preferences**.

**AI prepare** (LLM backend, API keys, model list, timeouts, cache clear) lives in **Settings → Community plugins → Speed Reader AI**.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `←` / `→` | Skip 10 words |
| `↑` / `↓` | Change speed by 25 WPM |
| `D` | Look up current word |
| `F` | Toggle focus mode |
| `Esc` | Close reader (dismisses dictionary overlay first if open) |

## Network and privacy

Word lookup sends only the looked-up word to the [Free Dictionary API](https://dictionaryapi.dev/) (`api.dictionaryapi.dev`). No API key is required. Disable lookup in the reader **Advanced** tab.

AI prepare sends note text to your configured LLM backend:

| Backend | Desktop | Mobile |
|---------|---------|--------|
| **Auto (default)** | Cursor CLI when installed, else AI Providers, else API key | AI Providers, else API key |
| **Cursor CLI** | Local Cursor agent (no cloud by default) | Not available |
| **Obsidian AI Providers** | Uses keys from the [AI Providers](https://github.com/pfrankov/obsidian-ai-providers) community plugin | Same |
| **API key** | OpenAI, OpenRouter, or custom OpenAI-compatible endpoint | Same |

Configure AI in **Settings → Community plugins → Speed Reader AI**. API keys are stored locally in plugin settings. No telemetry.

## Data storage

Prepared documents, book parse cache, and reading progress are stored in the vault at:

```
.speedreader/
├── read-cache/          # AI prepare output (per note/doc key)
├── book-cache/          # Parsed EPUB cache
└── reading-state.json   # Resume positions and pins
```

This folder survives plugin redeploys and syncs with your vault. On first load after upgrading, existing data under `.obsidian/speed-reader-ai/` is copied into `.speedreader/` automatically when the new paths are empty.

## License

[0-BSD](LICENSE)
