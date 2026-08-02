"use client";

import { useEffect } from "react";

export default function Pwa() {
  useEffect(() => { navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  return null;
}
