"use client";

import { Maximize2 } from "lucide-react";
import { useEffect } from "react";

export default function StageOutput() {
  useEffect(() => { document.title = new URLSearchParams(location.search).get("name") || "Stage Output"; }, []);
  const fullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); };
  return <main className="stage-output"><div id="stage-layers" /><button title="Full Screen" aria-label="Full Screen" onClick={() => fullscreen().catch(() => {})}><Maximize2 size={18} /></button></main>;
}
