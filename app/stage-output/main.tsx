import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../globals.css";
import StageOutput from "./page";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StageOutput />
  </StrictMode>,
);
