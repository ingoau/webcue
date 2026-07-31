const openFiles = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("stagecue", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("files");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function storeFile(key: string, file: Blob) {
  const db = await openFiles();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").put(file, key);
    transaction.oncomplete = () => resolve(null);
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function loadFile(key: string) {
  if (!key) return null;
  const db = await openFiles();
  const file = await new Promise<Blob | null>((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}

export const blobUrl = async (key: string) => {
  const file = await loadFile(key);
  return file ? URL.createObjectURL(file) : "";
};

export async function exportWorkspace(workspace: any) {
  const copy = structuredClone(workspace);
  for (const list of copy.lists) for (const cue of list.cues) {
    const file = await loadFile(cue.fileKey);
    if (file) cue.fileData = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  return JSON.stringify(copy, null, 2);
}

export async function importWorkspaceFiles(workspace: any) {
  for (const list of workspace.lists) for (const cue of list.cues) if (cue.fileData) {
    const blob = await fetch(cue.fileData).then((response) => response.blob());
    cue.fileKey ||= cue.id;
    await storeFile(cue.fileKey, blob);
    delete cue.fileData;
  }
  return workspace;
}

export const bytes = (value = "") => value.trim().split(/[\s,]+/).filter(Boolean).map((part) => Number(part.startsWith("0x") ? parseInt(part, 16) : part)).filter((part) => Number.isFinite(part) && part >= 0 && part <= 255);

export async function requestMidi() {
  if (!("requestMIDIAccess" in navigator)) throw new Error("Web MIDI is unavailable in this Chromium build.");
  return (navigator as any).requestMIDIAccess({ sysex: true });
}

export async function requestSerial(baudRate = 250000) {
  if (!("serial" in navigator)) throw new Error("Web Serial is unavailable in this Chromium build.");
  const port = await (navigator as any).serial.requestPort();
  await port.open({ baudRate });
  return port;
}

export async function writeSerial(port: any, value: string) {
  if (!port?.writable) throw new Error("Connect a serial device first.");
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(`${value}\n`));
  writer.releaseLock();
}

export async function sendNetwork(url: string, payload = "", method = "POST") {
  if (/^wss?:\/\//i.test(url)) await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => { socket.send(payload); socket.close(); resolve(); };
    socket.onerror = () => reject(new Error("The WebSocket connection failed."));
  });
  else {
    const response = await fetch(url, { method, body: method === "GET" ? undefined : payload });
    if (!response.ok) throw new Error(`Network cue returned ${response.status}.`);
  }
}

const variable = (data: Uint8Array, offset: number) => {
  let value = 0, length = 0, byte;
  do { byte = data[offset + length++]; value = (value << 7) | (byte & 127); } while (byte & 128);
  return [value, length];
};

export function scheduleMidiFile(buffer: ArrayBuffer, output: { send: (message: number[], timestamp?: number) => void }) {
  const data = new Uint8Array(buffer);
  if (String.fromCharCode(...data.slice(0, 4)) !== "MThd") throw new Error("This is not a Standard MIDI File.");
  const division = (data[12] << 8) | data[13];
  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported.");
  const events: { tick: number, message: number[] }[] = [], tempos = [{ tick: 0, tempo: 500000 }];
  let offset = 14;
  while (offset < data.length) {
    if (String.fromCharCode(...data.slice(offset, offset + 4)) !== "MTrk") break;
    const size = (data[offset + 4] * 0x1000000) + (data[offset + 5] << 16) + (data[offset + 6] << 8) + data[offset + 7];
    let cursor = offset + 8, ticks = 0, running = 0;
    const end = cursor + size;
    while (cursor < end) {
      const [delta, used] = variable(data, cursor); cursor += used; ticks += delta;
      let status = data[cursor++];
      if (status < 128) { cursor--; status = running; } else running = status;
      if (status === 0xff) {
        const type = data[cursor++], [length, lengthBytes] = variable(data, cursor); cursor += lengthBytes;
        if (type === 0x51 && length === 3) tempos.push({ tick: ticks, tempo: (data[cursor] << 16) | (data[cursor + 1] << 8) | data[cursor + 2] });
        cursor += length; continue;
      }
      if (status === 0xf0 || status === 0xf7) { const [length, lengthBytes] = variable(data, cursor); cursor += lengthBytes; if (status === 0xf0) events.push({ tick: ticks, message: [status, ...data.slice(cursor, cursor + length)] }); cursor += length; continue; }
      const length = (status & 0xe0) === 0xc0 ? 1 : 2;
      const message = [status, ...data.slice(cursor, cursor + length)]; cursor += length;
      events.push({ tick: ticks, message });
    }
    offset = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const milliseconds = (tick: number) => { let lastTick = 0, tempo = 500000, microseconds = 0; for (const change of tempos) { if (change.tick > tick) break; microseconds += (change.tick - lastTick) * tempo / division; lastTick = change.tick; tempo = change.tempo; } return (microseconds + (tick - lastTick) * tempo / division) / 1000; };
  const started = performance.now(); let maxTime = 0;
  for (const event of events) { const at = milliseconds(event.tick); output.send(event.message, started + at); maxTime = Math.max(maxTime, at); }
  return maxTime / 1000;
}
