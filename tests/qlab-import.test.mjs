import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { convertQLab, importQLab } from "../app/qlab.mjs";

test("converts QLab cue lists, nesting, targets, media, and warnings", () => {
  const audio = {
      $class: "AudioCue",
      uniqueID: "audio",
      number: "1.1",
      name: "Music",
      armed: true,
      fileTarget: { relativePath: "audio/music.wav" },
      lastSeenFileDuration: 12,
      rate: 1,
      playCount: 1,
    },
    result = convertQLab(
      {
        workspaceName: "Example.qlab5",
        uniqueID: "workspace",
        QLabShortVersionString: "5.6.3",
      },
      {
        cues: [
          {
            uniqueID: "list",
            name: "Main Cue List",
            cart: {},
            cues: [
              {
                $class: "GroupCue",
                uniqueID: "group",
                number: "1",
                name: "Opening",
                groupMode: 3,
                cues: [audio],
              },
              {
                $class: "FadeCue",
                uniqueID: "fade",
                number: "2",
                cueTarget: audio,
                duration: 3,
              },
              {
                $class: "ScriptCue",
                uniqueID: "script",
                number: "3",
                source: 'tell application id "com.figure53.QLab.5"',
              },
            ],
          },
        ],
      },
      { "Example/audio/music.wav": new Uint8Array([1, 2, 3]) },
    );

  expect(result.workspace.name).toBe("Example");
  expect(result.workspace.lists[0].cues.map((cue) => cue.type)).toEqual([
    "Group",
    "Audio",
    "Fade",
    "Script",
  ]);
  expect(result.workspace.lists[0].cues[1].parentId).toBe("group");
  expect(result.workspace.lists[0].cues[2].target).toBe("1.1");
  expect(result.workspace.lists[0].cues[3].armed).toBe(false);
  expect(result.workspace.lists[0].cues[3].notes).toContain("QLab AppleScript");
  expect(result.media).toHaveLength(1);
  expect(result.report.cues).toBe(4);
  expect(result.report.cueWarnings).toBe(3);
});

test("shows a persistent unsupported-feature warning after QLab import", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  expect(page).toContain("setQlabReport(report)");
  expect(page).toContain("Import QLab Project...");
  expect(page).toContain("QLab import needs review");
  expect(page).toContain("persistent warnings");
  expect(page).toContain("Workspace Status");
});

test("maps QLab continuation and trigger settings", () => {
  const result = convertQLab(
    { workspaceName: "Triggers.qlab5" },
    {
      cues: [
        {
          uniqueID: "list",
          cues: [
            {
              $class: "MemoCue",
              uniqueID: "cue",
              continueMode: 2,
              useHotKey: true,
              hotKey: {
                QLActionKeyCommand: true,
                QLActionKeyKeyCharacter: 103,
              },
              useWallClock: true,
              wallHours: 19,
              wallMinutes: 30,
              wallMonday: true,
              useMIDITrigger: true,
              midiTrigger: { status: 144, byte1: 60, byte2: 127 },
            },
          ],
        },
      ],
    },
  );
  const cue = result.workspace.lists[0].cues[0];

  expect(cue.continueMode).toBe("Auto follow");
  expect(cue.hotkey).toBe("Cmd+G");
  expect(cue.wallClock).toBe("19:30:00");
  expect(cue.wallClockDays).toEqual([1]);
  expect(cue.midiTrigger).toBe("144,60,127");
});

test("disarms unsafe and unknown QLab cue classes", () => {
  const classes = [
      "ScriptCue",
      "OSCCue",
      "NetworkCue",
      "LightCue",
      "TargetCue",
      "FutureCue",
    ],
    result = convertQLab(
      { workspaceName: "Unsafe.qlab5" },
      {
        cues: [
          {
            uniqueID: "list",
            cues: classes.map(($class, index) => ({
              $class,
              uniqueID: String(index),
            })),
          },
        ],
      },
    ),
    cues = result.workspace.lists[0].cues;

  expect(cues.every((cue) => !cue.armed)).toBe(true);
  expect(cues.at(-1).type).toBe("Memo");
  expect(result.report.cueWarnings).toBe(classes.length);
});

test("imports QLab carts sequentially with a warning", () => {
  const result = convertQLab(
    { workspaceName: "Cart.qlab5" },
    {
      cues: [
        {
          uniqueID: "cart",
          cart: { columns: 4 },
          cues: [
            { $class: "GroupCue", uniqueID: "group", cues: [] },
            { $class: "MemoCue", uniqueID: "memo", continueMode: 2 },
          ],
        },
      ],
    },
  );
  const list = result.workspace.lists[0];

  expect(list.kind).toBe("cart");
  expect(list.cues.map((cue) => cue.cartSlot)).toEqual([0, 1]);
  expect(list.cues.every((cue) => cue.continueMode === "Do not continue")).toBe(
    true,
  );
  expect(result.report.issues.join(" ")).toContain("grid positions");
});

test("rejects ZIP files without a QLab workspace", async () => {
  const file = new File(
    [zipSync({ "readme.txt": strToU8("not a project") })],
    "project.zip",
  );

  await expect(importQLab(file)).rejects.toThrow(
    "The ZIP does not contain a QLab 5 workspace.",
  );
});
