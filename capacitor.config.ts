import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android build of the same web app (SPEC §16: the APK wraps the PWA).
 * CapacitorHttp routes fetch() through native HTTP, which has no CORS, so providers
 * that refuse web pages (NVIDIA's API) work from the APK.
 */
const config: CapacitorConfig = {
  appId: "io.github.dannybaanks.tamagotchia",
  appName: "TamagotchIA",
  webDir: "dist",
  android: { backgroundColor: "#1b1530" },
  plugins: {
    CapacitorHttp: { enabled: true },
    LocalNotifications: { smallIcon: "ic_stat_tamagotchia", iconColor: "#c6ff3d" },
  },
};

export default config;
