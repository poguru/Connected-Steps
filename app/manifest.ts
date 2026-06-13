import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Connected Steps",
    short_name:       "ConnectedSteps",
    description:      "Expert coaching, personalised training plans, and a community built to help you hit every running goal.",
    start_url:        "/dashboard",
    display:          "standalone",
    orientation:      "portrait",
    background_color: "#0a0a0a",
    theme_color:      "#0a0a0a",
    categories:       ["fitness", "health", "sports"],
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
      { src: "/logo.png", sizes: "any",     type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name:      "Dashboard",
        short_name:"Dashboard",
        url:       "/dashboard",
        icons:     [{ src: "/logo.png", sizes: "96x96" }],
      },
      {
        name:      "Events",
        short_name:"Events",
        url:       "/events",
        icons:     [{ src: "/logo.png", sizes: "96x96" }],
      },
    ],
  };
}
