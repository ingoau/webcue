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

export async function analyzeAudio(file: Blob, bins = 220) {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const waveform = Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
    const samples = buffer.getChannelData(channel), size = Math.max(1, Math.floor(samples.length / bins));
    return Array.from({ length: bins }, (_, bin) => {
      let peak = 0;
      for (let index = bin * size; index < Math.min(samples.length, (bin + 1) * size); index++) peak = Math.max(peak, Math.abs(samples[index]));
      return peak;
    });
  });
  await context.close();
  return { duration: buffer.duration, channels: buffer.numberOfChannels, waveform };
}

export async function playRoutedAudio(file: Blob, cue: { trimStart?: number; trimEnd?: number; rate?: number; audioRoutes?: number[][]; volume?: number; loops?: number }, sinkId: string, onEnded: () => void) {
  const context = new AudioContext();
  if (sinkId && "setSinkId" in context) await context.setSinkId(sinkId);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const trimStart = Math.max(0, Math.min(Number(cue.trimStart) || 0, buffer.duration));
  const trimEnd = Math.max(trimStart, Math.min(Number(cue.trimEnd) || buffer.duration, buffer.duration));
  const rate = Math.max(.01, (Number(cue.rate) || 100) / 100);
  const routes = Array.from({ length: buffer.numberOfChannels }, (_, input) => cue.audioRoutes?.[input]?.length ? cue.audioRoutes[input] : [input + 1]);
  const outputChannels = Math.max(1, ...routes.flat().map(Number));
  const splitter = context.createChannelSplitter(buffer.numberOfChannels), merger = context.createChannelMerger(outputChannels), gain = context.createGain();
  gain.gain.value = Math.max(0, Number(cue.volume) || 0) / 100;
  merger.channelInterpretation = "discrete";
  if (context.destination.maxChannelCount >= outputChannels) {
    context.destination.channelCountMode = "explicit";
    context.destination.channelInterpretation = "discrete";
    context.destination.channelCount = outputChannels;
  }
  routes.forEach((outputs, input) => outputs.forEach((output: number) => splitter.connect(merger, input, Math.max(0, output - 1))));
  merger.connect(gain).connect(context.destination);
  const loops = Math.max(0, Number(cue.loops) || 0);
  let source: AudioBufferSourceNode, plays = 0, stopped = false;
  const start = () => {
    source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate; source.connect(splitter); plays++;
    if (!loops) { source.loop = true; source.loopStart = trimStart; source.loopEnd = trimEnd; source.start(0, trimStart); return; }
    source.onended = () => { if (stopped) return; if (plays < loops) start(); else onEnded(); };
    source.start(0, trimStart, Math.max(.001, trimEnd - trimStart));
  };
  start();
  return {
    audio: context, gain, duration: loops ? (trimEnd - trimStart) / rate * loops : 0,
    pause: () => context.suspend(), resume: () => context.resume(),
    stop: async () => { stopped = true; if (source) { source.onended = null; try { source.stop(); } catch {} } if (context.state !== "closed") await context.close(); },
  };
}

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

export async function startLtc(fps = 30, startSeconds = 0, level = 0.8, sinkId = "") {
  const audio = new AudioContext({ latencyHint: "interactive" });
  if (sinkId && "setSinkId" in audio) await (audio as any).setSinkId(sinkId);
  const source = `class LTC extends AudioWorkletProcessor{constructor(o){super();let p=o.processorOptions;this.fps=p.fps;this.start=p.start;this.sample=0;this.half=-1;this.level=1;this.bits=[]}frame(n){let t=this.start+n/this.fps,f=Math.floor(t*this.fps)%Math.round(this.fps),s=Math.floor(t)%60,m=Math.floor(t/60)%60,h=Math.floor(t/3600)%24,b=Array(80).fill(0),put=(i,v,l)=>{for(let x=0;x<l;x++)b[i+x]=v>>x&1};put(0,f%10,4);put(8,Math.floor(f/10),2);put(16,s%10,4);put(24,Math.floor(s/10),3);put(32,m%10,4);put(40,Math.floor(m/10),3);put(48,h%10,4);put(56,Math.floor(h/10),2);[0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,1].forEach((v,i)=>b[64+i]=v);return b}process(i,o){let a=o[0][0],sph=sampleRate/(this.fps*160);for(let x=0;x<a.length;x++,this.sample++){let q=Math.floor(this.sample/sph),half=q%2,bit=Math.floor(q/2)%80,frame=Math.floor(q/160);if(half!==this.half){if(!half||this.bits[bit])this.level*=-1;this.half=half;if(!half&&bit===0)this.bits=this.frame(frame)}a[x]=this.level*.7}return true}}registerProcessor("stagecue-ltc",LTC);`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try { await audio.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  const node = new AudioWorkletNode(audio, "stagecue-ltc", { outputChannelCount: [1], processorOptions: { fps, start: startSeconds } }), gain = audio.createGain();
  gain.gain.value = level; node.connect(gain).connect(audio.destination);
  return { audio, gain, node };
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
