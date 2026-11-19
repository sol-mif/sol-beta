// The icon's still (dev page, icon.html): the body settled, its six colours, no halo, on nothing, so a headless shot of
// /icon.html?bodyat=4000 is the artwork design/icon-build.py cuts every icon from (design/ICON.md).
import { createRoot } from "react-dom/client";
import { Body, HALO } from "../Body";

const size = Number(new URLSearchParams(location.search).get("size")) || 1800;
createRoot(document.getElementById("root")!).render(<Body size={size} state="settled" halo={{ ...HALO, gain: 0 }} />);
