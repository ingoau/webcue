Note: Basically this entire repo is AI generated as a kinda experiment. Expect stuff to break.

# WebCue

WebCue is a Chromium-native show-control workspace modeled on QLab.

## Run

Requires Bun 1.3 or newer.

```bash
bun install
bun run dev
```

Use `bun run test` for the production build and behavioral checks, `bun run lint` for source validation, and `bun run format` to format the code.

## Deploy

`bun run build` writes the static site to `dist`. Deploy that directory to Vercel, Cloudflare Pages, Netlify, or any static host serving the site at its domain root.

## Implemented

- Nested cue lists, groups and carts with GO, preview, playhead, active cues, auto-continue/follow, bulk editing, search, inline rename, drag placement, context menus, Show mode and keyboard control
- Audio waveforms, trims, slices, preserve-pitch playback, mute/solo/gangs, named inputs, patchable routing, main/output trims and reorderable Web Audio effect chains
- Trimmed and sliced video with hold, loops and fades; rich text; layered multi-stage output; 3D geometry, crop, anchors, masks, blending and GPU effects
- Real microphone, camera and screen capture; Web MIDI, SysEx, MIDI Show Control, MIDI files, MTC and generated LTC; Web Serial lighting bridges; HTTP and WebSocket network cues
- Multi-parameter fades, editable group timelines and looping/crossfading playlists; captured recurring triggers, ducking and related-cue actions
- Fixture-based lighting, per-cue MIDI/timecode patches, SMPTE MIDI files and broad MIDI/MSC/system-message editing
- Workspace warnings, operational windows, media collection/relinking, settings/templates, JSON import/export, IndexedDB media, same-origin and WebSocket collaboration, display placement and Wake Lock
- Best-effort QLab 5 import from `.qlab5` files or zipped project folders, including nested cue lists and packaged media, with persistent warnings for unsupported translations

## Browser limits

Chromium cannot expose native Core Audio patching or Audio Units, arbitrary local processes and AppleScript, desktop blackout, raw UDP/TCP such as Art-Net or OSC, or serverless remote-machine collaboration. WebCue omits those controls instead of presenting inactive UI. Hardware APIs request browser permission when used.

QLab import is not lossless. Device patches, Audio Units, detailed routing/fade matrices, AppleScript, raw OSC/network cues, lighting patches, collaboration state, and display layout require manual review or replacement. Importing a raw `.qlab5` file preserves cue structure but not external media; zip the complete QLab project folder to carry its copied media.
