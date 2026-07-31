"use client";

import {
  AlignLeft, Armchair, Box, Camera, ChevronDown, ChevronRight, CirclePlay, Clock3,
  Copy, FileAudio, FileDown, Flag, FolderOpen, Gauge, Group, Lightbulb, List,
  Maximize, Menu, MessageSquare, Mic2, MonitorPlay, Music2, Network, Pause, Play,
  Plus, RotateCcw, Settings, SlidersHorizontal, Square, Target, Timer, Trash2,
  Type, Video, Volume2, WandSparkles, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { blobUrl, bytes, exportWorkspace, importWorkspaceFiles, loadFile, requestMidi, requestSerial, scheduleMidiFile, sendNetwork, storeFile, writeSerial } from "./runtime";

const cueTypes = [
  ["Group", Group], ["Audio", Volume2], ["Mic", Mic2], ["Video", Video], ["Camera", Camera], ["Text", Type],
  ["Light", Lightbulb], ["Fade", Gauge], ["Network", Network], ["MIDI", Music2], ["MIDI File", FileAudio],
  ["Timecode", Clock3], ["Start", Play], ["Stop", Square], ["Pause", Pause], ["Load", FileDown],
  ["Reset", RotateCcw], ["Devamp", WandSparkles], ["GoTo", ChevronRight], ["Target", Target],
  ["Arm", Armchair], ["Disarm", X], ["Wait", Timer], ["Memo", MessageSquare], ["Script", Zap],
];
const icons = Object.fromEntries(cueTypes);
const colors = ["none", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta", "gray"];
const uid = () => Math.random().toString(36).slice(2, 9);
const time = (value = 0) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}.${String(Math.round(value % 1 * 100)).padStart(2, "0")}`;
const baseCue = { target: "", payload: "", method: "POST", pre: 0, duration: 0, post: 0, continueMode: "Do not continue", notes: "", armed: true, flagged: false, color: "none", volume: 80, rate: 100, loops: 1, hotkey: "", wallClock: "", midiTrigger: "", midiCommand: "Note On", midiChannel: 1, midiData1: 60, midiData2: 64, cameraAudio: false, groupMode: "Timeline", textColor: "#ffffff", backgroundColor: "#000000", fontSize: 96, align: "center", fit: "contain", opacity: 100 };
const defaults = Object.fromEntries(cueTypes.map(([type]) => [type, { name: `Untitled ${type} Cue`, color: "none", continueMode: "Do not continue" }]));
const initial = {
  name: "Untitled Workspace",
  lists: [{ id: "main", name: "Main Cue List", kind: "list", cues: [
    { ...baseCue, id: "welcome", number: "1", type: "Memo", name: "Welcome to StageCue", notes: "Select a cue, then edit it in the inspector." },
    { ...baseCue, id: "house", number: "2", type: "Text", name: "House open", target: "HOUSE OPEN", duration: 4, continueMode: "Auto follow", color: "blue" },
    { ...baseCue, id: "hold", number: "3", type: "Wait", name: "Hold", duration: 3, continueMode: "Auto follow" },
    { ...baseCue, id: "clear", number: "4", type: "Text", name: "Clear stage", duration: 1 },
  ] }, { id: "cart", name: "Cue Cart", kind: "cart", cues: [] }],
  currentList: "main",
  settings: { goKey: "Space", panicKey: "Escape", autoNumber: true, increment: 1, lockPlayhead: true, audition: false, collaboration: true, audioInput: "", videoInput: "", audioOutput: "", midiOutput: "", baudRate: 250000 },
  templates: defaults,
};
const normalizeWorkspace = (value) => ({ ...initial, ...value, lists: (value.lists || initial.lists).map((list) => ({ ...list, cues: list.cues.map((cue) => ({ ...baseCue, ...cue })) })), settings: { ...initial.settings, ...value.settings }, templates: { ...defaults, ...value.templates } });
const menuData = {
  File: ["New Workspace", "Open Workspace...", "Save", "Save As...", "Save As Template", "-", "Workspace Settings"],
  Edit: ["Undo", "Redo", "-", "Cut", "Copy", "Paste", "Duplicate", "Delete", "-", "Move Cue Up", "Move Cue Down"],
  Cues: cueTypes.map(([name]) => name),
  Tools: ["Renumber cues", "Delete cue numbers", "Jump to selected cue target", "Toggle audition mode", "Open device settings"],
  View: ["Enter Full Screen", "Inspector", "GO Button / Standby Display / Toolbar", "Toolbox", "Lists / Carts & Active Cues", "Select next", "Select previous", "Enter Edit Mode", "Enter Show Mode"],
  Window: ["Open Workspace in New Window", "Open Stage Output", "Workspace Settings"],
  Help: ["StageCue Help", "Keyboard Shortcuts", "Browser limitations", "About StageCue"],
};

function IconButton({ icon: Icon, label, active, onClick, disabled = false }) {
  return <button className={`icon-button ${active ? "active" : ""}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={16} /></button>;
}

export default function Home() {
  const [workspace, setWorkspace] = useState(initial);
  const [selected, setSelected] = useState("welcome");
  const [playhead, setPlayhead] = useState("welcome");
  const [active, setActive] = useState([]);
  const [remaining, setRemaining] = useState({});
  const [mode, setMode] = useState("edit");
  const [openMenu, setOpenMenu] = useState("");
  const [context, setContext] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState("General");
  const [help, setHelp] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("lists");
  const [inspectorTab, setInspectorTab] = useState("Basics");
  const [visible, setVisible] = useState({ masthead: true, toolbox: true, sidebar: true, inspector: true });
  const [copied, setCopied] = useState(null);
  const [cartSlot, setCartSlot] = useState(null);
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [], midioutput: [] });
  const [connections, setConnections] = useState({ microphone: "Not connected", camera: "Not connected", midi: "Not connected", serial: "Not connected" });
  const fileRef = useRef(null), mediaRef = useRef(null), workspaceHandle = useRef(null), controllers = useRef(new Map()), preloaded = useRef(new Map()), midiRef = useRef(null), serialRef = useRef(null), stageWindow = useRef(null), wakeLock = useRef(null), channelRef = useRef(null), suppressSync = useRef(false), hydrating = useRef(true);
  const historyRef = useRef([initial]), historyIndex = useRef(0), restoringHistory = useRef(false);
  const [historyStatus, setHistoryStatus] = useState({ undo: false, redo: false });

  const list = workspace.lists.find((item) => item.id === workspace.currentList) || workspace.lists[0];
  const cue = list.cues.find((item) => item.id === selected);
  const playIndex = list.cues.findIndex((item) => item.id === playhead);
  const settings = workspace.settings || initial.settings;

  useEffect(() => {
    const saved = localStorage.getItem("stagecue-workspace");
    if (saved) try {
      const value = JSON.parse(saved);
      queueMicrotask(() => setWorkspace(normalizeWorkspace(value)));
    } catch {}
  }, []);
  useEffect(() => { if (hydrating.current) { hydrating.current = false; return; } try { localStorage.setItem("stagecue-workspace", JSON.stringify(workspace)); } catch { queueMicrotask(() => setNotice("Workspace metadata could not be saved locally. Export the workspace to preserve it.")); } }, [workspace]);
  useEffect(() => {
    if (restoringHistory.current) { restoringHistory.current = false; return; }
    if (JSON.stringify(historyRef.current[historyIndex.current]) === JSON.stringify(workspace)) return;
    historyRef.current = [...historyRef.current.slice(0, historyIndex.current + 1), structuredClone(workspace)].slice(-100); historyIndex.current = historyRef.current.length - 1; queueMicrotask(() => setHistoryStatus({ undo: historyIndex.current > 0, redo: false }));
  }, [workspace]);
  useEffect(() => {
    if (!settings.collaboration || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("stagecue-workspace"); channelRef.current = channel;
    channel.onmessage = (event) => { suppressSync.current = true; setWorkspace(event.data); };
    return () => channel.close();
  }, [settings.collaboration]);
  useEffect(() => { if (suppressSync.current) suppressSync.current = false; else channelRef.current?.postMessage(workspace); }, [workspace]);
  useEffect(() => {
    if (mode !== "show" || !("wakeLock" in navigator)) return;
    (navigator as any).wakeLock.request("screen").then((lock) => wakeLock.current = lock).catch(() => {});
    return () => { wakeLock.current?.release(); wakeLock.current = null; };
  }, [mode]);

  const allCues = () => workspace.lists.flatMap((item) => item.cues);
  const findCue = (number) => allCues().find((item) => item.number === String(number));
  const patchCueById = (id, patch) => setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => ({ ...item, cues: item.cues.map((value) => value.id === id ? { ...value, ...patch } : value) })) }));
  const patchCue = (patch) => cue && patchCueById(cue.id, patch);
  const patchSettings = (patch) => setWorkspace((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
  const fail = (error) => setNotice(error instanceof Error ? error.message : String(error));
  const refreshDevices = async () => {
    const media = await navigator.mediaDevices.enumerateDevices();
    const midi = midiRef.current ? [...midiRef.current.outputs.values()] : [];
    setDevices({ audioinput: media.filter((item) => item.kind === "audioinput"), videoinput: media.filter((item) => item.kind === "videoinput"), audiooutput: media.filter((item) => item.kind === "audiooutput"), midioutput: midi });
  };
  const connect = async (kind) => {
    try {
      if (kind === "midi" && midiRef.current) { midiRef.current.inputs.forEach((input) => input.onmidimessage = null); midiRef.current = null; setDevices((value) => ({ ...value, midioutput: [] })); setConnections((value) => ({ ...value, midi: "Not connected" })); return; }
      if (kind === "serial" && serialRef.current) { await serialRef.current.close(); serialRef.current = null; setConnections((value) => ({ ...value, serial: "Not connected" })); return; }
      if (kind === "microphone" || kind === "camera") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: kind === "microphone", video: kind === "camera" });
        stream.getTracks().forEach((track) => track.stop());
        setConnections((value) => ({ ...value, [kind]: "Permission granted" }));
      }
      if (kind === "midi") { midiRef.current = await requestMidi(); setConnections((value) => ({ ...value, midi: `${midiRef.current.outputs.size} outputs` })); }
      if (kind === "serial") { serialRef.current = await requestSerial(settings.baudRate); setConnections((value) => ({ ...value, serial: "Connected" })); }
      await refreshDevices();
    } catch (error) { fail(error); }
  };
  const openStage = () => {
    stageWindow.current = window.open("", "stagecue-stage", "popup,width=1280,height=720");
    if (stageWindow.current) stageWindow.current.document.body.style.cssText = "margin:0;background:#000;color:#fff;display:grid;place-items:center;height:100vh;font:700 9vw system-ui;text-align:center;overflow:hidden";
  };
  useEffect(() => {
    const output = stageWindow.current;
    if (!output || output.closed) return;
    output.document.body.replaceChildren();
    if (!stage) return;
    output.document.body.style.background = stage.backgroundColor || "#000";
    if (stage.type === "text" || stage.type === "timecode") { output.document.body.textContent = stage.content; output.document.body.style.color = stage.textColor || "#fff"; output.document.body.style.fontSize = `${stage.fontSize || 96}px`; output.document.body.style.textAlign = stage.align || "center"; }
    else { const video = output.document.createElement("video"); let plays = 1; video.autoplay = true; video.muted = true; video.loop = stage.loops === 0; video.playbackRate = (stage.rate || 100) / 100; video.onended = () => { if (stage.loops > plays) { plays++; video.currentTime = 0; video.play(); } }; video.controls = stage.type === "video"; video.style.cssText = `width:100%;height:100%;object-fit:${stage.fit || "contain"};opacity:${(stage.opacity ?? 100) / 100}`; if (stage.stream) video.srcObject = stage.stream; else video.src = stage.content; output.document.body.append(video); }
  }, [stage]);

  const finishCue = (value) => {
    setActive((items) => items.filter((id) => id !== value.id));
    setRemaining((items) => { const next = { ...items }; delete next[value.id]; return next; });
    controllers.current.delete(value.id);
    if (["Text", "Video", "Camera", "Timecode"].includes(value.type)) setStage((current) => current?.cueId === value.id ? null : current);
    if (value.continueMode === "Auto follow") { const index = list.cues.findIndex((item) => item.id === value.id), next = list.cues[index + 1]; if (next) { setPlayhead(next.id); runCue(next); } }
  };
  const stopCue = (id) => {
    const control = controllers.current.get(id); control?.stop?.();
    const value = allCues().find((item) => item.id === id); if (value) finishCue(value);
  };
  const stopAll = () => { [...controllers.current.keys()].forEach(stopCue); preloaded.current.forEach((item) => URL.revokeObjectURL(item.url)); preloaded.current.clear(); setActive([]); setRemaining({}); setStage(null); };
  const pauseAll = () => controllers.current.forEach((control) => control.pause?.());
  const resumeAll = () => controllers.current.forEach((control) => control.resume?.());

  const runCue = async (value = cue) => {
    if (!value || !value.armed) return;
    const existing = controllers.current.get(value.id);
    if (existing) { existing.stop?.(); finishCue(value); return; }
    const control = { cancelled: false, paused: false, timerLeft: 0, stop: () => { control.cancelled = true; clearTimeout(control.timeout); clearInterval(control.interval); control.cleanup?.(); }, schedule: (ms, callback) => { clearTimeout(control.timeout); control.timerLeft = ms; control.timerStarted = performance.now(); control.timerCallback = callback; control.timeout = setTimeout(callback, ms); }, pause: () => { if (control.paused) return; control.paused = true; if (control.timerCallback) { clearTimeout(control.timeout); control.timerLeft = Math.max(0, control.timerLeft - (performance.now() - control.timerStarted)); } control.media?.pause?.(); control.suspend?.(); }, resume: () => { if (!control.paused) return; control.paused = false; if (control.timerCallback) { control.timerStarted = performance.now(); control.timeout = setTimeout(control.timerCallback, control.timerLeft); } control.media?.play?.(); control.resumeDevice?.(); }, setVolume: (level) => { if (control.media) control.media.volume = level; if (control.gain) control.gain.gain.value = level; } };
    controllers.current.set(value.id, control); setActive((items) => [...new Set([...items, value.id])]);
    let actionDuration = ["Audio", "Video"].includes(value.type) ? value.loops === 0 ? 0 : value.duration / (value.rate / 100) * Math.max(1, value.loops) : value.duration;
    const total = value.pre + Math.max(0, actionDuration) + value.post; control.left = total;
    setRemaining((items) => ({ ...items, [value.id]: control.left }));
    control.interval = setInterval(() => { if (control.paused) return; control.left = Math.max(0, control.left - .1); setRemaining((items) => ({ ...items, [value.id]: control.left })); if (value.type === "Timecode") setStage({ cueId: value.id, type: "timecode", content: time(Math.max(0, value.duration - Math.max(0, control.left - value.post))), textColor: value.textColor, backgroundColor: value.backgroundColor, fontSize: value.fontSize, align: value.align }); }, 100);
    if (value.pre) await new Promise((resolve) => control.schedule(value.pre * 1000, resolve));
    if (control.cancelled) return;
    try {
      const target = findCue(value.target);
      if (value.type === "Group") {
        const children = String(value.target).split(",").map((number) => findCue(number.trim())).filter(Boolean);
        if (value.groupMode === "Start random" && children.length) runCue(children[Math.floor(Math.random() * children.length)]);
        else if (value.groupMode === "Start first and enter" && children[0]) { setPlayhead(children[0].id); runCue(children[0]); }
        else if (value.groupMode === "Start first" && children[0]) runCue(children[0]);
        else if (value.groupMode === "Playlist") for (const child of children) { if (control.cancelled) break; await runCue(child); await new Promise((resolve) => setTimeout(resolve, (child.pre + child.duration + child.post) * 1000)); }
        else children.forEach(runCue);
      }
      if (["Start", "GoTo"].includes(value.type) && target) { setPlayhead(target.id); if (value.type === "Start") runCue(target); }
      if (value.type === "Stop") target ? stopCue(target.id) : stopAll();
      if (value.type === "Pause") target ? controllers.current.get(target.id)?.pause?.() : pauseAll();
      if (value.type === "Reset") { if (target) { stopCue(target.id); const loaded = preloaded.current.get(target.id); if (loaded) { URL.revokeObjectURL(loaded.url); preloaded.current.delete(target.id); } } else stopAll(); if (target) setPlayhead(target.id); }
      if (value.type === "Load" && target?.fileKey) { const url = await blobUrl(target.fileKey); const media = document.createElement(target.type === "Video" ? "video" : "audio"); media.preload = "auto"; media.src = url; media.load(); await new Promise((resolve) => { media.oncanplaythrough = resolve; media.onerror = resolve; }); const previous = preloaded.current.get(target.id); if (previous) URL.revokeObjectURL(previous.url); preloaded.current.set(target.id, { media, url }); }
      if (["Arm", "Disarm"].includes(value.type) && target) patchCueById(target.id, { armed: value.type === "Arm" });
      if (value.type === "Target") { const [number, ...nextTarget] = String(value.target).split("="); const destination = findCue(number); if (destination) patchCueById(destination.id, { target: nextTarget.join("=") }); }
      if (value.type === "Text") setStage({ cueId: value.id, type: "text", content: value.target || value.name, textColor: value.textColor, backgroundColor: value.backgroundColor, fontSize: value.fontSize, align: value.align });
      if (["Audio", "Video"].includes(value.type)) {
        if (!value.fileKey) throw new Error(`Choose a file for ${value.name}.`);
        const loaded = preloaded.current.get(value.id), url = loaded?.url || await blobUrl(value.fileKey), media = loaded?.media || document.createElement(value.type.toLowerCase()); preloaded.current.delete(value.id); control.media = media; media.src ||= url; media.playbackRate = value.rate / 100; media.volume = value.volume / 100; media.loop = value.loops === 0;
        if (value.type === "Audio" && settings.audioOutput && "setSinkId" in media) await (media as any).setSinkId(settings.audioOutput);
        if (value.type === "Video") setStage({ cueId: value.id, type: "video", content: url, backgroundColor: value.backgroundColor, fit: value.fit, opacity: value.opacity, loops: value.loops, rate: value.rate });
        let plays = 1; media.onended = () => { if (value.loops > plays) { plays++; media.currentTime = 0; media.play(); } else if (!value.duration) finishCue(value); };
        await media.play(); control.cleanup = () => { media.onended = null; media.pause(); URL.revokeObjectURL(url); };
      }
      if (value.type === "Mic") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: settings.audioInput ? { deviceId: { exact: settings.audioInput } } : true });
        const audio = new AudioContext(); if (settings.audioOutput && "setSinkId" in audio) await (audio as any).setSinkId(settings.audioOutput); const source = audio.createMediaStreamSource(stream), gain = audio.createGain(); gain.gain.value = value.volume / 100; source.connect(gain).connect(audio.destination); control.gain = gain; control.suspend = () => audio.suspend(); control.resumeDevice = () => audio.resume(); control.cleanup = () => { stream.getTracks().forEach((track) => track.stop()); audio.close(); };
      }
      if (value.type === "Camera") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: settings.videoInput ? { deviceId: { exact: settings.videoInput } } : true, audio: value.cameraAudio ? settings.audioInput ? { deviceId: { exact: settings.audioInput } } : true : false });
        let audio; if (value.cameraAudio) { audio = new AudioContext(); if (settings.audioOutput && "setSinkId" in audio) await (audio as any).setSinkId(settings.audioOutput); const source = audio.createMediaStreamSource(stream), gain = audio.createGain(); gain.gain.value = value.volume / 100; source.connect(gain).connect(audio.destination); control.gain = gain; control.suspend = () => audio.suspend(); control.resumeDevice = () => audio.resume(); }
        setStage({ cueId: value.id, type: "stream", stream, backgroundColor: value.backgroundColor, fit: value.fit, opacity: value.opacity }); control.cleanup = () => { stream.getTracks().forEach((track) => track.stop()); audio?.close(); };
      }
      if (value.type === "MIDI") {
        midiRef.current ||= await requestMidi(); const output = settings.midiOutput ? midiRef.current.outputs.get(settings.midiOutput) : [...midiRef.current.outputs.values()][0]; if (!output) throw new Error("No MIDI output is available."); output.send(bytes(value.target));
      }
      if (value.type === "MIDI File") {
        midiRef.current ||= await requestMidi(); const output = settings.midiOutput ? midiRef.current.outputs.get(settings.midiOutput) : [...midiRef.current.outputs.values()][0]; const file = await loadFile(value.fileKey); if (!output || !file) throw new Error("Choose a MIDI output and MIDI file."); const duration = scheduleMidiFile(await file.arrayBuffer(), output); control.cleanup = () => { output.clear?.(); for (let channel = 0; channel < 16; channel++) output.send([176 + channel, 123, 0]); }; if (!value.duration) { actionDuration = duration; control.left = duration + value.post; patchCueById(value.id, { duration }); }
      }
      if (value.type === "Light") { if (settings.audition) return; serialRef.current ||= await requestSerial(settings.baudRate); await writeSerial(serialRef.current, value.target); }
      if (value.type === "Network") { if (!settings.audition) await sendNetwork(value.target, value.payload, value.method); }
      if (value.type === "Timecode") setStage({ cueId: value.id, type: "timecode", content: time(0), textColor: value.textColor, backgroundColor: value.backgroundColor, fontSize: value.fontSize, align: value.align });
      if (["Fade", "Devamp"].includes(value.type) && target) {
        const targetControl = controllers.current.get(target.id), from = (target.volume ?? 80) / 100, to = value.type === "Devamp" ? 0 : value.volume / 100, started = performance.now(), duration = Math.max(.01, value.duration) * 1000;
        const fade = setInterval(() => { const progress = Math.min(1, (performance.now() - started) / duration); targetControl?.setVolume?.(from + (to - from) * progress); if (progress === 1) { clearInterval(fade); if (value.type === "Devamp") stopCue(target.id); } }, 16); control.cleanup = () => clearInterval(fade);
      }
      if (value.type === "Script") {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction("api", `"use strict";${value.target}`)({ go: (number) => runCue(findCue(number)), stop: (number) => { const target = findCue(number); if (target) stopCue(target.id); }, stage: (text) => setStage({ cueId: value.id, type: "text", content: text, textColor: value.textColor, backgroundColor: value.backgroundColor, fontSize: value.fontSize, align: value.align }), fetch });
      }
    } catch (error) { fail(error); control.stop(); finishCue(value); return; }
    if (value.continueMode === "Auto continue") { const index = list.cues.findIndex((item) => item.id === value.id), next = list.cues[index + 1]; if (next) setTimeout(() => { setPlayhead(next.id); runCue(next); }, value.post * 1000); }
    const duration = Math.max(0, actionDuration) + value.post;
    if (duration > 0) control.schedule(duration * 1000, () => { control.stop(); finishCue(value); });
    else if (!["Audio", "Video", "Mic", "Camera", "Timecode"].includes(value.type)) { control.stop(); finishCue(value); }
  };

  const go = useCallback(() => { const value = list.cues[playIndex < 0 ? 0 : playIndex]; if (!value) return; runCue(value); const next = list.cues[(playIndex < 0 ? 0 : playIndex) + 1]; if (next && value.continueMode === "Do not continue") setPlayhead(next.id); }, [list, playIndex, workspace]);
  useEffect(() => {
    const onKey = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const key = event.code === "Space" ? "Space" : event.key;
      if (key === settings.goKey) { event.preventDefault(); go(); }
      if (key === settings.panicKey) stopAll();
      allCues().filter((item) => item.hotkey && item.hotkey.toLowerCase() === key.toLowerCase()).forEach(runCue);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { const current = list.cues.findIndex((item) => item.id === selected), offset = event.key === "ArrowDown" ? 1 : -1, next = list.cues[Math.max(0, Math.min(list.cues.length - 1, current + offset))]; if (next) { setSelected(next.id); if (settings.lockPlayhead) setPlayhead(next.id); } }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveWorkspace(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(event.shiftKey ? 1 : -1); }
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, [go, list, selected, settings]);
  useEffect(() => {
    const timer = setInterval(() => { const date = new Date(), now = date.toTimeString().slice(0, 5), token = `${date.toDateString()} ${now}`; allCues().filter((item) => item.wallClock === now && item.lastWallClock !== token).forEach((item) => { patchCueById(item.id, { lastWallClock: token }); runCue(item); }); }, 1000);
    return () => clearInterval(timer);
  }, [workspace]);
  useEffect(() => {
    if (!midiRef.current) return;
    midiRef.current.inputs.forEach((input) => input.onmidimessage = (event) => { const message = [...event.data].join(","); allCues().filter((item) => item.midiTrigger === message).forEach(runCue); });
    return () => midiRef.current?.inputs.forEach((input) => input.onmidimessage = null);
  }, [connections.midi, workspace]);

  const addCue = (type) => {
    const id = uid(), template = workspace.templates?.[type] || defaults[type], number = settings.autoNumber ? String((list.cues.length + 1) * settings.increment) : "";
    const usedSlots = new Set(list.cues.map((item, index) => item.cartSlot ?? index)), firstSlot = Array.from({ length: list.cues.length + 1 }, (_, index) => index).find((index) => !usedSlots.has(index));
    const value = { ...baseCue, ...template, id, number, type, duration: ["Text", "Wait"].includes(type) ? 1 : 0, ...(type === "MIDI" ? { target: "144,60,64" } : {}), ...(list.kind === "cart" ? { cartSlot: cartSlot ?? firstSlot } : {}) };
    setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: [...item.cues, value] } : item) }));
    setSelected(id); setPlayhead(id); setCartSlot(null); setInspectorTab("Basics"); setOpenMenu("");
  };
  const removeCue = () => { if (!cue) return; const index = list.cues.findIndex((item) => item.id === cue.id), next = list.cues[index + 1] || list.cues[index - 1]; stopCue(cue.id); setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: item.cues.filter((value) => value.id !== cue.id) } : item) })); setSelected(next?.id || ""); setPlayhead(next?.id || ""); setContext(null); };
  const pasteCue = (value = copied) => { if (!value) return; const usedSlots = new Set(list.cues.map((item, index) => item.cartSlot ?? index)), firstSlot = Array.from({ length: list.cues.length + 1 }, (_, index) => index).find((index) => !usedSlots.has(index)); const copy = { ...value, id: uid(), number: settings.autoNumber ? String((list.cues.length + 1) * settings.increment) : "", name: `${value.name} copy`, ...(list.kind === "cart" ? { cartSlot: firstSlot } : {}) }; setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: [...item.cues, copy] } : item) })); setSelected(copy.id); };
  const saveWorkspace = async (template = false, forceNew = false) => {
    const content = await exportWorkspace(workspace), name = template ? "StageCue-template.json" : "StageCue-workspace.json";
    try { if (!template && !forceNew && workspaceHandle.current) { const writer = await workspaceHandle.current.createWritable(); await writer.write(content); await writer.close(); return; } if ("showSaveFilePicker" in window) { const handle = await (window as any).showSaveFilePicker({ suggestedName: name, types: [{ description: "StageCue workspace", accept: { "application/json": [".json"] } }] }); const writer = await handle.createWritable(); await writer.write(content); await writer.close(); if (!template) { workspaceHandle.current = handle; setWorkspace((state) => ({ ...state, name: handle.name.replace(/\.json$/i, "") })); } return; } } catch (error) { if ((error as DOMException).name === "AbortError") return; }
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([content], { type: "application/json" })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const openWorkspace = async () => { try { if ("showOpenFilePicker" in window) { const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: "StageCue workspace", accept: { "application/json": [".json"] } }] }); const value = normalizeWorkspace(await importWorkspaceFiles(JSON.parse(await (await handle.getFile()).text()))), first = value.lists.find((item) => item.id === value.currentList)?.cues[0]?.id || ""; workspaceHandle.current = handle; setWorkspace({ ...value, name: handle.name.replace(/\.json$/i, "") }); setSelected(first); setPlayhead(first); return; } } catch (error) { if ((error as DOMException).name === "AbortError") return; } fileRef.current?.click(); };
  const importWorkspace = async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const value = normalizeWorkspace(await importWorkspaceFiles(JSON.parse(await file.text()))), first = value.lists.find((item) => item.id === value.currentList)?.cues[0]?.id || ""; workspaceHandle.current = null; setWorkspace({ ...value, name: file.name.replace(/\.json$/i, "") }); setSelected(first); setPlayhead(first); } catch (error) { fail(error); } };
  const importMedia = async (event) => { const file = event.target.files?.[0]; if (!file || !cue) return; await storeFile(cue.id, file); const patch = { fileKey: cue.id, fileName: file.name }; if (["Audio", "Video"].includes(cue.type)) { const media = document.createElement(cue.type.toLowerCase()); const url = URL.createObjectURL(file); media.src = url; await new Promise((resolve) => { media.onloadedmetadata = resolve; media.onerror = resolve; }); if (Number.isFinite(media.duration)) patch.duration = Math.round(media.duration * 100) / 100; URL.revokeObjectURL(url); } patchCue(patch); event.target.value = ""; };
  const newList = (kind) => { const id = uid(); setWorkspace((state) => ({ ...state, currentList: id, lists: [...state.lists, { id, name: kind === "cart" ? "Cue Cart" : `Cue List ${state.lists.length + 1}`, kind, cues: [] }] })); setSelected(""); setPlayhead(""); };
  const selectList = (value) => { setWorkspace((state) => ({ ...state, currentList: value.id })); setSelected(value.cues[0]?.id || ""); setPlayhead(value.cues[0]?.id || ""); setContext(null); };
  const duplicateList = (item) => { const id = uid(), copy = { ...item, id, name: `${item.name} copy`, cues: item.cues.map((value) => ({ ...value, id: uid() })) }; setWorkspace((state) => ({ ...state, currentList: id, lists: [...state.lists, copy] })); setSelected(copy.cues[0]?.id || ""); };
  const renameList = (item) => { const name = prompt("List or cart name", item.name)?.trim(); if (name) setWorkspace((state) => ({ ...state, lists: state.lists.map((value) => value.id === item.id ? { ...value, name } : value) })); };
  const deleteList = (item) => { if (workspace.lists.length === 1) return; const next = workspace.lists.find((value) => value.id !== item.id); setWorkspace((state) => ({ ...state, currentList: next.id, lists: state.lists.filter((value) => value.id !== item.id) })); setSelected(next.cues[0]?.id || ""); setPlayhead(next.cues[0]?.id || ""); };
  const restoreHistory = (offset) => { const index = historyIndex.current + offset; if (!historyRef.current[index]) return; restoringHistory.current = true; historyIndex.current = index; setWorkspace(structuredClone(historyRef.current[index])); setHistoryStatus({ undo: index > 0, redo: index < historyRef.current.length - 1 }); };
  const moveCue = (offset) => { if (!cue) return; const index = list.cues.findIndex((item) => item.id === cue.id), destination = index + offset; if (destination < 0 || destination >= list.cues.length) return; setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => { if (item.id !== list.id) return item; const cues = [...item.cues], [moving] = cues.splice(index, 1); cues.splice(destination, 0, moving); return { ...item, cues }; }) })); };
  const menuAction = (item) => {
    if (cueTypes.some(([name]) => name === item)) return addCue(item);
    if (item === "New Workspace") { stopAll(); workspaceHandle.current = null; setWorkspace(initial); setSelected("welcome"); setPlayhead("welcome"); }
    if (item === "Open Workspace...") openWorkspace();
    if (item === "Save") saveWorkspace(); if (item === "Save As...") saveWorkspace(false, true); if (item === "Save As Template") saveWorkspace(true);
    if (item === "Workspace Settings") setSettingsOpen(true);
    if (item === "Undo") restoreHistory(-1); if (item === "Redo") restoreHistory(1);
    if (item === "Copy") setCopied(cue ? { ...cue } : null); if (item === "Cut" && cue) { setCopied({ ...cue }); removeCue(); } if (item === "Paste") pasteCue(); if (item === "Duplicate") pasteCue(cue); if (item === "Delete") removeCue();
    if (item === "Move Cue Up") moveCue(-1); if (item === "Move Cue Down") moveCue(1);
    if (item === "Renumber cues") setWorkspace((state) => ({ ...state, lists: state.lists.map((value) => value.id === list.id ? { ...value, cues: value.cues.map((entry, index) => ({ ...entry, number: String((index + 1) * settings.increment) })) } : value) }));
    if (item === "Delete cue numbers") setWorkspace((state) => ({ ...state, lists: state.lists.map((value) => value.id === list.id ? { ...value, cues: value.cues.map((entry) => ({ ...entry, number: "" })) } : value) }));
    if (item === "Jump to selected cue target" && cue) { const target = findCue(cue.target); if (target) { setSelected(target.id); setPlayhead(target.id); } }
    if (item === "Toggle audition mode") patchSettings({ audition: !settings.audition }); if (item === "Open device settings") { setSettingsPage("Devices"); setSettingsOpen(true); }
    if (item === "Enter Edit Mode") setMode("edit"); if (item === "Enter Show Mode") setMode("show"); if (item === "Enter Full Screen") document.documentElement.requestFullscreen?.();
    if (item === "Inspector") setVisible((value) => ({ ...value, inspector: !value.inspector })); if (item === "Toolbox") setVisible((value) => ({ ...value, toolbox: !value.toolbox })); if (item.startsWith("GO Button")) setVisible((value) => ({ ...value, masthead: !value.masthead })); if (item.startsWith("Lists /")) setVisible((value) => ({ ...value, sidebar: !value.sidebar }));
    if (["Select next", "Select previous"].includes(item)) { const offset = item.endsWith("next") ? 1 : -1, next = list.cues[Math.max(0, Math.min(list.cues.length - 1, list.cues.findIndex((value) => value.id === selected) + offset))]; if (next) { setSelected(next.id); setPlayhead(next.id); } }
    if (item === "Open Workspace in New Window") window.open(location.href, "_blank"); if (item === "Open Stage Output") openStage();
    if (["StageCue Help", "Keyboard Shortcuts", "Browser limitations", "About StageCue"].includes(item)) setHelp(item);
    setOpenMenu("");
  };
  const menuDisabled = (item) => item === "Undo" && !historyStatus.undo || item === "Redo" && !historyStatus.redo || (["Cut", "Copy", "Duplicate", "Delete"].includes(item) && !cue) || item === "Paste" && !copied || item === "Move Cue Up" && (!cue || list.cues[0]?.id === cue.id) || item === "Move Cue Down" && (!cue || list.cues.at(-1)?.id === cue.id) || item === "Jump to selected cue target" && (!cue || !findCue(cue.target)) || item === "Select next" && playIndex >= list.cues.length - 1 || item === "Select previous" && playIndex <= 0 || item === "Enter Edit Mode" && mode === "edit" || item === "Enter Show Mode" && mode === "show" || mode === "show" && ["Inspector", "GO Button / Standby Display / Toolbar", "Toolbox", "Lists / Carts & Active Cues"].includes(item);

  return <main className={`app ${mode === "show" ? "show-mode" : ""}`} onClick={() => setContext(null)}>
    <input ref={fileRef} hidden type="file" accept="application/json" onChange={importWorkspace} />
    <input ref={mediaRef} hidden type="file" accept="audio/*,video/*,.mid,.midi" onChange={importMedia} />
    <header className="menu-bar" onClick={(event) => event.stopPropagation()}><div className="brand"><Box size={17} />StageCue</div>{Object.entries(menuData).map(([name, items]) => <div className="menu-wrap" key={name}><button className={openMenu === name ? "open" : ""} onClick={() => setOpenMenu(openMenu === name ? "" : name)}>{name}</button>{openMenu === name && <div className="dropdown">{items.map((item, index) => item === "-" ? <hr key={index} /> : <button key={item} disabled={menuDisabled(item)} onClick={() => menuAction(item)}><span>{item}</span>{item === "Save" && <kbd>Cmd S</kbd>}</button>)}</div>}</div>)}<div className="workspace-title">{workspace.name} - {list.name}</div></header>
    {mode === "edit" && visible.masthead && <section className="masthead"><button className={`go ${active.length ? "running" : ""}`} onClick={go}>{list.kind === "cart" ? "Preview" : "GO"}</button><div className="standby"><div className="standby-name">{findCue(list.cues.find((item) => item.id === playhead)?.number) ? `${list.cues.find((item) => item.id === playhead).number} - ${list.cues.find((item) => item.id === playhead).name}` : "[no cue on standby]"}</div><div className="standby-notes">{list.cues.find((item) => item.id === playhead)?.notes || ""}</div></div><div className="transport"><IconButton icon={RotateCcw} label="Reset all" onClick={stopAll} /><IconButton icon={Pause} label="Pause all" onClick={pauseAll} /><IconButton icon={Play} label="Resume all" onClick={resumeAll} /><IconButton icon={Square} label="Panic all" onClick={stopAll} /></div></section>}
    {mode === "edit" && visible.toolbox && <section className="toolbox">{cueTypes.slice(0, 12).map(([name, Icon]) => <button key={name} onClick={() => addCue(name)} title={`New ${name} cue`}><Icon size={17} /><span>{name}</span></button>)}<button className="toolbox-more" onClick={() => setOpenMenu("Cues")}><Menu size={16} />Add control cue...<ChevronDown size={14} /></button></section>}
    <section className="work-area"><div className="center">{list.kind === "list" ? <CueList list={list} selected={selected} playhead={playhead} active={active} remaining={remaining} onSelect={(id) => { setSelected(id); setInspectorTab("Basics"); if (settings.lockPlayhead) setPlayhead(id); }} onContext={(event, id) => { event.preventDefault(); event.stopPropagation(); setSelected(id); setInspectorTab("Basics"); setContext({ x: event.clientX, y: event.clientY, type: "cue" }); }} /> : <CueCart list={list} selected={selected} slot={cartSlot} active={active} onEmpty={(index) => { setCartSlot(index); setSelected(""); }} onSelect={(id) => { setCartSlot(null); setSelected(id); setInspectorTab("Basics"); runCue(list.cues.find((item) => item.id === id)); }} onContext={(event, id) => { if (!id) return; event.preventDefault(); event.stopPropagation(); setSelected(id); setInspectorTab("Basics"); setContext({ x: event.clientX, y: event.clientY, type: "cue" }); }} />}</div>{(visible.sidebar || mode === "show") && <Sidebar lists={workspace.lists} current={list.id} active={active} allCues={allCues()} tab={sidebarTab} setTab={setSidebarTab} select={selectList} context={(event, item) => { event.preventDefault(); event.stopPropagation(); setContext({ x: event.clientX, y: event.clientY, type: "list", item }); }} newList={newList} stop={stopAll} pause={pauseAll} resume={resumeAll} />}</section>
    {mode === "edit" && visible.inspector && <Inspector cue={cue} cues={allCues()} tab={inspectorTab} setTab={setInspectorTab} patch={patchCue} preview={() => runCue(cue)} media={() => mediaRef.current?.click()} devices={devices} settings={settings} />}
    <footer><div className="mode-switch"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button><button className={mode === "show" ? "active" : ""} onClick={() => setMode("show")}>Show</button></div><IconButton icon={SlidersHorizontal} label="Toggle toolbox" active={visible.toolbox} onClick={() => setVisible((value) => ({ ...value, toolbox: !value.toolbox }))} disabled={mode === "show"} /><IconButton icon={AlignLeft} label="Toggle masthead" active={visible.masthead} onClick={() => setVisible((value) => ({ ...value, masthead: !value.masthead }))} disabled={mode === "show"} /><span>{list.cues.length} cues in {workspace.lists.length} lists and carts</span><IconButton icon={MonitorPlay} label="Toggle inspector" active={visible.inspector} onClick={() => setVisible((value) => ({ ...value, inspector: !value.inspector }))} disabled={mode === "show"} /><IconButton icon={List} label="Toggle lists and carts" active={visible.sidebar} onClick={() => setVisible((value) => ({ ...value, sidebar: !value.sidebar }))} disabled={mode === "show"} /><IconButton icon={Settings} label="Workspace settings" onClick={() => setSettingsOpen(true)} /></footer>
    {context && <ContextMenu context={context} cue={cue} patch={patchCue} duplicate={() => pasteCue(cue)} remove={removeCue} run={() => runCue()} newList={newList} renameList={renameList} duplicateList={duplicateList} deleteList={deleteList} canDeleteList={workspace.lists.length > 1} selectList={selectList} close={() => setContext(null)} />}
    {settingsOpen && <SettingsPanel page={settingsPage} setPage={setSettingsPage} close={() => setSettingsOpen(false)} settings={settings} patch={patchSettings} connections={connections} devices={devices} connect={connect} openStage={openStage} writeSerial={(value) => writeSerial(serialRef.current, value).catch(fail)} midiRef={midiRef} workspace={workspace} setWorkspace={setWorkspace} />}
    {(help || notice) && <HelpPanel kind={help || "Action failed"} message={notice} settings={settings} close={() => { setHelp(""); setNotice(""); }} />}
    {stage && <Stage stage={stage} close={() => { const value = findCue(allCues().find((item) => item.id === stage.cueId)?.number); if (value) stopCue(value.id); else setStage(null); }} />}
  </main>;
}

function CueList({ list, selected, playhead, active, remaining, onSelect, onContext }) {
  return <div className="cue-list"><div className="cue-head"><span></span><span>Number</span><span>Name</span><span>Target</span><span>Pre-Wait</span><span>Duration</span><span>Post-Wait</span><span></span></div><div className="rows">{list.cues.map((cue) => { const Icon = icons[cue.type] || Zap; return <div key={cue.id} className={`cue-row ${selected === cue.id ? "selected" : ""} ${active.includes(cue.id) ? "running" : ""} ${!cue.armed ? "disarmed" : ""} color-${cue.color}`} onClick={() => onSelect(cue.id)} onContextMenu={(event) => onContext(event, cue.id)}><span className={`playhead ${playhead === cue.id ? "here" : ""}`}>{active.includes(cue.id) ? <CirclePlay size={15} /> : <ChevronRight size={14} />}</span><span className="number"><Icon size={15} />{cue.number}</span><strong>{cue.name}</strong><span className="target">{cue.fileName || cue.target || "--"}</span><span>{time(cue.pre)}</span><span>{time(remaining[cue.id] ?? cue.duration)}</span><span>{time(cue.post)}</span><span>{cue.flagged && <Flag size={13} />}</span></div>; })}</div></div>;
}
function CueCart({ list, selected, slot, active, onSelect, onEmpty, onContext }) {
  return <div className="cart-grid">{Array.from({ length: Math.max(20, ...list.cues.map((cue, index) => (cue.cartSlot ?? index) + 5)) }, (_, index) => { const cue = list.cues.find((item, cueIndex) => (item.cartSlot ?? cueIndex) === index), Icon = cue ? icons[cue.type] || Zap : Plus; return <button aria-label={cue ? undefined : `Empty cue cart slot ${index + 1}`} key={cue?.id || index} className={`${cue ? `filled color-${cue.color}` : ""} ${selected === cue?.id || !cue && slot === index ? "selected" : ""} ${active.includes(cue?.id) ? "running" : ""}`} onClick={() => cue ? onSelect(cue.id) : onEmpty(index)} onContextMenu={(event) => cue && onContext(event, cue.id)}><Icon size={cue ? 24 : 18} />{cue && <><strong>{cue.number}</strong><span>{cue.name}</span></>}</button>; })}</div>;
}
function Sidebar({ lists, current, active, allCues, tab, setTab, select, context, newList, stop, pause, resume }) {
  return <aside className="sidebar"><div className="side-transport"><IconButton icon={RotateCcw} label="Reset all" onClick={stop} /><IconButton icon={Pause} label="Pause all" onClick={pause} /><IconButton icon={Play} label="Resume all" onClick={resume} /><IconButton icon={Square} label="Panic all" onClick={stop} /></div><div className="side-tabs"><button className={tab === "lists" ? "active" : ""} onClick={() => setTab("lists")}>{lists.filter((item) => item.kind === "list").length} Lists and {lists.filter((item) => item.kind === "cart").length} Carts</button><button className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>{active.length} Active Cues</button></div><div className="side-list">{tab === "lists" ? lists.map((item) => <button key={item.id} className={current === item.id ? "selected" : ""} onClick={() => select(item)} onContextMenu={(event) => context(event, item)}><ChevronRight size={13} />{item.kind === "cart" ? <Box size={14} /> : <List size={14} />}<span>{item.name}</span><small>{item.cues.length}</small></button>) : active.length ? active.map((id) => { const cue = allCues.find((item) => item.id === id); return <div key={id}>{cue?.number} - {cue?.name}</div>; }) : <div className="empty">No active cues</div>}</div><div className="side-actions"><button onClick={() => newList("list")}>New List</button><button onClick={() => newList("cart")}>New Cart</button><button onClick={() => window.open(location.href, "_blank")}>Open in New Window</button></div></aside>;
}

function Inspector({ cue, cues, tab, setTab, patch, preview, media, devices, settings }) {
  if (!cue) return <section className="inspector empty-inspector">No Cue Selected</section>;
  const actionTypes = ["Text", "Video", "Camera", "Mic", "Network", "MIDI", "MIDI File", "Light", "Timecode"];
  const tabs = cue.type === "Group" ? ["Basics", "Triggers", "Mode", "Timeline"] : ["Basics", "Triggers", ...(actionTypes.includes(cue.type) ? ["Action"] : []), ...(["Audio", "Mic", "Fade", "Devamp"].includes(cue.type) ? ["Levels"] : []), ...(["Audio", "Video"].includes(cue.type) ? ["Time & Loops"] : [])];
  const placeholder = { Text: "Text shown on stage", Group: "Child cue numbers, comma separated", MIDI: "MIDI bytes, for example: 144,60,100", Light: "Serial command or DMX bridge payload", Network: "HTTPS or WebSocket URL", Script: "JavaScript using api.go, api.stop, api.stage, or fetch", Target: "Cue number=new target" }[cue.type] || "Target cue number";
  return <section className="inspector"><div className="inspector-tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === "Basics" && <div className="inspector-grid"><label>Number:<input value={cue.number} onChange={(event) => patch({ number: event.target.value })} /></label><label className="wide">Name:<input value={cue.name} onChange={(event) => patch({ name: event.target.value })} /></label><label>Duration:<input type="number" min="0" step="0.1" value={cue.duration} onChange={(event) => patch({ duration: Number(event.target.value) })} /></label><label>Target:<div className="target-input">{cue.type === "Script" ? <textarea value={cue.target} placeholder={placeholder} onChange={(event) => patch({ target: event.target.value })} /> : <input value={cue.fileName || cue.target} placeholder={placeholder} readOnly={["Audio", "Video", "MIDI File"].includes(cue.type)} onChange={(event) => patch({ target: event.target.value })} />}{["Audio", "Video", "MIDI File"].includes(cue.type) && <button onClick={media} title="Choose file"><FolderOpen size={15} /></button>}</div></label><label>Pre-Wait:<input type="number" min="0" step="0.1" value={cue.pre} onChange={(event) => patch({ pre: Number(event.target.value) })} /></label><label>Post-Wait:<input type="number" min="0" step="0.1" value={cue.post} onChange={(event) => patch({ post: Number(event.target.value) })} /></label><label>Continue:<select value={cue.continueMode} onChange={(event) => patch({ continueMode: event.target.value })}><option>Do not continue</option><option>Auto continue</option><option>Auto follow</option></select></label><label className="notes">Notes:<textarea value={cue.notes} onChange={(event) => patch({ notes: event.target.value })} /></label><div className="checks"><label><input type="checkbox" checked={cue.flagged} onChange={(event) => patch({ flagged: event.target.checked })} />Flagged</label><label><input type="checkbox" checked={cue.armed} onChange={(event) => patch({ armed: event.target.checked })} />Armed</label><label>Color:<select value={cue.color} onChange={(event) => patch({ color: event.target.value })}>{colors.map((color) => <option key={color}>{color}</option>)}</select></label></div></div>}
    {tab === "Triggers" && <div className="panel-form"><label>Hotkey:<input value={cue.hotkey} placeholder="Key value" onChange={(event) => patch({ hotkey: event.target.value })} /></label><label>Wall clock:<input type="time" value={cue.wallClock} onChange={(event) => patch({ wallClock: event.target.value, lastWallClock: "" })} /></label><label>MIDI message:<input value={cue.midiTrigger} placeholder="144,60,100" onChange={(event) => patch({ midiTrigger: event.target.value })} /></label></div>}
    {tab === "Mode" && <div className="mode-options">{["Timeline", "Start first and enter", "Start first", "Start random", "Playlist"].map((item) => <label key={item}><input type="radio" name="group-mode" checked={cue.groupMode === item} onChange={() => patch({ groupMode: item })} />{item}</label>)}</div>}
    {tab === "Timeline" && <div className="timeline"><div className="ruler">0 sec <span>5 sec</span><span>10 sec</span></div>{String(cue.target).split(",").map((number) => cues.find((item) => item.number === number.trim())).filter(Boolean).map((child) => <div className="timeline-track" key={child.id}><div style={{ marginLeft: `${Math.min(75, child.pre * 8)}%`, width: `${Math.max(12, child.duration * 8)}%` }}>{child.number} - {child.name}</div></div>)}</div>}
    {tab === "Action" && <Action cue={cue} patch={patch} preview={preview} devices={devices} settings={settings} />}
    {tab === "Levels" && <div className="panel-form"><label>Level:<input type="range" min="0" max="100" value={cue.volume} onChange={(event) => patch({ volume: Number(event.target.value) })} /></label><strong>{cue.volume} percent</strong></div>}
    {tab === "Time & Loops" && <div className="panel-form"><label>Rate:<input type="range" min="25" max="200" value={cue.rate} onChange={(event) => patch({ rate: Number(event.target.value) })} /></label><label>Loops (0 is infinite):<input type="number" min="0" value={cue.loops} onChange={(event) => patch({ loops: Number(event.target.value) })} /></label></div>}
  </section>;
}
function Action({ cue, patch, preview, devices, settings }) {
  if (["Text", "Timecode"].includes(cue.type)) return <div className="panel-form"><label>Text color:<input type="color" value={cue.textColor} onChange={(event) => patch({ textColor: event.target.value })} /></label><label>Background:<input type="color" value={cue.backgroundColor} onChange={(event) => patch({ backgroundColor: event.target.value })} /></label><label>Font size:<input type="number" min="12" max="400" value={cue.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })} /></label><label>Alignment:<select value={cue.align} onChange={(event) => patch({ align: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><button onClick={preview}>Preview</button></div>;
  if (["Video", "Camera"].includes(cue.type)) return <div className="panel-form"><label>Fit:<select value={cue.fit} onChange={(event) => patch({ fit: event.target.value })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></label><label>Opacity:<input type="range" min="0" max="100" value={cue.opacity} onChange={(event) => patch({ opacity: Number(event.target.value) })} /></label><label>Background:<input type="color" value={cue.backgroundColor} onChange={(event) => patch({ backgroundColor: event.target.value })} /></label>{cue.type === "Camera" && <><p>Input: {devices.videoinput.find((item) => item.deviceId === settings.videoInput)?.label || "Browser default camera"}. Permission is requested when the cue starts.</p><label><input type="checkbox" checked={cue.cameraAudio} onChange={(event) => patch({ cameraAudio: event.target.checked })} /> Route camera audio</label></>}<button onClick={preview}>Preview</button></div>;
  if (cue.type === "Network") return <div className="panel-form"><label>Method:<select value={cue.method} onChange={(event) => patch({ method: event.target.value })}><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option><option>GET</option></select></label><label>Payload:<textarea value={cue.payload} onChange={(event) => patch({ payload: event.target.value })} /></label><button onClick={preview}>Send</button></div>;
  if (cue.type === "Mic") return <div className="panel-form"><p>Input: {devices.audioinput.find((item) => item.deviceId === settings.audioInput)?.label || "Browser default microphone"}</p><p>Microphone permission is requested when the cue starts.</p><button onClick={preview}>Preview</button></div>;
  if (cue.type === "Camera") return <div className="panel-form"><p>Input: {devices.videoinput.find((item) => item.deviceId === settings.videoInput)?.label || "Browser default camera"}</p><p>Camera permission is requested when the cue starts.</p></div>;
  if (cue.type === "MIDI") { const statuses = { "Note Off": 128, "Note On": 144, "Poly Pressure": 160, "Control Change": 176, "Program Change": 192, "Channel Pressure": 208, "Pitch Bend": 224 }; const update = (value) => { const next = { ...cue, ...value }, oneByte = ["Program Change", "Channel Pressure"].includes(next.midiCommand); patch({ ...value, target: [statuses[next.midiCommand] + next.midiChannel - 1, next.midiData1, ...(!oneByte ? [next.midiData2] : [])].join(",") }); }; return <div className="panel-form"><p>Output: {devices.midioutput.find((item) => item.id === settings.midiOutput)?.name || "First available MIDI output"}</p><label>Command:<select value={cue.midiCommand} onChange={(event) => update({ midiCommand: event.target.value })}>{Object.keys(statuses).map((command) => <option key={command}>{command}</option>)}</select></label><label>Channel:<input type="number" min="1" max="16" value={cue.midiChannel} onChange={(event) => update({ midiChannel: Number(event.target.value) })} /></label><label>Byte 1:<input type="number" min="0" max="127" value={cue.midiData1} onChange={(event) => update({ midiData1: Number(event.target.value) })} /></label><label>Byte 2:<input type="number" min="0" max="127" value={cue.midiData2} onChange={(event) => update({ midiData2: Number(event.target.value) })} /></label><button onClick={preview}>Send Message</button></div>; }
  if (cue.type === "MIDI File") return <div className="panel-form"><p>Output: {devices.midioutput.find((item) => item.id === settings.midiOutput)?.name || "First available MIDI output"}</p><p>The selected Standard MIDI File is parsed and scheduled through Web MIDI.</p><button onClick={preview}>Play</button></div>;
  if (cue.type === "Light") return <div className="panel-form"><p>Output: connected Web Serial device at {settings.baudRate} baud.</p><p>The Target string is written to the serial bridge with a trailing newline.</p><button onClick={preview}>Send</button></div>;
  return null;
}

function ContextMenu({ context, cue, patch, duplicate, remove, run, newList, renameList, duplicateList, deleteList, canDeleteList, selectList, close }) {
  const act = (fn) => { fn(); close(); };
  return <div className="context-menu" style={{ left: Math.min(context.x, innerWidth - 250), top: Math.min(context.y, innerHeight - 380) }} onClick={(event) => event.stopPropagation()}><div className="context-title">{context.type === "cue" ? `${cue?.number} - ${cue?.name}` : context.item.name}</div>{context.type === "cue" ? <><button onClick={() => act(run)}><Play size={14} />Preview</button><button onClick={() => act(() => patch({ armed: !cue.armed }))}><Armchair size={14} />{cue.armed ? "Disarm" : "Arm"}</button><button onClick={() => act(() => patch({ flagged: !cue.flagged }))}><Flag size={14} />{cue.flagged ? "Unflag" : "Flag"}</button><hr /><button onClick={() => act(duplicate)}><Copy size={14} />Duplicate</button><button onClick={() => act(remove)}><Trash2 size={14} />Delete</button><hr /><div className="color-row">{colors.slice(1).map((color) => <button title={color} key={color} className={`swatch color-${color}`} onClick={() => act(() => patch({ color }))} />)}</div></> : <><button onClick={() => act(() => selectList(context.item))}><FolderOpen size={14} />Open</button><button onClick={() => act(() => renameList(context.item))}><Type size={14} />Rename</button><button onClick={() => act(() => window.open(location.href, "_blank"))}><Maximize size={14} />Open in new window</button><button onClick={() => act(() => newList("list"))}><List size={14} />New List</button><button onClick={() => act(() => newList("cart"))}><Box size={14} />New Cart</button><hr /><button onClick={() => act(() => duplicateList(context.item))}><Copy size={14} />Duplicate</button><button disabled={!canDeleteList} onClick={() => act(() => deleteList(context.item))}><Trash2 size={14} />Delete</button></>}</div>;
}

function SettingsPanel({ page, setPage, close, settings, patch, connections, devices, connect, openStage, writeSerial: testSerial, midiRef, workspace, setWorkspace }) {
  const pages = ["General", "Controls", "Audition", "Collaboration", "Templates", "Devices"];
  const [templateType, setTemplateType] = useState("Audio");
  const updateTemplate = (value) => setWorkspace((state) => ({ ...state, templates: { ...state.templates, [templateType]: { ...state.templates[templateType], ...value } } }));
  const testMidi = () => { const output = settings.midiOutput ? midiRef.current?.outputs.get(settings.midiOutput) : [...(midiRef.current?.outputs.values() || [])][0]; output?.send([144, 60, 100]); setTimeout(() => output?.send([128, 60, 0]), 250); };
  return <div className="modal-shade"><div className="settings-panel"><aside>{pages.map((item) => <button className={page === item ? "active" : ""} key={item} onClick={() => setPage(item)}>{item}</button>)}</aside><div className="settings-main"><div className="settings-tabs"><span className="active">{page}</span></div><div className="settings-content">
    {page === "General" && <><Setting label="Auto-number new cues"><input type="checkbox" checked={settings.autoNumber} onChange={(event) => patch({ autoNumber: event.target.checked })} /></Setting><Setting label="Number increment"><input type="number" min="1" value={settings.increment} onChange={(event) => patch({ increment: Number(event.target.value) })} /></Setting><Setting label="Lock playhead to selection"><input type="checkbox" checked={settings.lockPlayhead} onChange={(event) => patch({ lockPlayhead: event.target.checked })} /></Setting></>}
    {page === "Controls" && <><Setting label="GO key"><input value={settings.goKey} onChange={(event) => patch({ goKey: event.target.value })} /></Setting><Setting label="Panic key"><input value={settings.panicKey} onChange={(event) => patch({ panicKey: event.target.value })} /></Setting></>}
    {page === "Audition" && <><Setting label="Audition mode"><input type="checkbox" checked={settings.audition} onChange={(event) => patch({ audition: event.target.checked })} /></Setting><p>Audition mode suppresses Network and Light output while leaving local audio, video, camera, microphone, and text preview available.</p></>}
    {page === "Collaboration" && <><Setting label="Synchronize same-origin tabs"><input type="checkbox" checked={settings.collaboration} onChange={(event) => patch({ collaboration: event.target.checked })} /></Setting><p>BroadcastChannel keeps workspace edits synchronized between StageCue tabs on this origin. Remote-machine collaboration still requires a signaling service.</p></>}
    {page === "Templates" && <div className="template-settings"><div>{cueTypes.map(([type, Icon]) => <button className={templateType === type ? "selected" : ""} key={type} onClick={() => setTemplateType(type)}><Icon size={14} />{type}</button>)}</div><section><Setting label="Default name"><input value={workspace.templates[templateType].name} onChange={(event) => updateTemplate({ name: event.target.value })} /></Setting><Setting label="Default continue mode"><select value={workspace.templates[templateType].continueMode} onChange={(event) => updateTemplate({ continueMode: event.target.value })}><option>Do not continue</option><option>Auto continue</option><option>Auto follow</option></select></Setting><Setting label="Default color"><select value={workspace.templates[templateType].color} onChange={(event) => updateTemplate({ color: event.target.value })}>{colors.map((color) => <option key={color}>{color}</option>)}</select></Setting></section></div>}
    {page === "Devices" && <div className="device-settings"><Device name="Microphone" status={connections.microphone} label="Request permission..." action={() => connect("microphone")} /><Setting label="Audio input"><select value={settings.audioInput} onChange={(event) => patch({ audioInput: event.target.value })}><option value="">Browser default</option>{devices.audioinput.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || item.deviceId}</option>)}</select></Setting><Setting label="Audio output"><select value={settings.audioOutput} onChange={(event) => patch({ audioOutput: event.target.value })}><option value="">Browser default</option>{devices.audiooutput.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || item.deviceId}</option>)}</select></Setting><Device name="Camera" status={connections.camera} label="Request permission..." action={() => connect("camera")} /><Setting label="Video input"><select value={settings.videoInput} onChange={(event) => patch({ videoInput: event.target.value })}><option value="">Browser default</option>{devices.videoinput.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || item.deviceId}</option>)}</select></Setting><Device name="MIDI" status={connections.midi} label={connections.midi === "Not connected" ? "Connect..." : "Disconnect"} action={() => connect("midi")} /><Setting label="MIDI output"><select value={settings.midiOutput} onChange={(event) => patch({ midiOutput: event.target.value })}><option value="">First available</option>{devices.midioutput.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select><button onClick={testMidi} disabled={!devices.midioutput.length}>Test note</button></Setting><Device name="Serial / DMX bridge" status={connections.serial} label={connections.serial === "Connected" ? "Disconnect" : "Connect..."} action={() => connect("serial")} /><Setting label="Serial baud rate"><input type="number" value={settings.baudRate} onChange={(event) => patch({ baudRate: Number(event.target.value) })} /><button disabled={connections.serial !== "Connected"} onClick={() => testSerial("TEST")}>Send test</button></Setting><Setting label="Stage output"><button onClick={openStage}>Open output window</button></Setting></div>}
  </div></div><div className="settings-footer"><button onClick={close}>Done</button></div></div></div>;
}
function Device({ name, status, label, action }) { return <div className="device-row"><strong>{name}</strong><span>{status}</span><button onClick={action}>{label}</button></div>; }
function Setting({ label, children }) { return <label className="setting"><span>{label}</span><div>{children}</div></label>; }
function Stage({ stage, close }) { const ref = useRef(null), plays = useRef(1); useEffect(() => { plays.current = 1; if (stage.stream && ref.current) ref.current.srcObject = stage.stream; if (ref.current) ref.current.playbackRate = (stage.rate || 100) / 100; }, [stage]); const ended = () => { if (stage.loops > plays.current && ref.current) { plays.current++; ref.current.currentTime = 0; ref.current.play(); } }; return <div className="stage" style={{ background: stage.backgroundColor, color: stage.textColor, fontSize: stage.fontSize, textAlign: stage.align }} onDoubleClick={close}>{stage.type === "text" || stage.type === "timecode" ? <div>{stage.content}</div> : <video ref={ref} src={stage.content} autoPlay muted loop={stage.loops === 0} onEnded={ended} controls={stage.type === "video"} style={{ objectFit: stage.fit, opacity: stage.opacity / 100 }} />}</div>; }
function HelpPanel({ kind, message, settings, close }) {
  const body = message ? <p>{message}</p> : kind === "Browser limitations" ? <><p>StageCue uses getUserMedia for microphone and camera cues, Web MIDI for MIDI cues and Standard MIDI Files, Web Serial for lighting or DMX bridges, fetch and WebSocket for Network cues, BroadcastChannel for same-origin collaboration, the File System Access API for workspaces, IndexedDB for media, Wake Lock for Show mode, and popup windows for stage output.</p><p>Chromium still cannot directly provide raw UDP, raw TCP, Art-Net, native Core Audio routing, AppleScript, desktop blackout, or remote collaboration without a bridge or server. Those controls are not exposed.</p></> : kind === "Keyboard Shortcuts" ? <><p>GO: configured as {settings.goKey}</p><p>Up and Down: select cue</p><p>Panic: configured as {settings.panicKey}</p><p>Cmd or Ctrl + S: save workspace</p></> : kind === "About StageCue" ? <><p>StageCue is a browser-native cue sequencer for Chromium.</p><p>Workspace data stays in this browser unless you export or synchronize it.</p></> : <><p>StageCue is a Chromium show-control workspace. Create cues from the toolbox, configure real devices in Workspace Settings, edit actions in the inspector, and press GO.</p></>;
  return <div className="modal-shade"><div className="help-panel"><div><h2>{kind}</h2><button onClick={close}><X size={18} /></button></div>{body}<button onClick={close}>Done</button></div></div>;
}
