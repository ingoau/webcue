import { Maximize2 } from "lucide-react";
import { useEffect } from "react";

export default function StageOutput() {
  useEffect(() => {
    document.title =
      new URLSearchParams(location.search).get("name") || "Stage Output";
  }, []);
  const fullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  const connected =
    typeof window !== "undefined" &&
    Boolean(window.opener && !window.opener.closed);
  return (
    <main className="stage-output">
      <div id="stage-layers" />
      <div className="stage-output-idle" role="status">
        <strong>
          {connected ? "Stage output connected" : "Stage output idle"}
        </strong>
        <span>
          {connected
            ? "Waiting for a visual cue"
            : "Open from WebCue to connect"}
        </span>
      </div>
      <button
        title="Full Screen"
        aria-label="Full Screen"
        onClick={() => fullscreen().catch(() => {})}
      >
        <Maximize2 size={18} />
        <span>Full Screen</span>
      </button>
    </main>
  );
}
