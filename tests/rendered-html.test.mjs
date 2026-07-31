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
  for (const text of ["StageCue", "Main Cue List", "Cue Cart", "Workspace settings", "New Camera cue", "New MIDI cue", "New Timecode cue", "Show"]) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /coming soon|not implemented|placeholder cue/i);
});

test("device cues use real browser APIs", async () => {
  const [page, runtime] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/runtime.ts", import.meta.url), "utf8")]);
  for (const api of ["getUserMedia", "requestMIDIAccess", "requestPort", "WebSocket", "BroadcastChannel", "showOpenFilePicker", "showSaveFilePicker", "wakeLock"]) assert.match(`${page}\n${runtime}`, new RegExp(api));
  assert.doesNotMatch(page, /onClick=\{\(\) => \{\}\}/);
});
