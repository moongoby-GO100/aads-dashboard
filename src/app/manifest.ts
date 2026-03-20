import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AADS Dashboard",
    short_name: "AADS",
    description: "Autonomous AI Development System",
    start_url: "/chat",
    display: "standalone",
    background_color: "#121228",
    theme_color: "#00d4ff",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
