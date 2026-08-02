/* eslint-disable @typescript-eslint/no-unused-expressions */
const openFiles = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("webcue", 1);
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

export async function deleteFile(key: string) {
  if (!key) return;
  const db = await openFiles();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").delete(key);
    transaction.oncomplete = () => resolve(null);
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export const blobUrl = async (key: string) => {
  const file = await loadFile(key);
  return file ? URL.createObjectURL(file) : "";
};

export async function analyzeAudio(file: Blob, bins = 220) {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const waveform = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => {
      const samples = buffer.getChannelData(channel),
        size = Math.max(1, Math.floor(samples.length / bins));
      return Array.from({ length: bins }, (_, bin) => {
        let peak = 0;
        for (
          let index = bin * size;
          index < Math.min(samples.length, (bin + 1) * size);
          index++
        )
          peak = Math.max(peak, Math.abs(samples[index]));
        return peak;
      });
    },
  );
  await context.close();
  return {
    duration: buffer.duration,
    channels: buffer.numberOfChannels,
    waveform,
  };
}

export async function playRoutedAudio(
  file: Blob,
  cue: any,
  sinkId: string,
  onEnded: () => void,
) {
  const context = new AudioContext();
  if (sinkId && "setSinkId" in context) await context.setSinkId(sinkId);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const trimStart = Math.max(
    0,
    Math.min(Number(cue.trimStart) || 0, buffer.duration),
  );
  const trimEnd = Math.max(
    trimStart,
    Math.min(Number(cue.trimEnd) || buffer.duration, buffer.duration),
  );
  const rate = Math.max(0.01, (Number(cue.rate) || 100) / 100);
  const routes = Array.from({ length: buffer.numberOfChannels }, (_, input) =>
    cue.audioRoutes?.[input]?.length ? cue.audioRoutes[input] : [input + 1],
  );
  const outputChannels = Math.max(1, ...routes.flat().map(Number));
  const splitter = context.createChannelSplitter(buffer.numberOfChannels),
    merger = context.createChannelMerger(outputChannels),
    gain = context.createGain();
  gain.gain.value = Math.max(0, Number(cue.volume) || 0) / 100;
  merger.channelInterpretation = "discrete";
  if (context.destination.maxChannelCount >= outputChannels) {
    context.destination.channelCountMode = "explicit";
    context.destination.channelInterpretation = "discrete";
    context.destination.channelCount = outputChannels;
  }
  const solos = new Set(cue.soloInputs || []),
    muted = new Set(cue.mutedInputs || []);
  routes.forEach((outputs, input) =>
    outputs.forEach((output: number) => {
      const crosspoint = context.createGain(),
        enabled =
          !muted.has(input + 1) && (!solos.size || solos.has(input + 1)),
        gang = cue.audioGangs?.[input],
        leader = gang
          ? cue.audioGangs.findIndex((value: number) => value === gang)
          : input,
        level =
          (cue.audioLevels?.[`${input + 1}-${output}`] ?? 0) +
          (cue.inputTrims?.[String(leader + 1)] || 0);
      crosspoint.gain.value = enabled ? 10 ** (level / 20) : 0;
      splitter.connect(crosspoint, input);
      crosspoint.connect(merger, 0, Math.max(0, output - 1));
    }),
  );
  let tail: AudioNode = merger;
  const effects = cue.effects?.length
    ? cue.effects
    : [
        { type: "highpass", value: cue.highpass, enabled: cue.highpass > 20 },
        { type: "lowpass", value: cue.lowpass, enabled: cue.lowpass < 20000 },
        { type: "compressor", enabled: cue.compressor },
        {
          type: "delay",
          value: cue.delay,
          feedback: cue.feedback,
          enabled: cue.delay > 0,
        },
      ];
  for (const effect of effects.filter((item: any) => item.enabled !== false)) {
    let node: AudioNode | null = null;
    if (
      ["highpass", "lowpass", "peaking", "lowshelf", "highshelf"].includes(
        effect.type,
      )
    ) {
      const filter = context.createBiquadFilter();
      filter.type = effect.type;
      filter.frequency.value = effect.frequency || effect.value || 1000;
      filter.Q.value = effect.q || 1;
      filter.gain.value = effect.gain || 0;
      node = filter;
    }
    if (effect.type === "compressor") {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = effect.threshold ?? -24;
      compressor.ratio.value = effect.ratio ?? 12;
      node = compressor;
    }
    if (effect.type === "gain") {
      const effectGain = context.createGain();
      effectGain.gain.value = 10 ** ((effect.value || 0) / 20);
      node = effectGain;
    }
    if (effect.type === "delay") {
      const delay = context.createDelay(5),
        feedback = context.createGain();
      delay.delayTime.value = Math.min(5, effect.value || 0);
      feedback.gain.value = Math.min(0.95, Math.max(0, effect.feedback || 0));
      delay.connect(feedback).connect(delay);
      node = delay;
    }
    if (effect.type === "distortion") {
      const wave = context.createWaveShaper(),
        amount = Math.max(0, effect.value || 0);
      wave.curve = Float32Array.from({ length: 44100 }, (_, index) => {
        const x = (index * 2) / 44100 - 1;
        return (
          ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x))
        );
      });
      wave.oversample = "4x";
      node = wave;
    }
    if (node) {
      tail.connect(node);
      tail = node;
    }
  }
  const mainTrim = context.createGain();
  mainTrim.gain.value = 10 ** ((cue.mainTrim || 0) / 20);
  tail.connect(mainTrim).connect(gain);
  const trimSplit = context.createChannelSplitter(outputChannels),
    finalMerger = context.createChannelMerger(outputChannels);
  gain.connect(trimSplit);
  for (let output = 0; output < outputChannels; output++) {
    const trim = context.createGain();
    trim.gain.value = 10 ** ((cue.outputTrims?.[String(output + 1)] || 0) / 20);
    trimSplit.connect(trim, output);
    trim.connect(finalMerger, 0, output);
  }
  finalMerger.connect(context.destination);
  const loops = Math.max(0, Number(cue.loops) || 0);
  const markers = (cue.slices || [])
      .filter((slice) => slice.at > trimStart && slice.at < trimEnd)
      .sort((a, b) => a.at - b.at),
    points = [trimStart, ...markers.map((slice) => slice.at), trimEnd];
  const segments = points
    .slice(0, -1)
    .map((start, index) => ({
      start,
      end: points[index + 1],
      count: index ? Number(markers[index - 1].count ?? 1) : 1,
    }))
    .filter((slice) => slice.count !== 0);
  const onePlay = segments.some((slice) => slice.count < 0)
      ? 0
      : segments.reduce(
          (sum, slice) =>
            sum + ((slice.end - slice.start) * slice.count) / rate,
          0,
        ),
    duration = loops && onePlay ? onePlay * loops : 0;
  if (cue.preservePitch) {
    const url = URL.createObjectURL(file),
      media = document.createElement("audio"),
      sourceNode = context.createMediaElementSource(media);
    let play = 0,
      segment = 0,
      segmentPlay = 0;
    media.src = url;
    media.playbackRate = rate;
    (media as any).preservesPitch = true;
    sourceNode.connect(splitter);
    const start = async (offset = 0) => {
      const slice = segments[segment];
      if (!slice) {
        play++;
        segment = 0;
        segmentPlay = 0;
        if (!loops || play < loops) return start();
        onEnded();
        return;
      }
      media.currentTime = slice.start + offset;
      await media.play();
    };
    media.ontimeupdate = () => {
      const slice = segments[segment];
      if (!slice || media.currentTime < slice.end - 0.015) return;
      media.pause();
      segmentPlay++;
      if (slice.count < 0 || segmentPlay < slice.count) start();
      else {
        segment++;
        segmentPlay = 0;
        start();
      }
    };
    if (cue.fadeIn)
      (gain.gain.setValueAtTime(0, context.currentTime),
        gain.gain.linearRampToValueAtTime(
          Math.max(0, Number(cue.volume) || 0) / 100,
          context.currentTime + Math.min(cue.fadeIn, duration || cue.fadeIn),
        ));
    if (cue.fadeOut && duration)
      (gain.gain.setValueAtTime(
        gain.gain.value,
        context.currentTime + Math.max(0, duration - cue.fadeOut),
      ),
        gain.gain.linearRampToValueAtTime(0, context.currentTime + duration));
    if (segments.length) await start();
    else queueMicrotask(onEnded);
    return {
      audio: context,
      gain,
      media,
      duration,
      pause: () => media.pause(),
      resume: () => media.play(),
      seek: (elapsed: number) => {
        let position = Math.max(0, elapsed) % (onePlay || 1);
        segment = 0;
        for (; segment < segments.length; segment++) {
          const each = (segments[segment].end - segments[segment].start) / rate;
          if (position < each) {
            media.currentTime = segments[segment].start + position * rate;
            break;
          }
          position -= each;
        }
      },
      stop: async () => {
        media.ontimeupdate = null;
        media.pause();
        URL.revokeObjectURL(url);
        if (context.state !== "closed") await context.close();
      },
    };
  }
  let source: AudioBufferSourceNode,
    stopped = false,
    play = 0,
    segment = 0,
    segmentPlay = 0,
    generation = 0;
  const start = (offset = 0) => {
    const slice = segments[segment];
    if (!slice) {
      play++;
      segment = 0;
      segmentPlay = 0;
      if (!loops || play < loops) return start();
      onEnded();
      return;
    }
    const currentGeneration = generation;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(splitter);
    source.onended = () => {
      if (stopped || generation !== currentGeneration) return;
      segmentPlay++;
      if (slice.count < 0 || segmentPlay < slice.count) start();
      else {
        segment++;
        segmentPlay = 0;
        start();
      }
    };
    source.start(
      0,
      slice.start + offset,
      Math.max(0.001, slice.end - slice.start - offset),
    );
  };
  if (cue.fadeIn)
    (gain.gain.setValueAtTime(0, context.currentTime),
      gain.gain.linearRampToValueAtTime(
        Math.max(0, Number(cue.volume) || 0) / 100,
        context.currentTime + Math.min(cue.fadeIn, duration || cue.fadeIn),
      ));
  if (cue.fadeOut && duration)
    (gain.gain.setValueAtTime(
      gain.gain.value,
      context.currentTime + Math.max(0, duration - cue.fadeOut),
    ),
      gain.gain.linearRampToValueAtTime(0, context.currentTime + duration));
  if (segments.length) start();
  else queueMicrotask(onEnded);
  return {
    audio: context,
    gain,
    duration,
    pause: () => context.suspend(),
    resume: () => context.resume(),
    seek: (elapsed: number) => {
      if (!onePlay || !segments.length) return;
      generation++;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
      }
      let position = Math.max(0, elapsed) % onePlay;
      play = Math.floor(Math.max(0, elapsed) / onePlay);
      segment = 0;
      segmentPlay = 0;
      for (; segment < segments.length; segment++) {
        const slice = segments[segment],
          each = (slice.end - slice.start) / rate,
          total = slice.count < 0 ? Infinity : each * slice.count;
        if (position < total) {
          segmentPlay = Math.floor(position / each);
          return start((position % each) * rate);
        }
        position -= total;
      }
      start();
    },
    stop: async () => {
      stopped = true;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
      }
      if (context.state !== "closed") await context.close();
    },
  };
}

export async function exportWorkspace(workspace: any) {
  const copy = structuredClone(workspace);
  for (const list of copy.lists)
    for (const cue of list.cues) {
      const file = await loadFile(cue.fileKey);
      if (file)
        cue.fileData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
    }
  return JSON.stringify(copy, null, 2);
}

export async function importWorkspaceFiles(workspace: any) {
  for (const list of workspace.lists)
    for (const cue of list.cues)
      if (cue.fileData) {
        const blob = await fetch(cue.fileData).then((response) =>
          response.blob(),
        );
        cue.fileKey ||= cue.id;
        await storeFile(cue.fileKey, blob);
        delete cue.fileData;
      }
  return workspace;
}

export const bytes = (value = "") =>
  value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => Number(part.startsWith("0x") ? parseInt(part, 16) : part))
    .filter((part) => Number.isFinite(part) && part >= 0 && part <= 255);

export async function requestMidi() {
  if (!("requestMIDIAccess" in navigator))
    throw new Error("Web MIDI is unavailable in this Chromium build.");
  return (navigator as any).requestMIDIAccess({ sysex: true });
}

export async function requestSerial(baudRate = 250000) {
  if (!("serial" in navigator))
    throw new Error("Web Serial is unavailable in this Chromium build.");
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
  if (/^wss?:\/\//i.test(url))
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(payload);
        socket.close();
        resolve();
      };
      socket.onerror = () =>
        reject(new Error("The WebSocket connection failed."));
    });
  else {
    const response = await fetch(url, {
      method,
      body: method === "GET" ? undefined : payload,
    });
    if (!response.ok)
      throw new Error(`Network cue returned ${response.status}.`);
  }
}

export async function startLtc(
  fps = 30,
  startSeconds = 0,
  level = 0.8,
  sinkId = "",
) {
  const audio = new AudioContext({ latencyHint: "interactive" });
  if (sinkId && "setSinkId" in audio) await (audio as any).setSinkId(sinkId);
  const source = `class LTC extends AudioWorkletProcessor{constructor(o){super();let p=o.processorOptions;this.fps=p.fps;this.drop=p.drop;this.start=p.start;this.sample=0;this.half=-1;this.level=1;this.bits=[]}frame(n){let t=this.start+n/this.fps,f=Math.floor(t*this.fps)%Math.round(this.fps),s=Math.floor(t)%60,m=Math.floor(t/60)%60,h=Math.floor(t/3600)%24,b=Array(80).fill(0),put=(i,v,l)=>{for(let x=0;x<l;x++)b[i+x]=v>>x&1};put(0,f%10,4);put(8,Math.floor(f/10),2);if(this.drop)b[10]=1;put(16,s%10,4);put(24,Math.floor(s/10),3);put(32,m%10,4);put(40,Math.floor(m/10),3);put(48,h%10,4);put(56,Math.floor(h/10),2);[0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,1].forEach((v,i)=>b[64+i]=v);return b}process(i,o){let a=o[0][0],sph=sampleRate/(this.fps*160);for(let x=0;x<a.length;x++,this.sample++){let q=Math.floor(this.sample/sph),half=q%2,bit=Math.floor(q/2)%80,frame=Math.floor(q/160);if(half!==this.half){if(!half||this.bits[bit])this.level*=-1;this.half=half;if(!half&&bit===0)this.bits=this.frame(frame)}a[x]=this.level*.7}return true}}registerProcessor("webcue-ltc",LTC);`;
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  try {
    await audio.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(audio, "webcue-ltc", {
      outputChannelCount: [1],
      processorOptions: { fps, drop: fps === 29.97, start: startSeconds },
    }),
    gain = audio.createGain();
  gain.gain.value = level;
  node.connect(gain).connect(audio.destination);
  return { audio, gain, node };
}

const variable = (data: Uint8Array, offset: number) => {
  let value = 0,
    length = 0,
    byte;
  do {
    byte = data[offset + length++];
    value = (value << 7) | (byte & 127);
  } while (byte & 128);
  return [value, length];
};

export function scheduleMidiFile(
  buffer: ArrayBuffer,
  output: { send: (message: number[], timestamp?: number) => void },
  rate = 1,
) {
  const data = new Uint8Array(buffer);
  if (String.fromCharCode(...data.slice(0, 4)) !== "MThd")
    throw new Error("This is not a Standard MIDI File.");
  const division = (data[12] << 8) | data[13],
    smpte = Boolean(division & 0x8000),
    smpteFps = smpte ? 256 - data[12] : 0,
    ticksPerFrame = smpte ? data[13] : 0;
  const events: { tick: number; message: number[] }[] = [],
    tempos = [{ tick: 0, tempo: 500000 }];
  let offset = 14;
  while (offset < data.length) {
    if (String.fromCharCode(...data.slice(offset, offset + 4)) !== "MTrk")
      break;
    const size =
      data[offset + 4] * 0x1000000 +
      (data[offset + 5] << 16) +
      (data[offset + 6] << 8) +
      data[offset + 7];
    let cursor = offset + 8,
      ticks = 0,
      running = 0;
    const end = cursor + size;
    while (cursor < end) {
      const [delta, used] = variable(data, cursor);
      cursor += used;
      ticks += delta;
      let status = data[cursor++];
      if (status < 128) {
        cursor--;
        status = running;
      } else running = status;
      if (status === 0xff) {
        const type = data[cursor++],
          [length, lengthBytes] = variable(data, cursor);
        cursor += lengthBytes;
        if (type === 0x51 && length === 3)
          tempos.push({
            tick: ticks,
            tempo:
              (data[cursor] << 16) | (data[cursor + 1] << 8) | data[cursor + 2],
          });
        cursor += length;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const [length, lengthBytes] = variable(data, cursor);
        cursor += lengthBytes;
        if (status === 0xf0)
          events.push({
            tick: ticks,
            message: [status, ...data.slice(cursor, cursor + length)],
          });
        cursor += length;
        continue;
      }
      const length = (status & 0xe0) === 0xc0 ? 1 : 2;
      const message = [status, ...data.slice(cursor, cursor + length)];
      cursor += length;
      events.push({ tick: ticks, message });
    }
    offset = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const milliseconds = (tick: number) => {
    if (smpte) return (tick / (smpteFps * ticksPerFrame)) * 1000;
    let lastTick = 0,
      tempo = 500000,
      microseconds = 0;
    for (const change of tempos) {
      if (change.tick > tick) break;
      microseconds += ((change.tick - lastTick) * tempo) / division;
      lastTick = change.tick;
      tempo = change.tempo;
    }
    return (microseconds + ((tick - lastTick) * tempo) / division) / 1000;
  };
  const started = performance.now();
  let maxTime = 0;
  for (const event of events) {
    const at = milliseconds(event.tick) / Math.max(0.01, rate);
    output.send(event.message, started + at);
    maxTime = Math.max(maxTime, at);
  }
  return maxTime / 1000;
}

export function startVideoFx(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  effects: any[] = [],
) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type)!;
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(value) || "Video shader failed.");
    return value;
  };
  const vertex = shader(
    gl.VERTEX_SHADER,
    `#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0,1);}`,
  );
  const fragment = shader(
    gl.FRAGMENT_SHADER,
    `#version 300 es\nprecision highp float;uniform sampler2D image;uniform vec4 fx;in vec2 uv;out vec4 color;void main(){vec4 c=texture(image,vec2(uv.x,1.-uv.y));c.rgb=(c.rgb-.5)*fx.y+.5;c.rgb*=fx.x;float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,fx.z);float a=fx.w*.0174533,cs=cos(a),sn=sin(a);mat3 m=mat3(.213+cs*.787-sn*.213,.715-cs*.715-sn*.715,.072-cs*.072+sn*.928,.213-cs*.213+sn*.143,.715+cs*.285+sn*.140,.072-cs*.072-sn*.283,.213-cs*.213-sn*.787,.715-cs*.715+sn*.715,.072+cs*.928+sn*.072);c.rgb=m*c.rgb;color=c;}`,
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const amount = (type: string, fallback: number) =>
      Number(
        effects.find((item) => item.enabled !== false && item.type === type)
          ?.value ?? fallback,
      ),
    uniform = gl.getUniformLocation(program, "fx");
  let frame = 0;
  const draw = () => {
    if (video.readyState >= 2) {
      const width = video.videoWidth || 1,
        height = video.videoHeight || 1;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video,
      );
      gl.uniform4f(
        uniform,
        amount("brightness", 100) / 100,
        amount("contrast", 100) / 100,
        amount("saturate", 100) / 100,
        amount("hue-rotate", 0),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    frame = requestAnimationFrame(draw);
  };
  draw();
  return () => {
    cancelAnimationFrame(frame);
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  };
}

export const collaborationSocket = (
  url: string,
  room: string,
  onMessage: (value: any) => void,
) => {
  const socket = new WebSocket(
    `${url}${url.includes("?") ? "&" : "?"}room=${encodeURIComponent(room)}`,
  );
  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {}
  };
  return socket;
};
