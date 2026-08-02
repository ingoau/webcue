import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./page";
import "./globals.css";

navigator.serviceWorker?.register("/sw.js").catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
