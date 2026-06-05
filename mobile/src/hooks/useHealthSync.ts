/**
 * Unified health sync hook — works on both iOS (HealthKit) and Android (Health Connect).
 * Detects the platform, requests permissions, fetches activities, pushes to CS backend.
 */
import { useState, useCallback } from "react";
import { Platform, Alert }       from "react-native";
import AsyncStorage              from "@react-native-async-storage/async-storage";
import type { SyncState, HealthSource } from "../types";
import { pushActivities }        from "../services/api";
import { STORAGE_KEY_LAST_SYNC, FIRST_SYNC_DAYS } from "../config";

// Lazy imports — each service only loads on the correct platform
const getHealthService = () =>
  Platform.OS === "ios"
    ? import("../services/healthkit")
    : import("../services/health-connect");

export function useHealthSync(userEmail: string) {
  const [state, setState] = useState<SyncState>({
    status:   "idle",
    imported: 0,
    message:  "",
  });

  const source: HealthSource =
    Platform.OS === "ios" ? "apple_health" : "health_connect";

  const sync = useCallback(async () => {
    setState({ status: "requesting", imported: 0, message: "Requesting permissions…" });

    try {
      const svc = await getHealthService();

      // Check availability (Android only — HealthKit is always available on iOS)
      if (Platform.OS === "android") {
        const available = await (svc as Awaited<ReturnType<typeof import("../services/health-connect")>>).isAvailable();
        if (!available) {
          setState({
            status:  "error",
            imported: 0,
            message:  "",
            error:   "Health Connect is not available on this device. Please install it from the Play Store.",
          });
          Alert.alert(
            "Health Connect Required",
            "Install Health Connect from the Play Store to sync your activities.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      // Request permissions
      const granted = await svc.initAndRequestPermissions();
      if (!granted) {
        setState({ status: "error", imported: 0, message: "", error: "Health permissions were denied." });
        return;
      }

      // Determine sync window
      setState({ status: "fetching", imported: 0, message: "Fetching activities…" });
      const lastSyncRaw = await AsyncStorage.getItem(`${STORAGE_KEY_LAST_SYNC}:${source}`);
      const since = lastSyncRaw
        ? new Date(lastSyncRaw)
        : new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000);

      // Fetch from OS health store
      const activities = await svc.fetchActivities(since);

      if (activities.length === 0) {
        setState({ status: "done", imported: 0, message: "Already up to date — no new activities found." });
        await AsyncStorage.setItem(`${STORAGE_KEY_LAST_SYNC}:${source}`, new Date().toISOString());
        return;
      }

      // Push to CS backend
      setState({ status: "uploading", imported: 0, message: `Uploading ${activities.length} activities…` });
      const result = await pushActivities(userEmail, source, activities);

      // Persist sync time
      await AsyncStorage.setItem(`${STORAGE_KEY_LAST_SYNC}:${source}`, new Date().toISOString());

      setState({
        status:   "done",
        imported: result.imported,
        message:  result.message,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[useHealthSync] error:", msg);
      setState({ status: "error", imported: 0, message: "", error: msg });
    }
  }, [userEmail, source]);

  const reset = useCallback(() => {
    setState({ status: "idle", imported: 0, message: "" });
  }, []);

  return { state, source, sync, reset };
}
