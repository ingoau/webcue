import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the complete StageCue workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>StageCue - Browser Show Control<\/title>/);
  for (const text of ["StageCue", "Main Cue List", "Workspace settings", "New Camera cue", "New MIDI cue", "New Timecode cue", "Open stage output", "Show"]) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /coming soon|not implemented|placeholder cue/i);
});

test("device cues use real browser APIs", async () => {
  const [page, runtime] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/runtime.ts", import.meta.url), "utf8")]);
  for (const api of ["getUserMedia", "getDisplayMedia", "requestMIDIAccess", "requestPort", "AudioWorkletNode", "WebSocket", "BroadcastChannel", "showOpenFilePicker", "showSaveFilePicker", "wakeLock"]) assert.match(`${page}\n${runtime}`, new RegExp(api));
  assert.doesNotMatch(page, /onClick=\{\(\) => \{\}\}/);
  for (const behavior of ["MIDI Timecode", "Linear Timecode", "timecodeTrigger", "secondTriggerOnRelease", "fadeOpacity", "Import Settings", "Export Settings", "Permission granted", "Open stage output", "beforeunload", "active-cue"]) assert.match(page, new RegExp(behavior));
  assert.doesNotMatch(page, /coming soon|not implemented|href=["']#["']/i);
});

test("cue editing and output controls are functional", async () => {
  const [page, runtime, css] = await Promise.all(["page.tsx", "runtime.ts", "globals.css"].map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")));
  for (const behavior of ["selectedIds", "inline-name", "drop-before", "cue-type-sidebar", "audioRoutes", "AudioEditor", "AudioRouting", "about:blank", "Open stage output", "Select Found"]) assert.match(`${page}\n${css}`, new RegExp(behavior));
  for (const behavior of ["analyzeAudio", "ChannelSplitter", "ChannelMerger", "setSinkId"]) assert.match(runtime, new RegExp(behavior));
  assert.doesNotMatch(page, /\{stage && <Stage/);
});
