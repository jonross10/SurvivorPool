import type { MetadataRoute } from "next";

// Web app manifest — required for the installed (home-screen) PWA, which is what iOS
// needs before it will allow web push. Served at /manifest.webmanifest and auto-linked.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Survivor Assistant",
    short_name: "Survivor",
    description: "NFL survivor pool picks, win probabilities, and results",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8fd",
    theme_color: "#f5f8fd",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
