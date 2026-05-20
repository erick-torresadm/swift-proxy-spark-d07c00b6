import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { subscribePush, unsubscribePush } from "@/lib/notifications.functions";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isPreviewHost() {
  const h = window.location.hostname;
  return (
    h.includes("id-preview--") ||
    h.includes("lovableproject.com") ||
    h.includes("lovable.app")
      ? h.includes("id-preview--") || h.includes("lovableproject.com")
      : false
  );
}

export interface PushState {
  supported: boolean;
  blockedInPreview: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  loading: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    supported: false,
    blockedInPreview: false,
    permission: "default",
    subscribed: false,
    loading: true,
    isStandalone: false,
    isIOS: false,
    isAndroid: false,
  });

  const subscribeFn = useServerFn(subscribePush);
  const unsubscribeFn = useServerFn(unsubscribePush);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    const blockedInPreview = isInIframe() || isPreviewHost();

    let permission: NotificationPermission | "unsupported" = "unsupported";
    let subscribed = false;
    if (supported) {
      permission = Notification.permission;
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        subscribed = !!sub;
      } catch {
        // ignore
      }
    }

    setState({
      supported,
      blockedInPreview,
      permission,
      subscribed,
      loading: false,
      isStandalone,
      isIOS,
      isAndroid,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refresh();
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      await subscribeFn({
        data: {
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
    } finally {
      await refresh();
    }
  }, [refresh, subscribeFn]);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    } finally {
      await refresh();
    }
  }, [refresh, unsubscribeFn]);

  return { ...state, enable, disable, refresh };
}
