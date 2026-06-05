import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.thoughtkeeper",
  appName: "ThoughtKeeper",
  webDir: "out",
  server: {
    // Point the native WebView at your deployed web app.
    // The native app loads the same UI as the web app, with access to device APIs.
    // For local development, point this at the dev server.
    url: "http://localhost:3000",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "thoughtkeeper",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#050505",
    },
  },
};

export default config;
