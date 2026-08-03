import { unzip } from "fflate";
import { parse } from "plist";

const classTypes = {
  GroupCue: "Group",
  AudioCue: "Audio",
  MicCue: "Mic",
  VideoCue: "Video",
  CameraCue: "Camera",
  TextCue: "Text",
  LightCue: "Light",
  FadeCue: "Fade",
  NetworkCue: "Network",
  OSCCue: "Network",
  MIDICue: "MIDI",
  MIDIFileCue: "MIDI File",
  TimecodeCue: "Timecode",
  StartCue: "Start",
  StopCue: "Stop",
  PauseCue: "Pause",
  LoadCue: "Load",
  ResetCue: "Reset",
  DevampCue: "Devamp",
  GotoCue: "GoTo",
  TargetCue: "Target",
  ArmCue: "Arm",
  DisarmCue: "Disarm",
  WaitCue: "Wait",
  MemoCue: "Memo",
  ScriptCue: "Script",
};
const colors = new Set([
  "none",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "magenta",
  "gray",
]);
const continueModes = ["Do not continue", "Auto continue", "Auto follow"];
const groupModes = { 3: "Timeline" };
const nil = (value) => value == null || value === "$null";
const nameOf = (path = "") => path.split(/[\\/]/).filter(Boolean).at(-1) || "";
const noteText = (value) =>
  typeof value === "string" ? value : value?.NSString || value?.string || "";

export function decodeKeyedArchive(bytes) {
  const archive = parse(bytes);
  if (archive?.$archiver !== "NSKeyedArchiver" || !archive.$objects)
    throw new Error("This is not a supported QLab keyed archive.");
  const objects = archive.$objects,
    cache = new Map(),
    uid = (value) =>
      value &&
      typeof value === "object" &&
      !ArrayBuffer.isView(value) &&
      Object.keys(value).length === 1 &&
      Number.isInteger(value.UID)
        ? value.UID
        : null;

  const decode = (value) => {
    const id = uid(value);
    if (id !== null) {
      if (cache.has(id)) return cache.get(id);
      const holder = {};
      cache.set(id, holder);
      const decoded = decode(objects[id]);
      if (
        decoded &&
        typeof decoded === "object" &&
        !Array.isArray(decoded) &&
        !ArrayBuffer.isView(decoded)
      ) {
        Object.assign(holder, decoded);
        return holder;
      }
      cache.set(id, decoded);
      return decoded;
    }
    if (value === "$null") return null;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
    if (Array.isArray(value)) return value.map(decode);
    if (!value || typeof value !== "object") return value;
    const classID = uid(value.$class),
      className = classID === null ? "" : objects[classID]?.$classname;
    if (value["NS.keys"] && value["NS.objects"]) {
      const keys = decode(value["NS.keys"]),
        values = decode(value["NS.objects"]),
        result = {};
      keys.forEach((key, index) => (result[key] = values[index]));
      return result;
    }
    if (value["NS.objects"]) return decode(value["NS.objects"]);
    if (value["NS.string"]) return decode(value["NS.string"]);
    if (value["NS.data"]) return decode(value["NS.data"]);
    const result = className ? { $class: className } : {};
    for (const [key, item] of Object.entries(value))
      if (key !== "$class") result[key] = decode(item);
    return result;
  };
  return decode(archive.$top.root);
}

const mediaType = (name) =>
  ({
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mid: "audio/midi",
    midi: "audio/midi",
  })[name.split(".").at(-1)?.toLowerCase()] || "application/octet-stream";

const hotkey = (source) => {
  if (!source.useHotKey || !source.hotKey) return "";
  const key = source.hotKey,
    character = Number(key.QLActionKeyKeyCharacter);
  return [
    key.QLActionKeyCommand && "Cmd",
    key.QLActionKeyControl && "Ctrl",
    key.QLActionKeyOption && "Option",
    key.QLActionKeyShift && "Shift",
    character ? String.fromCharCode(character).toUpperCase() : "",
  ]
    .filter(Boolean)
    .join("+");
};

export function convertQLab(root, cueLists, entries = {}) {
  const issues = new Set([
      "QLab import is a best-effort conversion. Review every cue before using it in a show.",
      "Workspace settings, licenses, device patches, collaboration state, and display layout are not imported.",
    ]),
    media = new Map(),
    entryNames = Object.keys(entries).filter((name) => !name.endsWith("/")),
    targetEntry = (path) => {
      path = String(path || "").replaceAll("\\", "/");
      if (!path) return "";
      const exact = entryNames.find(
        (name) => name === path || name.endsWith(`/${path}`),
      );
      if (exact) return exact;
      const basename = nameOf(path),
        matches = entryNames.filter((name) => nameOf(name) === basename);
      return matches.length === 1 ? matches[0] : "";
    };

  const mapCue = (source, parentId = "") => {
    const importWarnings = [],
      originalClass = source.$class || "UnknownCue",
      type = classTypes[originalClass] || "Memo",
      id = source.uniqueID || crypto.randomUUID(),
      relativePath = nil(source.fileTarget)
        ? ""
        : source.fileTarget?.relativePath ||
          source.fileTarget?.lastKnownPath ||
          "",
      fileName = nameOf(relativePath),
      entry = targetEntry(source.fileTarget?.relativePath || relativePath),
      target = !nil(source.cueTarget)
        ? source.cueTarget?.number || ""
        : source.cueTargetUniqueID || "";
    const warn = (message, global = message) => {
      importWarnings.push(message);
      issues.add(global);
    };

    if (!classTypes[originalClass])
      warn(
        `${originalClass} is unknown; it was imported as a Memo cue and disarmed.`,
        "Unknown QLab cue classes are imported as disarmed Memo cues.",
      );
    if (originalClass === "ScriptCue")
      warn(
        "QLab AppleScript is not supported; the source was preserved in Notes and the cue was disarmed.",
        "QLab AppleScript is not supported. Script cues are disarmed and their source is preserved in Notes.",
      );
    if (["OSCCue", "NetworkCue"].includes(originalClass))
      warn(
        "QLab OSC/network patches cannot be translated to browser HTTP or WebSocket destinations; this cue was disarmed.",
        "Raw OSC, UDP, TCP, and QLab network patches are not supported. Imported Network cues are disarmed.",
      );
    if (originalClass === "LightCue")
      warn(
        "QLab lighting patches and fixture levels are not translated; this cue was disarmed.",
        "QLab lighting patches, fixtures, Art-Net, and raw DMX routing are not imported.",
      );
    if (originalClass === "TargetCue")
      warn(
        "QLab Target cue property changes do not map safely to WebCue; this cue was disarmed.",
        "QLab Target cue property changes are not imported.",
      );
    if (["AudioCue", "VideoCue", "FadeCue"].includes(originalClass))
      warn(
        "QLab patch routing, effects, and detailed fade matrices are not fully translated.",
        "QLab audio/video patches, effects, channel matrices, and detailed fade curves are not fully translated.",
      );
    if (originalClass === "GroupCue" && source.groupMode !== 3)
      warn(
        "This QLab group mode was not translated safely; review it as an imported Timeline group.",
        "Non-Timeline QLab group modes require manual review after import.",
      );
    if (["MicCue", "CameraCue"].includes(originalClass))
      warn(
        "QLab device patches are not imported; choose a browser device when this cue is used.",
        "QLab microphone and camera patches are replaced by browser permission-based device access.",
      );
    if (["MIDIFileCue", "MIDICue", "TimecodeCue"].includes(originalClass))
      warn(
        "QLab MIDI/timecode patches and sync sources are not imported; verify the browser device settings.",
        "QLab MIDI and timecode patches or sync sources are not imported.",
      );
    if (fileName && !entry)
      warn(
        `Media “${fileName}” was not included; relink it before running this cue.`,
        "Some media targets were not present in the imported file. Import a zipped QLab project or relink them.",
      );

    const color = colors.has(source.colorName) ? source.colorName : "none",
      sourceText = noteText(source.text || source.richText || source.contents),
      scriptSource = originalClass === "ScriptCue" ? source.source || "" : "",
      cue = {
        id,
        parentId,
        number: String(source.number || ""),
        name: source.name || fileName || `Untitled ${type} Cue`,
        type,
        target:
          originalClass === "ScriptCue"
            ? ""
            : type === "Text"
              ? sourceText
              : type === "Network"
                ? ""
                : target,
        payload: source.oscString || source.plainTextString || "",
        pre: Number(source.preWait) || 0,
        duration:
          Number(source.duration ?? source.lastSeenFileDuration) ||
          Math.max(0, Number(source.endTime) - Number(source.startTime)) ||
          0,
        post: Number(source.postWait) || 0,
        continueMode: continueModes[source.continueMode] || continueModes[0],
        notes: [
          noteText(source.notes),
          scriptSource && `QLab AppleScript:\n${scriptSource}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        armed:
          source.armed !== false &&
          classTypes[originalClass] &&
          ![
            "ScriptCue",
            "OSCCue",
            "NetworkCue",
            "LightCue",
            "TargetCue",
          ].includes(originalClass),
        skipIfDisarmed: Boolean(source.skipIfDisarmed),
        autoLoad: Boolean(source.autoLoad),
        flagged: Boolean(source.flagged),
        color,
        secondColor: colors.has(source.secondColorName)
          ? source.secondColorName
          : "none",
        secondColorAfterStart: Boolean(source.useSecondColor),
        collapsed: source.expanded === false,
        rate: (Number(source.rate) || 1) * 100,
        loops: source.infiniteLoop
          ? 0
          : Math.max(1, Number(source.playCount) || 1),
        trimStart: Number(source.startTime) || 0,
        trimEnd: Number(source.endTime) || 0,
        holdAtEnd: Boolean(source.holdLastFrame),
        groupMode: groupModes[source.groupMode] || "Timeline",
        playlistShuffle: Boolean(source.playlistShuffle),
        playlistLoop: Boolean(source.playlistLoop),
        playlistCrossfade: source.playlistCrossfade
          ? Number(source.playlistCrossfadeDuration) || 0
          : 0,
        hotkey: hotkey(source),
        hotkeyEnabled: Boolean(source.useHotKey),
        wallClock: source.useWallClock
          ? [source.wallHours, source.wallMinutes, source.wallSeconds]
              .map((value) => String(Number(value) || 0).padStart(2, "0"))
              .join(":")
          : "",
        wallClockEnabled: Boolean(source.useWallClock),
        wallClockDays: [
          source.wallSunday,
          source.wallMonday,
          source.wallTuesday,
          source.wallWednesday,
          source.wallThursday,
          source.wallFriday,
          source.wallSaturday,
        ].flatMap((enabled, index) => (enabled ? [index] : [])),
        midiTriggerEnabled: Boolean(source.useMIDITrigger),
        midiTrigger: source.useMIDITrigger
          ? [
              source.midiTrigger?.status,
              source.midiTrigger?.byte1,
              source.midiTrigger?.byte2,
            ]
              .filter((value) => value != null)
              .join(",")
          : "",
        fileName,
        fileKey: entry
          ? `qlab:${root.uniqueID || root.workspaceName}:${entry}`
          : "",
        textHtml: sourceText,
        opacity: Math.round((Number(source.opacity) || 1) * 100),
        x: Number(source.translationX) || 0,
        y: Number(source.translationY) || 0,
        scale: Math.round((Number(source.scaleX) || 1) * 100),
        rotation: Number(source.rotation) || 0,
        fadeOpacity: Boolean(source.doOpacity),
        fadeValues: {
          volume: 0,
          opacity: Math.round((Number(source.opacity) || 0) * 100),
        },
        fadeParameters: {
          volume: Boolean(
            source.audioObjectLevelsFades || source.audioObjectPathFades,
          ),
          opacity: Boolean(source.doOpacity),
        },
        qlabClass: originalClass,
        importWarnings,
      };
    if (entry && !media.has(cue.fileKey))
      media.set(cue.fileKey, {
        key: cue.fileKey,
        name: fileName,
        type: mediaType(fileName),
        bytes: entries[entry],
      });
    return cue;
  };

  const listSources = Array.isArray(cueLists?.cues)
      ? cueLists.cues
      : cueLists?.name
        ? [cueLists]
        : [],
    lists = listSources.map((source, listIndex) => {
      const cues = [],
        kind = source.cart && Object.keys(source.cart).length ? "cart" : "list";
      const visit = (item, parentId = "") => {
        const cue = mapCue(item, parentId);
        cues.push(cue);
        if (Array.isArray(item.cues))
          item.cues.forEach((child) => visit(child, cue.id));
      };
      (source.cues || []).forEach((cue) => visit(cue));
      if (kind === "cart") {
        issues.add(
          "QLab cue-cart grid positions are not preserved; imported cart cues are placed sequentially.",
        );
        cues.forEach((cue, index) => {
          cue.parentId = "";
          cue.cartSlot = index;
          cue.continueMode = "Do not continue";
        });
      }
      return {
        id: source.uniqueID || `qlab-list-${listIndex}`,
        name: source.name || `Cue List ${listIndex + 1}`,
        kind,
        cues,
      };
    });
  if (!lists.length)
    throw new Error("The QLab workspace contains no cue lists.");
  return {
    workspace: {
      name: String(root.workspaceName || "Imported QLab Workspace").replace(
        /\.qlab5$/i,
        "",
      ),
      lists,
      currentList: lists[0].id,
    },
    media: [...media.values()],
    report: {
      version: root.QLabShortVersionString || "unknown",
      cues: lists.reduce((count, list) => count + list.cues.length, 0),
      lists: lists.length,
      media: media.size,
      cueWarnings: lists.reduce(
        (count, list) =>
          count + list.cues.filter((cue) => cue.importWarnings.length).length,
        0,
      ),
      issues: [...issues],
    },
  };
}

export async function importQLab(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()),
    zipped = bytes[0] === 0x50 && bytes[1] === 0x4b,
    entries = zipped
      ? await new Promise((resolve, reject) =>
          unzip(bytes, (error, files) =>
            error ? reject(error) : resolve(files),
          ),
        )
      : {},
    workspaceName = zipped
      ? Object.keys(entries)
          .filter(
            (name) =>
              /\.qlab5$/i.test(name) && !/__MACOSX|backups?\//i.test(name),
          )
          .sort((a, b) => a.length - b.length)[0]
      : "";
  if (zipped && !workspaceName)
    throw new Error("The ZIP does not contain a QLab 5 workspace.");
  const root = decodeKeyedArchive(zipped ? entries[workspaceName] : bytes);
  if (!root.cueLists || !ArrayBuffer.isView(root.cueLists))
    throw new Error("The QLab cue-list archive is missing or unsupported.");
  return convertQLab(root, decodeKeyedArchive(root.cueLists), entries);
}
