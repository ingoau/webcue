import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { convertQLab } from "../app/qlab.mjs";

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

  expect(page).toContain("setQLabReport(report)");
  expect(page).toContain("QLab import needs review");
  expect(page).toContain("persistent warnings");
  expect(page).toContain("Workspace Status");
});
