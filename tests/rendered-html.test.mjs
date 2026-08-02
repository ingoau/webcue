import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { childrenOf, depthOf, descendantsOf, dropFrameSeconds, dropFrameText, migrateGroups, nextSibling, visibleCues } from "../app/model.mjs";
import { cueTargetPatch, curveValue, dmxFrame, interpolateCue, midiMessage, parseLightCommand, sanitizeRichText, setPath, timelineLength } from "../app/features.mjs";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the complete StageCue workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>StageCue - Browser Show Control<\/title>/);
  for (const text of ["StageCue", "Main Cue List", "Workspace settings", "New Camera cue", "New MIDI cue", "New Timecode cue", "Open stage output", "Show"]) assert.match(html, new RegExp(text));
  assert.match(html.replaceAll("<!-- -->", ""), /0 cues in 2 lists and carts/);
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
  for (const behavior of ["selectedIds", "inline-name", "drop-before", "cue-type-sidebar", "audioRoutes", "AudioEditor", "AudioRouting", "about:blank", "Open stage output", "requestFullscreen", "Select Found", "inspector-resizer", "inspector-hidden", "contenteditable='true'", "--nest-width"]) assert.match(`${page}\n${css}`, new RegExp(behavior));
  assert.match(css, /\.inspector,\.inspector-resizer\s*\{[^}]*grid-column:1/);
  for (const behavior of ["analyzeAudio", "ChannelSplitter", "ChannelMerger", "setSinkId"]) assert.match(runtime, new RegExp(behavior));
  assert.doesNotMatch(page, /\{stage && <Stage/);
});

test("cue failures, visual fades, selection, and arm controls follow show-control behavior", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const behavior of ["runtimeWarnings", "warningByCue", "fadeValues: { volume: 0, opacity: 0 }", "setPlayhead(primary)", "Power"]) assert.ok(page.includes(behavior), `${behavior} is wired`);
  assert.doesNotMatch(page, /help \|\| notice/);
  assert.match(page, /\["Audio", "Video", "Mic", "Camera", "Text", "Timecode"\]/);
});

test("stage output and PWA installation surfaces are complete", async () => {
  const [response, page, stage, pwa, worker, manifestText] = await Promise.all([
    render("/stage-output?stage=default&name=Default%20Stage"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/stage-output/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  assert.equal(response.status, 200);
  const html = await response.text(), manifest = JSON.parse(manifestText);
  assert.match(html, /id="stage-layers"/);
  assert.match(html, /Full Screen/);
  assert.match(page, /window\.open\(url, `stagecue-stage-/);
  assert.match(page, /getElementById\("stage-layers"\)/);
  assert.match(stage, /requestFullscreen/);
  assert.match(stage, /exitFullscreen/);
  assert.match(pwa, /serviceWorker.*register\("\/sw\.js"\)/);
  assert.match(worker, /addEventListener\("fetch"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
});

test("nested groups own, hide, and sequence their children", () => {
  const cues = [{ id: "g", type: "Group", number: "1", target: "2,3", collapsed: false, parentId: "" }, { id: "a", number: "2", parentId: "" }, { id: "n", type: "Group", number: "3", parentId: "" }, { id: "b", number: "4", parentId: "n" }, { id: "z", number: "5", parentId: "" }];
  const migrated = migrateGroups(cues);
  assert.deepEqual(childrenOf(migrated, "g").map((cue) => cue.id), ["a", "n"]);
  assert.deepEqual(descendantsOf(migrated, "g").map((cue) => cue.id), ["a", "n", "b"]);
  assert.equal(nextSibling(migrated, migrated[0]).id, "z");
  assert.deepEqual(visibleCues(migrated).map((cue) => cue.id), ["g", "a", "n", "b", "z"]);
  migrated[0].collapsed = true;
  assert.deepEqual(visibleCues(migrated).map((cue) => cue.id), ["g", "z"]);
});

test("deep and malformed group trees stay bounded", () => {
  const cues = Array.from({ length: 250 }, (_, index) => ({ id: String(index), parentId: index ? String(index - 1) : "", collapsed: false }));
  assert.equal(descendantsOf(cues, "0").length, 249);
  assert.equal(depthOf(cues, cues.at(-1)), 249);
  assert.equal(visibleCues(cues).length, 250);
  cues[0].parentId = cues.at(-1).id;
  assert.deepEqual(visibleCues(cues), []);
});

test("29.97 timecode uses drop-frame numbering", () => {
  assert.equal(dropFrameText(600, 29.97), "00:10:00:00");
  assert.ok(Math.abs(dropFrameSeconds("00:10:00:00", 29.97) - 600) < .01);
});

test("advanced cue automation interpolates every selected parameter", () => {
  assert.deepEqual(interpolateCue({ volume: 80, opacity: 20, x: 0 }, { volume: 20, opacity: 100, x: 200 }, .5), { volume: 50, opacity: 60, x: 100 });
  assert.deepEqual(interpolateCue({ x: 10 }, { x: 20 }, .5, true), { x: 20 });
  assert.equal(curveValue("ease-in", .5), .25);
  assert.equal(curveValue("ease-out", .5), .75);
});

test("structured MIDI covers channel, system, SysEx and MSC messages", () => {
  assert.deepEqual(midiMessage({ midiCommand: "Note On", midiChannel: 2, midiData1: 60, midiData2: 100 }), [145, 60, 100]);
  assert.deepEqual(midiMessage({ midiCommand: "Song Position", midiData1: 1, midiData2: 2 }), [242, 1, 2]);
  assert.deepEqual(midiMessage({ midiCommand: "SysEx", target: "240,1,2,247" }), [240, 1, 2, 247]);
  assert.equal(midiMessage({ midiCommand: "MSC Go", midiDeviceId: 127, midiFormat: 16, midiCueNumber: "2" })[4], 1);
});

test("fixture commands generate bounded DMX frames", () => {
  const fixtures = [{ id: "front", name: "Front Wash", universe: 2, address: 10, channels: { intensity: 1, red: 2 } }];
  const levels = { ...parseLightCommand("Front Wash @ Full", fixtures), front: { intensity: 100, red: 50 } }, frames = dmxFrame(fixtures, levels);
  assert.equal(frames[2][9], 255);
  assert.equal(frames[2][10], 127);
  assert.equal(frames[2].length, 512);
});

test("target cues patch nested properties and rich text is sanitized", () => {
  const change = cueTargetPatch('12=videoEffects.0.value:150');
  assert.deepEqual(change, { number: "12", path: "videoEffects.0.value", value: 150 });
  assert.equal(setPath({ videoEffects: [{ value: 100 }] }, change.path, change.value).videoEffects[0].value, 150);
  assert.doesNotMatch(sanitizeRichText('<b onclick="bad()">Safe</b><script>bad()</script>'), /onclick|script/i);
  assert.equal(timelineLength([{ pre: 1, duration: 3, post: 1 }, { pre: 2, duration: 6, post: 0 }]), 8);
});

test("all requested browser-native production surfaces are wired", async () => {
  const [page, runtime, worker] = await Promise.all(["page.tsx", "runtime.ts", "../worker/index.ts"].map((file) => readFile(new URL(file.startsWith("..") ? file : `../app/${file}`, import.meta.url), "utf8")));
  for (const feature of ["FadeEditor", "TimelineEditor", "EffectsEditor", "RichTextEditor", "FixtureManager", "PatchManager", "StageManager", "PropertyPaste", "CueSelector", "OperationsPanel", "workspaceTemplates", "relinkMissingMedia", "collectMedia", "getScreenDetails", "collaborationSocket", "duckOthers", "preservePitch", "SMPTE-timed"]) assert.match(`${page}\n${runtime}`, new RegExp(feature));
  for (const api of ["webgl2", "createMediaElementSource", "preservesPitch", "WebSocketPair"]) assert.match(`${runtime}\n${worker}`, new RegExp(api));
});
