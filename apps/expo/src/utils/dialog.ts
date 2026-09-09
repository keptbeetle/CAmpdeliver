import { Alert, Platform } from "react-native";

function webAlert(message: string) {
  const alertFn = (globalThis as { alert?: (text: string) => void }).alert;
  alertFn?.(message);
}

function webConfirm(message: string) {
  const confirmFn = (globalThis as { confirm?: (text: string) => boolean })
    .confirm;
  return confirmFn?.(message) ?? false;
}

export function showAppAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    webAlert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAppAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  if (Platform.OS === "web") {
    if (webConfirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    {
      text: confirmLabel,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
