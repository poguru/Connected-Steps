import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId:   "in.connectedsteps.app",
  appName: "Connected Steps",
  webDir:  "out",       // unused in server mode — app loads from server URL below
  server: {
    url:             "https://www.connectedsteps.in",
    cleartext:       false, // HTTPS only
    allowNavigation: ["www.connectedsteps.in", "connectedsteps.in"],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["alert", "badge", "sound"],
    },
    SplashScreen: {
      launchShowDuration:  2000,
      backgroundColor:     "#0a0a0a",
      showSpinner:         false,
      androidSplashResourceName: "splash",
      splashFullScreen:    true,
      splashImmersive:     true,
    },
    StatusBar: {
      style:           "Dark",
      backgroundColor: "#0a0a0a",
    },
  },
  android: {
    buildOptions: {
      keystorePath:    "release.keystore",  // to be generated during release
      keystoreAlias:   "connected-steps",
    },
  },
  ios: {
    scheme:          "ConnectedSteps",
    contentInset:    "automatic",
  },
};

export default config;
