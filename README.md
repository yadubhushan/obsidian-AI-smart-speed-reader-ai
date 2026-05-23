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

Install plugin binaries on each device via BRAT or the community catalog (~350 KB per install). Enable **Settings → Sync → Plugin settings** to sync settings, reading progress, and caches across devices.

| Path | Sync? | Why |
|------|-------|-----|
| `{configDir}/plugins/speed-reader-ai/data.json` | **With plugin sync** | Reader and AI settings |
| `{configDir}/plugins/speed-reader-ai/data/` | **With plugin sync** | Reading progress, AI prepare cache, EPUB parse cache, LLM model list, prompts |
| Notes and EPUBs | **Yes** | Source content |

Replace `{configDir}` with your vault config folder (usually `.obsidian`). Do not rely on Sync to deliver `main.js` — use BRAT or the catalog per device.

### Mobile reader

On iOS/Android Obsidian, the reader uses touch-first controls (desktop layout and keyboard shortcuts unchanged):

| Gesture | Action |
|---------|--------|
| Tap center | Play / pause |
| Double-tap left / right | Skip back / forward |
| Hold screen edge | Continuous rewind / fast-forward |
| Long-press word | Dictionary (bottom sheet) |
| Tap context word | Dictionary for that word |
| Swipe up / down (playing) | Increase / decrease WPM (brief toast) |
| Swipe down top bar | Expand chapter + progress; second swipe closes reader |
| 🔖 (transport dock) | Bookmark (paragraph + highlighted sentence) |
| ☰ (transport dock) | Menu: Chapters · Reading · Settings · Advanced |

While **playing**, chrome collapses to the RSVP word and progress strip. While **paused**, the transport dock shows **▶** plus 🔖 📖 ☰ (skip buttons hidden; use gestures to skip). Pause context shows the **current line only**; font size is configurable via **Context line font size** in Settings. First mobile session shows a 4-step coach-mark overlay for gesture discovery.

**Bookmarks on mobile:** passage saves the full paragraph; the current sentence is marked with `==***like this***==` in the blockquote.

## Build from source

Requires Node.js 18+.

```bash
npm install
npm run test
npm run build          # outputs main.js, manifest.json, styles.css to repo root (release layout)
```

For local vault development inside a monorepo, build and deploy into the vault plugin folder:

```bash
npm install
npm run deploy       # production build → <vault>/.obsidian/plugins/speed-reader-ai/
npm run dev          # watch mode; always writes to vault .obsidian/plugins/speed-reader-ai/
```

Equivalent to `SPEED_READER_OUT=vault npm run build`. Override the target with `OBSIDIAN_PLUGIN_DIR=/path/to/vault/.obsidian/plugins/speed-reader-ai npm run deploy`.

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

Word lookup sends only the looked-up word to online dictionary APIs. Optionally configure a **Merriam Webster** Collegiate Dictionary API key in **Settings → Community plugins → Speed Reader AI → Dictionary** ([register free key](https://dictionaryapi.com/register/index); 1000 requests/day non-commercial). When a key is set, lookups use Merriam Webster first, then fall back to [dictionaryapi.dev](https://dictionaryapi.dev/) and [FreeDictionaryAPI.com](https://freedictionaryapi.com/) (Wiktionary). Without a key, the free chain runs unchanged. Attribution in the dictionary footer reflects which source returned the definition. Disable lookup in the reader **Advanced** tab.

AI prepare sends note text to your configured LLM backend:

| Backend | Desktop | Mobile |
|---------|---------|--------|
| **Auto (default)** | Cursor CLI when installed, else AI Providers, else API key | AI Providers, else API key |
| **Cursor CLI** | Local Cursor agent (no cloud by default) | Not available |
| **Obsidian AI Providers** | Uses keys from the [AI Providers](https://github.com/pfrankov/obsidian-ai-providers) community plugin | Same |
| **API key** | OpenAI, OpenRouter, or custom OpenAI-compatible endpoint | Same |

Configure AI in **Settings → Community plugins → Speed Reader AI**. API keys are stored locally in plugin settings. No telemetry.

## Data storage

Prepared documents, book parse cache, and reading progress are stored under the plugin data folder (syncs when Obsidian plugin settings sync is enabled):

```
{configDir}/plugins/speed-reader-ai/
├── data.json              # settings (loadData/saveData)
└── data/
    ├── reading-state.json # resume positions and pins
    ├── read-cache/        # AI prepare output (per note/doc key)
    ├── book-cache/        # parsed EPUB cache
    ├── llm-models.json    # editable model list
    └── prompts/*.txt      # AI prepare prompt templates
```

On first load after upgrading, existing data under `vault/.speedreader/` or legacy `.obsidian/speed-reader-ai/` is copied into `data/` automatically when the new paths are still empty. You can delete the old `.speedreader/` folder manually afterward.

## License

[0-BSD](LICENSE)
