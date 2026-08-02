export const curveValue = (curve, value) => {
  const x = Math.max(0, Math.min(1, value));
  if (curve === "ease-in") return x * x;
  if (curve === "ease-out") return 1 - (1 - x) ** 2;
  if (curve === "ease-in-out")
    return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  if (curve === "s-curve") return x * x * (3 - 2 * x);
  return x;
};

export const interpolateCue = (from, to, progress, relative = false) =>
  Object.fromEntries(
    Object.entries(to).map(([key, value]) => {
      const start = Number(from[key]) || 0,
        end = relative ? start + Number(value) : Number(value);
      return [key, start + (end - start) * progress];
    }),
  );

export const midiMessage = (cue) => {
  const statuses = {
    "Note Off": 128,
    "Note On": 144,
    "Poly Pressure": 160,
    "Control Change": 176,
    "Program Change": 192,
    "Channel Pressure": 208,
    "Pitch Bend": 224,
  };
  const system = {
    "MTC Quarter Frame": 241,
    "Song Position": 242,
    "Song Select": 243,
    "Tune Request": 246,
    "Timing Clock": 248,
    Start: 250,
    Continue: 251,
    Stop: 252,
    "Active Sensing": 254,
    Reset: 255,
  };
  const msc = {
    "MSC Go": 1,
    "MSC Stop": 2,
    "MSC Resume": 3,
    "MSC Timed Go": 4,
    "MSC Set": 6,
    "MSC Fire": 7,
    "MSC All Off": 8,
    "MSC Restore": 9,
    "MSC Reset": 10,
    "MSC Go Off": 11,
  };
  if (statuses[cue.midiCommand])
    return [
      statuses[cue.midiCommand] +
        Math.max(0, Math.min(15, (cue.midiChannel || 1) - 1)),
      cue.midiData1 || 0,
      ...(["Program Change", "Channel Pressure"].includes(cue.midiCommand)
        ? []
        : [cue.midiData2 || 0]),
    ];
  if (system[cue.midiCommand] != null)
    return [
      system[cue.midiCommand],
      ...([241, 243].includes(system[cue.midiCommand])
        ? [cue.midiData1 || 0]
        : system[cue.midiCommand] === 242
          ? [cue.midiData1 || 0, cue.midiData2 || 0]
          : []),
    ];
  if (msc[cue.midiCommand])
    return [
      240,
      127,
      cue.midiDeviceId ?? 127,
      2,
      msc[cue.midiCommand],
      cue.midiFormat ?? 16,
      ...[...(cue.midiCueNumber || "")].map((letter) => letter.charCodeAt(0)),
      247,
    ];
  return String(cue.target || "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => Number(part.startsWith("0x") ? parseInt(part, 16) : part))
    .filter((part) => Number.isFinite(part) && part >= 0 && part <= 255);
};

export const parseLightCommand = (command, fixtures = []) => {
  const levels = {};
  for (const part of String(command || "").split(/[;,]+/)) {
    const match = part
      .trim()
      .match(/^(.+?)\s*@\s*(full|out|-?\d+(?:\.\d+)?)$/i);
    if (!match) continue;
    const level = /^full$/i.test(match[2])
      ? 100
      : /^out$/i.test(match[2])
        ? 0
        : Number(match[2]);
    const fixture = fixtures.find(
      (item) =>
        item.id === match[1].trim() ||
        item.name.toLowerCase() === match[1].trim().toLowerCase(),
    );
    if (fixture)
      levels[fixture.id] = {
        ...(levels[fixture.id] || {}),
        intensity: Math.max(0, Math.min(100, level)),
      };
  }
  return levels;
};

export const dmxFrame = (fixtures = [], cueLevels = {}) => {
  const universes = {};
  for (const fixture of fixtures) {
    const levels = cueLevels[fixture.id] || {},
      universe = fixture.universe || 1,
      frame = (universes[universe] ||= Array(512).fill(0));
    Object.entries(fixture.channels || {}).forEach(([parameter, offset]) => {
      const value = levels[parameter];
      if (value != null && fixture.address + Number(offset) - 2 < 512)
        frame[fixture.address + Number(offset) - 2] = Math.round(
          Math.max(0, Math.min(100, Number(value))) * 2.55,
        );
    });
  }
  return universes;
};

export const cueTargetPatch = (expression) => {
  const [number, assignment] = String(expression || "").split(/=(.*)/s),
    match = assignment?.trim().match(/^([\w.]+)\s*:\s*(.*)$/s);
  if (!number?.trim() || !match) return null;
  let value = match[2];
  try {
    value = JSON.parse(value);
  } catch {}
  return { number: number.trim(), path: match[1], value };
};

export const setPath = (object, path, value) => {
  const parts = path.split("."),
    copy = structuredClone(object);
  let target = copy;
  parts.slice(0, -1).forEach((part) => (target = target[part] ||= {}));
  target[parts.at(-1)] = value;
  return copy;
};

export const sanitizeRichText = (html) =>
  String(html || "")
    .replace(/<\/?(?:script|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

export const visualFilter = (effects = []) =>
  effects
    .filter((effect) => effect.enabled !== false)
    .map(
      (effect) =>
        `${effect.type}(${effect.type === "hue-rotate" ? `${effect.value}deg` : effect.type === "blur" ? `${effect.value}px` : effect.type === "brightness" || effect.type === "contrast" || effect.type === "saturate" ? `${effect.value}%` : effect.value})`,
    )
    .join(" ") || "none";

export const timelineLength = (children = []) =>
  Math.max(
    0,
    ...children.map(
      (cue) => (cue.pre || 0) + (cue.duration || 0) + (cue.post || 0),
    ),
  );
