import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import {
  childrenOf,
  depthOf,
  descendantsOf,
  dropFrameSeconds,
  dropFrameText,
  migrateGroups,
  nextSibling,
  visibleCues,
} from "../app/model.mjs";
import {
  cueTargetPatch,
  curveValue,
  dmxFrame,
  interpolateCue,
  midiMessage,
  parseLightCommand,
  sanitizeRichText,
  setPath,
  timelineLength,
} from "../app/features.mjs";

const appFile = (name) =>
  readFile(new URL(`../app/${name}`, import.meta.url), "utf8");

test("builds portable static entry points", async () => {
  const [main, stage, page] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/stage-output/index.html", import.meta.url),
      "utf8",
    ),
    appFile("page.tsx"),
  ]);

  expect(main).toContain("<title>WebCue - Browser Show Control</title>");
  expect(stage).toContain("<title>WebCue Stage Output</title>");
  for (const text of [
    "WebCue",
    "Main Cue List",
    "Workspace settings",
    "Open stage output",
    "Show",
  ])
    expect(page).toContain(text);
  expect(page).toContain("title={`New ${name} cue`}");
  await expect(
    stat(new URL("../dist/server", import.meta.url)),
  ).rejects.toThrow();
});

test("uses only the WebCue brand", async () => {
  const files = [
    "../README.md",
    "../package.json",
    "../vite.config.ts",
    "page.tsx",
    "runtime.ts",
    "stage-output/page.tsx",
    "../public/manifest.webmanifest",
    "../public/sw.js",
  ];
  const text = (
    await Promise.all(
      files.map((file) =>
        readFile(
          new URL(
            file.startsWith("..") ? file : `../app/${file}`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    )
  ).join("\n");

  expect(text.toLowerCase()).not.toContain(["stage", "cue"].join(""));
});

test("device cues use real browser APIs", async () => {
  const [page, runtime] = await Promise.all([
    appFile("page.tsx"),
    appFile("runtime.ts"),
  ]);
  for (const api of [
    "getUserMedia",
    "getDisplayMedia",
    "requestMIDIAccess",
    "requestPort",
    "AudioWorkletNode",
    "WebSocket",
    "BroadcastChannel",
    "showOpenFilePicker",
    "showSaveFilePicker",
    "wakeLock",
  ])
    expect(`${page}\n${runtime}`).toContain(api);
  expect(page).not.toMatch(/coming soon|not implemented|href=["']#["']/i);
});

test("cue editing and output controls are wired", async () => {
  const [page, runtime, css] = await Promise.all([
    appFile("page.tsx"),
    appFile("runtime.ts"),
    appFile("globals.css"),
  ]);
  for (const behavior of [
    "selectedIds",
    "inline-name",
    "drop-before",
    "audioRoutes",
    "AudioEditor",
    "AudioRouting",
    "Open stage output",
    "requestFullscreen",
    "inspector-resizer",
    "starredCueTypes",
    "FavoriteCueButton",
    "application/webcue-star",
    "ResizeObserver",
  ])
    expect(`${page}\n${css}`).toContain(behavior);
  for (const behavior of [
    "analyzeAudio",
    "ChannelSplitter",
    "ChannelMerger",
    "setSinkId",
  ])
    expect(runtime).toContain(behavior);
});

test("cue failures, visual fades, selection, and arm controls remain wired", async () => {
  const page = await appFile("page.tsx");
  for (const behavior of [
    "runtimeWarnings",
    "warningByCue",
    "fadeValues: { volume: 0, opacity: 0 }",
    "setPlayhead(primary)",
    "Power",
  ])
    expect(page).toContain(behavior);
});

test("stage output and PWA surfaces are complete", async () => {
  const [page, stage, main, serviceWorker, manifestText] = await Promise.all([
    appFile("page.tsx"),
    appFile("stage-output/page.tsx"),
    appFile("main.tsx"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  ]);
  const manifest = JSON.parse(manifestText);

  expect(page).toContain("window.open(url, `webcue-stage-");
  expect(stage).toContain('id="stage-layers"');
  expect(stage).toContain("requestFullscreen");
  expect(main).toContain('serviceWorker?.register("/sw.js")');
  expect(serviceWorker).toContain('addEventListener("fetch"');
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
});

test("nested groups own, hide, and sequence their children", () => {
  const cues = [
    {
      id: "g",
      type: "Group",
      number: "1",
      target: "2,3",
      collapsed: false,
      parentId: "",
    },
    { id: "a", number: "2", parentId: "" },
    { id: "n", type: "Group", number: "3", parentId: "" },
    { id: "b", number: "4", parentId: "n" },
    { id: "z", number: "5", parentId: "" },
  ];
  const migrated = migrateGroups(cues);

  expect(childrenOf(migrated, "g").map((cue) => cue.id)).toEqual(["a", "n"]);
  expect(descendantsOf(migrated, "g").map((cue) => cue.id)).toEqual([
    "a",
    "n",
    "b",
  ]);
  expect(nextSibling(migrated, migrated[0]).id).toBe("z");
  migrated[0].collapsed = true;
  expect(visibleCues(migrated).map((cue) => cue.id)).toEqual(["g", "z"]);
});

test("deep and malformed group trees stay bounded", () => {
  const cues = Array.from({ length: 250 }, (_, index) => ({
    id: String(index),
    parentId: index ? String(index - 1) : "",
    collapsed: false,
  }));

  expect(descendantsOf(cues, "0")).toHaveLength(249);
  expect(depthOf(cues, cues.at(-1))).toBe(249);
  cues[0].parentId = cues.at(-1).id;
  expect(visibleCues(cues)).toEqual([]);
});

test("29.97 timecode uses drop-frame numbering", () => {
  expect(dropFrameText(600, 29.97)).toBe("00:10:00:00");
  expect(Math.abs(dropFrameSeconds("00:10:00:00", 29.97) - 600)).toBeLessThan(
    0.01,
  );
});

test("advanced cue automation interpolates selected parameters", () => {
  expect(
    interpolateCue(
      { volume: 80, opacity: 20, x: 0 },
      { volume: 20, opacity: 100, x: 200 },
      0.5,
    ),
  ).toEqual({ volume: 50, opacity: 60, x: 100 });
  expect(curveValue("ease-in", 0.5)).toBe(0.25);
  expect(curveValue("ease-out", 0.5)).toBe(0.75);
});

test("structured MIDI covers channel, system, SysEx and MSC messages", () => {
  expect(
    midiMessage({
      midiCommand: "Note On",
      midiChannel: 2,
      midiData1: 60,
      midiData2: 100,
    }),
  ).toEqual([145, 60, 100]);
  expect(midiMessage({ midiCommand: "SysEx", target: "240,1,2,247" })).toEqual([
    240, 1, 2, 247,
  ]);
  expect(
    midiMessage({
      midiCommand: "MSC Go",
      midiDeviceId: 127,
      midiFormat: 16,
      midiCueNumber: "2",
    })[4],
  ).toBe(1);
});

test("fixture commands and rich text remain bounded", () => {
  const fixtures = [
    {
      id: "front",
      name: "Front Wash",
      universe: 2,
      address: 10,
      channels: { intensity: 1, red: 2 },
    },
  ];
  const levels = {
    ...parseLightCommand("Front Wash @ Full", fixtures),
    front: { intensity: 100, red: 50 },
  };
  const frames = dmxFrame(fixtures, levels);
  const change = cueTargetPatch("12=videoEffects.0.value:150");

  expect(frames[2][9]).toBe(255);
  expect(frames[2]).toHaveLength(512);
  expect(
    setPath({ videoEffects: [{ value: 100 }] }, change.path, change.value),
  ).toEqual({
    videoEffects: [{ value: 150 }],
  });
  expect(
    sanitizeRichText('<b onclick="bad()">Safe</b><script>bad()</script>'),
  ).not.toMatch(/onclick|script/i);
  expect(
    timelineLength([
      { pre: 1, duration: 3, post: 1 },
      { pre: 2, duration: 6, post: 0 },
    ]),
  ).toBe(8);
});
