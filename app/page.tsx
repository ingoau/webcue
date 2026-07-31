"use client";

import {
  AlignLeft, Armchair, Box, Camera, ChevronDown, ChevronRight, CirclePause,
  CirclePlay, CircleStop, Clock3, Copy, FileAudio, FileDown, FileUp, Flag,
  FolderOpen, Gauge, Group, Keyboard, Lightbulb, List, Maximize, Menu, MessageSquare,
  Mic2, MonitorPlay, Music2, Network, Pause, Play, Plus, Radio, RotateCcw,
  Save, Settings, SlidersHorizontal, Square, Target, Timer, Trash2, Type,
  Undo2, Video, Volume2, WandSparkles, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const cueTypes = [
  ["Group", Group], ["Audio", Volume2], ["Mic", Mic2], ["Video", Video],
  ["Camera", Camera], ["Text", Type], ["Light", Lightbulb], ["Fade", Gauge],
  ["Network", Network], ["MIDI", Music2], ["MIDI File", FileAudio],
  ["Timecode", Clock3], ["Start", Play], ["Stop", Square], ["Pause", Pause],
  ["Load", FileDown], ["Reset", RotateCcw], ["Devamp", WandSparkles],
  ["GoTo", ChevronRight], ["Target", Target], ["Arm", Armchair],
  ["Disarm", X], ["Wait", Timer], ["Memo", MessageSquare], ["Script", Zap],
];

const icons = Object.fromEntries(cueTypes);
const colors = ["none", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta", "gray"];
const uid = () => Math.random().toString(36).slice(2, 9);
const time = (value = 0) => {
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}.00`;
};

const initial = {
  lists: [
    {
      id: "main", name: "Main Cue List", kind: "list", cues: [
        { id: "welcome", number: "1", type: "Memo", name: "Welcome to StageCue", target: "", pre: 0, duration: 0, post: 0, continueMode: "Do not continue", notes: "Select a cue, then edit it in the inspector.", armed: true, flagged: false, color: "none" },
        { id: "house", number: "2", type: "Text", name: "House open", target: "HOUSE OPEN", pre: 0, duration: 4, post: 0, continueMode: "Auto follow", notes: "Text appears on the stage output.", armed: true, flagged: false, color: "blue" },
        { id: "hold", number: "3", type: "Wait", name: "Hold", target: "", pre: 0, duration: 3, post: 0, continueMode: "Auto follow", notes: "", armed: true, flagged: false, color: "none" },
        { id: "clear", number: "4", type: "Text", name: "Clear stage", target: "", pre: 0, duration: 1, post: 0, continueMode: "Do not continue", notes: "", armed: true, flagged: false, color: "none" },
      ],
    },
    { id: "cart", name: "Cue Cart", kind: "cart", cues: [] },
  ],
  currentList: "main",
};

const menuData = {
  File: ["New Workspace", "New From Template...", "Open Workspace...", "Open Recent", "-", "Save", "Save As...", "Save As Template", "-", "Workspace Files", "Workspace Settings", "Workspace Templates"],
  Edit: ["Undo", "Redo", "-", "Cut", "Copy", "Paste", "Paste Cue Properties...", "Delete", "Select All", "-", "Find", "Format"],
  Cues: cueTypes.map(([name]) => name),
  Tools: ["Load to time...", "Renumber selected cues...", "Delete numbers of selected cues", "Jump to selected cues' targets", "Record cue sequence...", "-", "Turn on always audition", "Turn on live fade preview", "Turn on highlight for related cues", "-", "Black out desktop backgrounds", "Restore saved desktop backgrounds"],
  View: ["Enter Full Screen", "-", "Inspector", "GO Button / Standby Display / Toolbar", "Toolbox", "Lists / Carts & Active Cues", "Toggle between Lists / Carts & Active Cues", "Warnings", "-", "Select cue...", "Select next", "Select previous", "-", "Move playhead to cue...", "Move playhead to next cue", "Move playhead to previous cue", "-", "Enter Edit Mode", "Enter Show Mode"],
  Window: ["Minimize", "Zoom", "-", "Workspace", "Audition Window", "Light Dashboard", "-", "Bring All to Front"],
  Help: ["StageCue Help", "Keyboard Shortcuts", "Browser limitations", "-", "About StageCue"],
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
  const [settingsTab, setSettingsTab] = useState("General");
  const [help, setHelp] = useState("");
  const [stage, setStage] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("lists");
  const [inspectorTab, setInspectorTab] = useState("Basics");
  const [visible, setVisible] = useState({ masthead: true, toolbox: true, sidebar: true, inspector: true });
  const [copied, setCopied] = useState(null);
  const fileRef = useRef(null);
  const mediaRef = useRef(null);

  const list = workspace.lists.find((item) => item.id === workspace.currentList) || workspace.lists[0];
  const cue = list.cues.find((item) => item.id === selected);
  const playIndex = list.cues.findIndex((item) => item.id === playhead);

  useEffect(() => {
    const saved = localStorage.getItem("stagecue-workspace");
    if (saved) try { setWorkspace(JSON.parse(saved)); } catch {}
  }, []);
  useEffect(() => localStorage.setItem("stagecue-workspace", JSON.stringify(workspace)), [workspace]);

  const patchCue = (patch) => setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id !== list.id ? item : { ...item, cues: item.cues.map((value) => value.id === selected ? { ...value, ...patch } : value) }) }));
  const addCue = useCallback((type) => {
    const id = uid();
    const value = { id, number: String(list.cues.length + 1), type, name: `Untitled ${type} Cue`, target: type === "Text" ? "New text cue" : "", pre: 0, duration: type === "Wait" ? 1 : ["Audio", "Video", "Text"].includes(type) ? 5 : 0, post: 0, continueMode: "Do not continue", notes: "", armed: true, flagged: false, color: "none" };
    setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: [...item.cues, value] } : item) }));
    setSelected(id); setPlayhead(id); setInspectorTab("Basics"); setOpenMenu("");
  }, [list]);

  const removeCue = () => {
    if (!cue) return;
    const index = list.cues.findIndex((item) => item.id === cue.id);
    const next = list.cues[index + 1] || list.cues[index - 1];
    setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: item.cues.filter((value) => value.id !== cue.id) } : item) }));
    setSelected(next?.id || ""); setPlayhead(next?.id || ""); setContext(null);
  };

  const duplicateCue = () => {
    if (!cue) return;
    const value = { ...cue, id: uid(), number: String(list.cues.length + 1), name: `${cue.name} copy` };
    setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: [...item.cues, value] } : item) }));
    setSelected(value.id); setContext(null);
  };

  const finishCue = useCallback((value) => {
    setActive((items) => items.filter((id) => id !== value.id));
    setRemaining((items) => { const next = { ...items }; delete next[value.id]; return next; });
    if (value.type === "Text" && value.target === "") setStage(null);
    const index = list.cues.findIndex((item) => item.id === value.id);
    const next = list.cues[index + 1];
    if (value.continueMode === "Auto follow" && next) { setPlayhead(next.id); setTimeout(() => runCue(next), 30); }
  }, [list]);

  const runCue = useCallback((value = cue) => {
    if (!value || !value.armed) return;
    if (["Stop", "Pause", "Reset"].includes(value.type)) { setActive([]); setRemaining({}); if (value.type !== "Pause") setStage(null); return; }
    if (value.type === "GoTo") { const target = list.cues.find((item) => item.number === value.target); if (target) setPlayhead(target.id); return; }
    if (value.type === "Arm" || value.type === "Disarm") { const target = list.cues.find((item) => item.number === value.target); if (target) { setSelected(target.id); setTimeout(() => patchCue({ armed: value.type === "Arm" }), 0); } return; }
    setActive((items) => [...new Set([...items, value.id])]);
    if (value.type === "Text") setStage({ type: "text", content: value.target || value.name });
    if (value.type === "Video" && value.target) setStage({ type: "video", content: value.target });
    if (value.type === "Audio" && value.target) { const audio = new Audio(value.target); audio.play().catch(() => {}); }
    const seconds = value.pre + value.duration + value.post;
    setRemaining((items) => ({ ...items, [value.id]: seconds }));
    let left = seconds;
    const timer = setInterval(() => {
      left -= 1;
      setRemaining((items) => ({ ...items, [value.id]: Math.max(0, left) }));
      if (left <= 0) { clearInterval(timer); finishCue(value); }
    }, 1000);
    const index = list.cues.findIndex((item) => item.id === value.id);
    const next = list.cues[index + 1];
    if (value.continueMode === "Auto continue" && next) { setPlayhead(next.id); setTimeout(() => runCue(next), value.post * 1000 + 30); }
  }, [cue, finishCue, list]);

  const go = useCallback(() => {
    const value = list.cues[playIndex < 0 ? 0 : playIndex];
    if (!value) return;
    runCue(value);
    const next = list.cues[(playIndex < 0 ? 0 : playIndex) + 1];
    if (next && value.continueMode === "Do not continue") setPlayhead(next.id);
  }, [list, playIndex, runCue]);

  useEffect(() => {
    const onKey = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (event.code === "Space") { event.preventDefault(); go(); }
      if (event.key === "Escape") { setActive([]); setRemaining({}); setStage(null); setOpenMenu(""); setContext(null); }
      if (event.key === "ArrowDown" && list.cues.length) { const index = Math.min(list.cues.length - 1, Math.max(0, list.cues.findIndex((item) => item.id === selected) + 1)); setSelected(list.cues[index].id); setPlayhead(list.cues[index].id); }
      if (event.key === "ArrowUp" && list.cues.length) { const index = Math.max(0, list.cues.findIndex((item) => item.id === selected) - 1); setSelected(list.cues[index].id); setPlayhead(list.cues[index].id); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveWorkspace(); }
      if ((event.metaKey || event.ctrlKey) && event.key === "Backspace") removeCue();
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, [go, list, selected]);

  const saveWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "StageCue-workspace.json"; anchor.click(); URL.revokeObjectURL(anchor.href); setOpenMenu("");
  };
  const importWorkspace = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { try { const value = JSON.parse(String(reader.result)); setWorkspace(value); setSelected(value.lists[0]?.cues[0]?.id || ""); } catch {} }; reader.readAsText(file);
  };
  const importMedia = (event) => {
    const file = event.target.files?.[0]; if (file) patchCue({ target: URL.createObjectURL(file), fileName: file.name });
  };

  const newList = (kind) => {
    const id = uid();
    setWorkspace((state) => ({ ...state, currentList: id, lists: [...state.lists, { id, name: kind === "cart" ? "Cue Cart" : `Cue List ${state.lists.length + 1}`, kind, cues: [] }] }));
    setSelected(""); setPlayhead(""); setContext(null);
  };
  const duplicateList = (item) => {
    const id = uid();
    const copy = { ...item, id, name: `${item.name} copy`, cues: item.cues.map((value) => ({ ...value, id: uid() })) };
    setWorkspace((state) => ({ ...state, currentList: id, lists: [...state.lists, copy] }));
    setSelected(copy.cues[0]?.id || ""); setPlayhead(copy.cues[0]?.id || "");
  };
  const deleteList = (item) => {
    if (workspace.lists.length === 1) return;
    const next = workspace.lists.find((value) => value.id !== item.id);
    setWorkspace((state) => ({ ...state, currentList: next.id, lists: state.lists.filter((value) => value.id !== item.id) }));
    setSelected(next.cues[0]?.id || ""); setPlayhead(next.cues[0]?.id || "");
  };
  const selectList = (value) => { setWorkspace((state) => ({ ...state, currentList: value.id })); setSelected(value.cues[0]?.id || ""); setPlayhead(value.cues[0]?.id || ""); setContext(null); };

  const menuAction = (item) => {
    if (cueTypes.some(([name]) => name === item)) return addCue(item);
    if (item === "New Workspace") { setWorkspace(initial); setSelected("welcome"); }
    if (item === "Open Workspace...") fileRef.current?.click();
    if (["Save", "Save As..."].includes(item)) saveWorkspace();
    if (["Save As Template", "Workspace Templates"].includes(item)) { setSettingsPage("Templates"); setSettingsTab("Cue Templates"); setSettingsOpen(true); }
    if (item === "Workspace Settings") setSettingsOpen(true);
    if (item === "Copy") setCopied(cue ? { ...cue } : null);
    if (item === "Paste" && copied) { const value = { ...copied, id: uid(), number: String(list.cues.length + 1) }; setWorkspace((state) => ({ ...state, lists: state.lists.map((item) => item.id === list.id ? { ...item, cues: [...item.cues, value] } : item) })); }
    if (item === "Delete") removeCue();
    if (item === "Renumber selected cues...") setWorkspace((state) => ({ ...state, lists: state.lists.map((value) => value.id === list.id ? { ...value, cues: value.cues.map((entry, index) => ({ ...entry, number: String(index + 1) })) } : value) }));
    if (item === "Delete numbers of selected cues") setWorkspace((state) => ({ ...state, lists: state.lists.map((value) => value.id === list.id ? { ...value, cues: value.cues.map((entry) => ({ ...entry, number: "" })) } : value) }));
    if (item === "Jump to selected cues' targets" && cue) { const target = list.cues.find((value) => value.number === cue.target); if (target) { setSelected(target.id); setPlayhead(target.id); } }
    if (item === "Enter Edit Mode") setMode("edit");
    if (item === "Enter Show Mode") setMode("show");
    if (item === "Select next" || item === "Move playhead to next cue") { const next = list.cues[Math.min(list.cues.length - 1, Math.max(0, list.cues.findIndex((value) => value.id === selected) + 1))]; if (next) { setSelected(next.id); setPlayhead(next.id); } }
    if (item === "Select previous" || item === "Move playhead to previous cue") { const previous = list.cues[Math.max(0, list.cues.findIndex((value) => value.id === selected) - 1)]; if (previous) { setSelected(previous.id); setPlayhead(previous.id); } }
    if (item === "Enter Full Screen") document.documentElement.requestFullscreen?.();
    if (item === "Inspector") setVisible((value) => ({ ...value, inspector: !value.inspector }));
    if (item === "Toolbox") setVisible((value) => ({ ...value, toolbox: !value.toolbox }));
    if (item.startsWith("GO Button")) setVisible((value) => ({ ...value, masthead: !value.masthead }));
    if (item.startsWith("Lists /")) setVisible((value) => ({ ...value, sidebar: !value.sidebar }));
    if (["StageCue Help", "Keyboard Shortcuts", "Browser limitations", "About StageCue"].includes(item)) setHelp(item);
    setOpenMenu("");
  };

  return <main className={`app ${mode === "show" ? "show-mode" : ""}`} onClick={() => { setContext(null); }}>
    <input ref={fileRef} hidden type="file" accept="application/json" onChange={importWorkspace} />
    <input ref={mediaRef} hidden type="file" accept="audio/*,video/*" onChange={importMedia} />
    <header className="menu-bar" onClick={(event) => event.stopPropagation()}>
      <div className="brand"><Box size={17} />StageCue</div>
      {Object.entries(menuData).map(([name, items]) => <div className="menu-wrap" key={name}>
        <button className={openMenu === name ? "open" : ""} onClick={() => setOpenMenu(openMenu === name ? "" : name)}>{name}</button>
        {openMenu === name && <div className="dropdown">{items.map((item, index) => item === "-" ? <hr key={index} /> : <button key={`${item}-${index}`} disabled={["Undo", "Redo", "Cut", "Paste Cue Properties...", "Load to time...", "Record cue sequence...", "Black out desktop backgrounds", "Restore saved desktop backgrounds"].includes(item)} onClick={() => menuAction(item)}><span>{item}</span>{item === "Save" && <kbd>Cmd S</kbd>}</button>)}</div>}
      </div>)}
      <div className="workspace-title">Untitled Workspace - {list.name}</div>
    </header>

    {mode === "edit" && visible.masthead && <section className="masthead">
      <button className={`go ${active.length ? "running" : ""}`} onClick={go}>{list.kind === "cart" ? "Preview" : "GO"}</button>
      <div className="standby">
        <div className="standby-name">{list.cues.find((item) => item.id === playhead) ? `${list.cues.find((item) => item.id === playhead).number} - ${list.cues.find((item) => item.id === playhead).name}` : "[no cue on standby]"}</div>
        <div className="standby-notes">{list.cues.find((item) => item.id === playhead)?.notes || ""}</div>
      </div>
      <div className="transport">
        <IconButton icon={RotateCcw} label="Reset all" onClick={() => { setActive([]); setStage(null); }} />
        <IconButton icon={Pause} label="Pause all" onClick={() => setActive([])} />
        <IconButton icon={Play} label="Resume all" onClick={go} />
        <IconButton icon={Square} label="Panic all" onClick={() => { setActive([]); setStage(null); }} />
      </div>
    </section>}

    {mode === "edit" && visible.toolbox && <section className="toolbox">
      {cueTypes.slice(0, 12).map(([name, Icon]) => <button key={name} onClick={() => addCue(name)} title={`New ${name} cue`}><Icon size={17} /><span>{name}</span></button>)}
      <div className="toolbox-more"><Menu size={16} />Add control cue...<ChevronDown size={14} /></div>
    </section>}

    <section className="work-area">
      <div className="center">
        {list.kind === "list" ? <CueList list={list} selected={selected} playhead={playhead} active={active} remaining={remaining} onSelect={(id) => { setSelected(id); setPlayhead(id); }} onContext={(event, id) => { event.preventDefault(); event.stopPropagation(); setSelected(id); setContext({ x: event.clientX, y: event.clientY, type: "cue" }); }} /> : <CueCart list={list} selected={selected} active={active} onSelect={(id) => { setSelected(id); if (id) runCue(list.cues.find((item) => item.id === id)); }} onEmpty={() => setSelected("")} onContext={(event, id) => { if (!id) return; event.preventDefault(); event.stopPropagation(); setSelected(id); setContext({ x: event.clientX, y: event.clientY, type: "cue" }); }} />}
      </div>
      {(visible.sidebar || mode === "show") && <Sidebar lists={workspace.lists} current={list.id} active={active} tab={sidebarTab} setTab={setSidebarTab} select={selectList} context={(event, item) => { event.preventDefault(); event.stopPropagation(); setContext({ x: event.clientX, y: event.clientY, type: "list", item }); }} newList={newList} stop={() => setActive([])} />}
    </section>

    {mode === "edit" && visible.inspector && <Inspector cue={cue} tab={inspectorTab} setTab={setInspectorTab} patch={patchCue} media={() => mediaRef.current?.click()} />}

    <footer>
      <div className="mode-switch"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button><button className={mode === "show" ? "active" : ""} onClick={() => setMode("show")}>Show</button></div>
      <IconButton icon={SlidersHorizontal} label="Toggle toolbox" active={visible.toolbox} onClick={() => setVisible((value) => ({ ...value, toolbox: !value.toolbox }))} disabled={mode === "show"} />
      <IconButton icon={AlignLeft} label="Toggle masthead" active={visible.masthead} onClick={() => setVisible((value) => ({ ...value, masthead: !value.masthead }))} />
      <span>{list.cues.length} cues in {workspace.lists.length} lists and carts</span>
      <IconButton icon={MonitorPlay} label="Toggle inspector" active={visible.inspector} onClick={() => setVisible((value) => ({ ...value, inspector: !value.inspector }))} disabled={mode === "show"} />
      <IconButton icon={List} label="Toggle lists and carts" active={visible.sidebar} onClick={() => setVisible((value) => ({ ...value, sidebar: !value.sidebar }))} />
      <IconButton icon={Settings} label="Workspace settings" onClick={() => setSettingsOpen(true)} />
    </footer>

    {context && <ContextMenu context={context} cue={cue} patch={patchCue} duplicate={duplicateCue} remove={removeCue} run={() => runCue()} newList={newList} duplicateList={duplicateList} deleteList={deleteList} selectList={selectList} close={() => setContext(null)} />}
    {settingsOpen && <SettingsPanel page={settingsPage} setPage={setSettingsPage} tab={settingsTab} setTab={setSettingsTab} close={() => setSettingsOpen(false)} />}
    {help && <HelpPanel kind={help} close={() => setHelp("")} />}
    {stage && <div className="stage" onDoubleClick={() => setStage(null)}>{stage.type === "video" ? <video src={stage.content} autoPlay controls /> : <div>{stage.content}</div>}</div>}
  </main>;
}

function CueList({ list, selected, playhead, active, remaining, onSelect, onContext }) {
  return <div className="cue-list">
    <div className="cue-head"><span></span><span>Number</span><span>Name</span><span>Target</span><span>Pre-Wait</span><span>Duration</span><span>Post-Wait</span><span></span></div>
    <div className="rows">{list.cues.map((cue) => {
      const Icon = icons[cue.type] || Zap;
      return <div key={cue.id} className={`cue-row ${selected === cue.id ? "selected" : ""} ${active.includes(cue.id) ? "running" : ""} ${!cue.armed ? "disarmed" : ""} color-${cue.color}`} onClick={() => onSelect(cue.id)} onDoubleClick={() => onSelect(cue.id)} onContextMenu={(event) => onContext(event, cue.id)}>
        <span className={`playhead ${playhead === cue.id ? "here" : ""}`}>{active.includes(cue.id) ? <CirclePlay size={15} /> : <ChevronRight size={14} />}</span>
        <span className="number"><Icon size={15} />{cue.number}</span><strong>{cue.name}</strong><span className="target">{cue.fileName || cue.target || "--"}</span><span>{time(cue.pre)}</span><span>{time(remaining[cue.id] ?? cue.duration)}</span><span>{time(cue.post)}</span><span>{cue.flagged && <Flag size={13} />}</span>
      </div>;
    })}</div>
  </div>;
}

function CueCart({ list, selected, active, onSelect, onEmpty, onContext }) {
  return <div className="cart-grid">{Array.from({ length: Math.max(20, list.cues.length + 4) }, (_, index) => {
    const cue = list.cues[index]; const Icon = cue ? icons[cue.type] || Zap : Plus;
    return <button key={cue?.id || index} className={`${cue ? `filled color-${cue.color}` : ""} ${selected === cue?.id ? "selected" : ""} ${active.includes(cue?.id) ? "running" : ""}`} onClick={() => cue ? onSelect(cue.id) : onEmpty()} onContextMenu={(event) => onContext(event, cue?.id)}><Icon size={cue ? 24 : 18} />{cue && <><strong>{cue.number}</strong><span>{cue.name}</span></>}</button>;
  })}</div>;
}

function Sidebar({ lists, current, active, tab, setTab, select, context, newList, stop }) {
  return <aside className="sidebar">
    <div className="side-transport"><IconButton icon={RotateCcw} label="Reset all" onClick={stop} /><IconButton icon={Pause} label="Pause all" onClick={stop} /><IconButton icon={Play} label="Resume all" onClick={() => {}} /><IconButton icon={Square} label="Panic all" onClick={stop} /></div>
    <div className="side-tabs"><button className={tab === "lists" ? "active" : ""} onClick={() => setTab("lists")}>{lists.filter((item) => item.kind === "list").length} Lists and {lists.filter((item) => item.kind === "cart").length} Carts</button><button className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>{active.length} Active Cues</button></div>
    <div className="side-list">{tab === "lists" ? lists.map((item) => <button key={item.id} className={current === item.id ? "selected" : ""} onClick={() => select(item)} onContextMenu={(event) => context(event, item)}><ChevronRight size={13} />{item.kind === "cart" ? <Box size={14} /> : <List size={14} />}<span>{item.name}</span><small>{item.cues.length}</small></button>) : active.length ? active.map((id) => <div key={id}>Running cue {id}</div>) : <div className="empty">No active cues</div>}</div>
    <div className="side-actions"><button onClick={() => newList("list")}>New List</button><button onClick={() => newList("cart")}>New Cart</button><button>Open in New Window</button></div>
  </aside>;
}

function Inspector({ cue, tab, setTab, patch, media }) {
  if (!cue) return <section className="inspector empty-inspector">No Cue Selected</section>;
  const tabs = cue.type === "Group" ? ["Basics", "Triggers", "Mode", "Timeline"] : ["Basics", "Triggers", "Action", "Levels", "Time & Loops"];
  return <section className="inspector">
    <div className="inspector-tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}<IconButton icon={Maximize} label="Pop out inspector" onClick={() => {}} /></div>
    {tab === "Basics" && <div className="inspector-grid">
      <label>Number:<input value={cue.number} onChange={(event) => patch({ number: event.target.value })} /></label>
      <label className="wide">Name:<input value={cue.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label>Duration:<input type="number" min="0" value={cue.duration} onChange={(event) => patch({ duration: Number(event.target.value) })} /></label>
      <label>Target:<div className="target-input"><input value={cue.fileName || cue.target} placeholder={cue.type === "Text" ? "Text shown on stage" : "Cue number, address, or media file"} onChange={(event) => patch({ target: event.target.value, fileName: "" })} />{["Audio", "Video", "MIDI File"].includes(cue.type) && <button onClick={media}><FolderOpen size={15} /></button>}</div></label>
      <label>Pre-Wait:<input type="number" min="0" value={cue.pre} onChange={(event) => patch({ pre: Number(event.target.value) })} /></label>
      <label>Post-Wait:<input type="number" min="0" value={cue.post} onChange={(event) => patch({ post: Number(event.target.value) })} /></label>
      <label>Continue:<select value={cue.continueMode} onChange={(event) => patch({ continueMode: event.target.value })}><option>Do not continue</option><option>Auto continue</option><option>Auto follow</option></select></label>
      <label className="notes">Notes:<textarea value={cue.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
      <div className="checks"><label><input type="checkbox" checked={cue.flagged} onChange={(event) => patch({ flagged: event.target.checked })} />Flagged</label><label><input type="checkbox" checked={cue.armed} onChange={(event) => patch({ armed: event.target.checked })} />Armed</label><label>Color:<select value={cue.color} onChange={(event) => patch({ color: event.target.value })}>{colors.map((color) => <option key={color}>{color}</option>)}</select></label></div>
    </div>}
    {tab === "Triggers" && <div className="panel-form"><label><input type="checkbox" />Hotkey Trigger</label><input placeholder="Press a key" /><label><input type="checkbox" />Wall Clock Trigger</label><input type="time" /><label><input type="checkbox" />Timecode Trigger</label><input placeholder="00:00:00:00" /><label><input type="checkbox" />Second trigger on release</label><label>If running, a second trigger:<select><option>does nothing</option><option>stops</option><option>pauses</option><option>restarts</option></select></label></div>}
    {tab === "Mode" && <div className="mode-options">{["Timeline", "Start first and enter", "Start first", "Start random", "Playlist"].map((item, index) => <label key={item}><input type="radio" name="group-mode" defaultChecked={!index} />{item}</label>)}</div>}
    {tab === "Timeline" && <div className="timeline"><div className="ruler">0 sec <span>5 sec</span><span>10 sec</span></div><div className="timeline-track"><div style={{ width: `${Math.max(12, cue.duration * 8)}%` }}>{cue.name}</div></div></div>}
    {["Action", "Levels", "Time & Loops"].includes(tab) && <div className="panel-form"><label>Start time:<input type="number" defaultValue="0" /></label><label>End time:<input type="number" value={cue.duration} onChange={(event) => patch({ duration: Number(event.target.value) })} /></label><label>Rate:<input type="range" min="25" max="200" defaultValue="100" /></label><label>Volume:<input type="range" min="0" max="100" defaultValue="80" /></label><label><input type="checkbox" />Infinite loop</label><label>Loops:<input type="number" defaultValue="1" /></label></div>}
  </section>;
}

function ContextMenu({ context, cue, patch, duplicate, remove, run, newList, duplicateList, deleteList, selectList, close }) {
  const act = (fn) => { fn(); close(); };
  return <div className="context-menu" style={{ left: Math.min(context.x, innerWidth - 250), top: Math.min(context.y, innerHeight - 380) }} onClick={(event) => event.stopPropagation()}>
    <div className="context-title">{context.type === "cue" ? `${cue?.number} - ${cue?.name}` : context.item.name}</div>
    {context.type === "cue" ? <>
      <button onClick={() => act(run)}><Play size={14} />Preview</button><button onClick={() => act(() => patch({ armed: !cue.armed }))}><Armchair size={14} />{cue.armed ? "Disarm" : "Arm"}</button><button onClick={() => act(() => patch({ flagged: !cue.flagged }))}><Flag size={14} />{cue.flagged ? "Unflag" : "Flag"}</button><hr /><button onClick={() => act(duplicate)}><Copy size={14} />Duplicate</button><button onClick={() => act(remove)}><Trash2 size={14} />Delete</button><hr /><div className="color-row">{colors.slice(1).map((color) => <button title={color} key={color} className={`swatch color-${color}`} onClick={() => act(() => patch({ color }))} />)}</div>
    </> : <><button onClick={() => act(() => selectList(context.item))}><FolderOpen size={14} />Open</button><button onClick={() => act(() => window.open(location.href, "_blank"))}><Maximize size={14} />Open in new window</button><button onClick={() => act(() => newList("list"))}><List size={14} />New List</button><button onClick={() => act(() => newList("cart"))}><Box size={14} />New Cart</button><hr /><button onClick={() => act(() => duplicateList(context.item))}><Copy size={14} />Duplicate</button><button onClick={() => act(() => deleteList(context.item))}><Trash2 size={14} />Delete</button></>}
  </div>;
}

const settingsPages = ["General", "Controls", "Audition", "Collaboration", "Templates", "Audio", "Video", "Light", "Network", "MIDI"];
const settingsTabs = { General: ["General", "File Management", "Display"], Controls: ["Keyboard", "Workspace MIDI", "OSC"], Audition: ["Audition"], Collaboration: ["Collaboration"], Templates: ["Cue Templates", "Workspace Templates"], Audio: ["Audio Outputs", "Audio Inputs", "Audio Maps"], Video: ["Video Outputs", "Output Routing", "Output Devices", "Video Inputs"], Light: ["Light Patch", "Light Definitions", "Light Dashboard MIDI"], Network: ["Network Outputs", "OSC Access"], MIDI: ["MIDI Outputs", "MSC Broadcast"] };

function SettingsPanel({ page, setPage, tab, setTab, close }) {
  const choose = (value) => { setPage(value); setTab(settingsTabs[value][0]); };
  return <div className="modal-shade"><div className="settings-panel">
    <aside>{settingsPages.map((item) => <button className={page === item ? "active" : ""} key={item} onClick={() => choose(item)}>{item}</button>)}</aside>
    <div className="settings-main"><div className="settings-tabs">{settingsTabs[page].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><SettingsContent page={page} tab={tab} /></div>
    <div className="settings-footer"><button>Import...</button><button>Export...</button><button onClick={close}>Done</button></div>
  </div></div>;
}

function SettingsContent({ page, tab }) {
  if (page === "General") return <div className="settings-content"><Setting label="Minimum time required between each GO"><input type="number" defaultValue="0" /></Setting><Setting label="Require a key up before re-arming GO"><input type="checkbox" defaultChecked /></Setting><Setting label="Panic duration"><input type="number" defaultValue="1" /></Setting><hr /><Setting label="When workspace opens, start cue number"><input type="checkbox" /><input /></Setting><Setting label="Before workspace closes, start cue number"><input type="checkbox" /><input /></Setting><hr /><Setting label="Auto-number new cues with increment"><input type="checkbox" defaultChecked /><input type="number" defaultValue="1" /></Setting><Setting label="Enable auto-load for new cues"><input type="checkbox" /></Setting><Setting label="Lock playhead to selection"><input type="checkbox" defaultChecked /></Setting></div>;
  if (page === "Controls") return <div className="settings-content"><h3>{tab}</h3>{["GO", "Panic All", "Pause All", "Resume All", "Preview Selected", "Load Last Selected", "Edit cue number", "Edit cue name", "Edit cue target", "Cycle cue continue mode"].map((item, index) => <Setting key={item} label={item}><input defaultValue={["Space", "Esc", "[", "]", "V", "L", "N", "Q", "T", "C"][index]} /></Setting>)}</div>;
  if (page === "Audition") return <div className="settings-content"><p>Auditioning prevents or re-routes each type of output from this workspace.</p>{["Audio", "Video", "MIDI", "Timecode (MTC)", "Timecode (LTC)", "Network", "Light"].map((item) => <Setting key={item} label={item}><select><option>No output</option><option>Leave output unchanged</option><option>Redirect to audition window</option></select></Setting>)}</div>;
  if (page === "Collaboration") return <div className="settings-content"><Setting label="Allow Collaboration connections"><input type="checkbox" defaultChecked /></Setting><Setting label="Ask before allowing a new collaborator to connect"><input type="checkbox" defaultChecked /></Setting><Setting label="When in Show Mode, restrict all collaborators to view-only"><input type="checkbox" defaultChecked /></Setting><p>Browser collaboration requires a separate signaling server and is not enabled in this local workspace.</p></div>;
  if (page === "Templates") return <div className="settings-content template-settings"><div>{cueTypes.map(([item, Icon]) => <button key={item}><Icon size={14} />{item}</button>)}</div><section><h3>{tab}</h3><Setting label="Default cue name"><input placeholder="Untitled Cue" /></Setting><Setting label="Default continue mode"><select><option>Do not continue</option><option>Auto continue</option><option>Auto follow</option></select></Setting><Setting label="Default color"><select>{colors.map((color) => <option key={color}>{color}</option>)}</select></Setting></section></div>;
  const titles = { Audio: "Audio output patch", Video: "Video output stage", Light: "Light instrument", Network: "Network destination", MIDI: "MIDI destination" };
  return <div className="settings-content"><div className="patch-head"><h3>{tab}</h3><button><Plus size={14} />New {titles[page]}</button></div><div className="patch-table"><div><strong>Name</strong><strong>Device or destination</strong><strong>Options</strong></div><div><input defaultValue="Patch 1" /><select><option>Browser default</option><option>No output</option></select><button>Edit...</button></div></div><p>Configure reusable {page.toLowerCase()} destinations for cues in this workspace.</p></div>;
}

function Setting({ label, children }) { return <label className="setting"><span>{label}</span><div>{children}</div></label>; }

function HelpPanel({ kind, close }) {
  const body = kind === "Browser limitations" ? <><p>StageCue implements the parts of QLab that Chromium exposes safely: cue editing, timing, lists, carts, text, audio and video playback, local files, keyboard controls, show mode, templates, and workspace import/export.</p><p>It cannot replace system audio routing, MIDI device patching without browser permission, camera or microphone capture without permission, Art-Net or DMX hardware control, desktop blackout, AppleScript, app-to-app control, arbitrary local file paths, or QLab peer collaboration. Browsers deliberately isolate those OS and hardware capabilities.</p></> : kind === "Keyboard Shortcuts" ? <><p>Space: GO</p><p>Up and Down: select cue</p><p>Escape: panic all</p><p>Cmd or Ctrl + S: save workspace</p></> : <><p>StageCue is a Chromium-based cue workspace inspired by professional show-control workflows.</p><p>Create cues from the toolbox, edit them in the inspector, move the playhead with arrow keys, and press Space to GO.</p></>;
  return <div className="modal-shade"><div className="help-panel"><div><h2>{kind}</h2><button onClick={close}><X size={18} /></button></div>{body}<button onClick={close}>Done</button></div></div>;
}
