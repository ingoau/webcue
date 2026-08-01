# StageCue

StageCue is a Chromium-native show-control workspace modeled on QLab.

## Run

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Use `npm test` for the production build and behavioral checks, and `npm run lint` for source validation.

## Implemented

- Nested cue lists, groups and carts with GO, preview, playhead, active cues, auto-continue/follow, bulk editing, search, inline rename, drag placement, context menus, Show mode and keyboard control
- Audio waveforms, trims, slices, preserve-pitch playback, mute/solo/gangs, named inputs, patchable routing, main/output trims and reorderable Web Audio effect chains
- Trimmed and sliced video with hold, loops and fades; rich text; layered multi-stage output; 3D geometry, crop, anchors, masks, blending and GPU effects
- Real microphone, camera and screen capture; Web MIDI, SysEx, MIDI Show Control, MIDI files, MTC and generated LTC; Web Serial lighting bridges; HTTP and WebSocket network cues
- Multi-parameter fades, editable group timelines and looping/crossfading playlists; captured recurring triggers, ducking and related-cue actions
- Fixture-based lighting, per-cue MIDI/timecode patches, SMPTE MIDI files and broad MIDI/MSC/system-message editing
- Workspace warnings, operational windows, media collection/relinking, settings/templates, JSON import/export, IndexedDB media, same-origin and WebSocket collaboration, display placement and Wake Lock

See [outputs/README.md](outputs/README.md) for the complete feature and browser-limit notes.

## Browser limits

Chromium cannot expose native Core Audio patching or Audio Units, arbitrary local processes and AppleScript, desktop blackout, raw UDP/TCP such as Art-Net or OSC, or serverless remote-machine collaboration. StageCue omits those controls instead of presenting inactive UI. Hardware APIs request browser permission when used.
