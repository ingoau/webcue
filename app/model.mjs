export const childrenOf = (cues, id) =>
  cues.filter((cue) => cue.parentId === id);
export const descendantsOf = (cues, id) => {
  const result = [],
    seen = new Set([id]),
    stack = childrenOf(cues, id).reverse();
  while (stack.length) {
    const cue = stack.pop();
    if (seen.has(cue.id)) continue;
    seen.add(cue.id);
    result.push(cue);
    stack.push(...childrenOf(cues, cue.id).reverse());
  }
  return result;
};
export const depthOf = (cues, cue) => {
  let depth = 0,
    current = cue;
  const seen = new Set();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = cues.find((item) => item.id === current.parentId);
    depth++;
  }
  return depth;
};
export const visibleCues = (cues) =>
  cues.filter((cue) => {
    let current = cue;
    const seen = new Set();
    while (current.parentId) {
      if (seen.has(current.id)) return false;
      seen.add(current.id);
      const parent = cues.find((item) => item.id === current.parentId);
      if (!parent || parent.collapsed) return false;
      current = parent;
    }
    return true;
  });
export const nextSibling = (cues, cue) =>
  cues
    .slice(cues.indexOf(cue) + 1)
    .find((item) => item.parentId === cue.parentId);
export const migrateGroups = (cues) => {
  const next = cues.map((cue) => ({ ...cue }));
  for (const group of next.filter(
    (cue) =>
      cue.type === "Group" &&
      !next.some((child) => child.parentId === cue.id) &&
      cue.target,
  ))
    for (const number of String(group.target).split(",")) {
      const child = next.find((cue) => cue.number === number.trim());
      if (child && child.id !== group.id) child.parentId = group.id;
    }
  return next;
};
export const dropFrameSeconds = (value, fps) => {
  const [hours = 0, minutes = 0, seconds = 0, frames = 0] = String(value)
    .split(":")
    .map(Number);
  if (fps !== 29.97)
    return hours * 3600 + minutes * 60 + seconds + frames / fps;
  const totalMinutes = hours * 60 + minutes,
    frameNumber =
      (hours * 3600 + minutes * 60 + seconds) * 30 +
      frames -
      2 * (totalMinutes - Math.floor(totalMinutes / 10));
  return frameNumber / 29.97;
};
export const dropFrameText = (value, fps) => {
  if (fps !== 29.97) {
    const whole = Math.floor(value),
      frames = Math.floor(value * fps) % Math.round(fps);
    return [
      Math.floor(whole / 3600) % 24,
      Math.floor(whole / 60) % 60,
      whole % 60,
      frames,
    ]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }
  let frame = Math.floor(value * 29.97),
    tenMinute = Math.floor(frame / 17982),
    remainder = frame % 17982;
  frame += 18 * tenMinute + 2 * Math.floor(Math.max(0, remainder - 2) / 1798);
  return [
    Math.floor(frame / 108000) % 24,
    Math.floor(frame / 1800) % 60,
    Math.floor(frame / 30) % 60,
    frame % 30,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};
