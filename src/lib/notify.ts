"use client";

import { createElement } from "react";
import { toast, type Action } from "sonner";

type NoticeOptions = {
  description?: string;
  id?: string;
  action?: Action;
  /** Critical failures remain until dismissed and use an assertive announcement. */
  critical?: boolean;
};
type NoticeType = "success" | "error" | "warning" | "info";
const durations: Record<NoticeType, number> = {
  success: 4000, info: 4000, warning: 5500, error: 7500,
};
let sequence = 0;
const prefixFor = (key: string) => `${JSON.stringify(key)}:`;

function show(type: NoticeType, title: string, options: NoticeOptions = {}) {
  // A repeated active message updates its existing toast, rather than stacking copies.
  const prefix = prefixFor(options.id ?? `notice:${type}:${title}:${options.description ?? ""}`);
  const active = toast.getToasts().find(notice => String(notice.id).startsWith(prefix));
  // Sonner schedules dismissals on the next animation frame. A fresh instance
  // prevents a prior dismissal from removing a fast retry's new result.
  const id = active?.id ?? `${prefix}${++sequence}`;
  return toast[type](
    options.critical ? createElement("span", { role: "alert" }, title) : title,
    { id, description: options.description, action: options.action,
      duration: options.critical ? Infinity : durations[type],
      // Retire the instance as soon as dismissal starts, including its exit
      // animation, so an immediate repeat gets a fresh and readable toast.
      onDismiss: notice => { toast.dismiss(notice.id); },
      onAutoClose: notice => { toast.dismiss(notice.id); } },
  );
}

export const notify = {
  success: (title: string, options?: NoticeOptions) => show("success", title, options),
  error: (title: string, options?: NoticeOptions) => show("error", title, options),
  warning: (title: string, options?: NoticeOptions) => show("warning", title, options),
  info: (title: string, options?: NoticeOptions) => show("info", title, options),
  dismiss: (key?: string) => {
    if (key === undefined) { toast.dismiss(); return; }
    const prefix = prefixFor(key);
    for (const notice of toast.getToasts())
      if (String(notice.id).startsWith(prefix)) toast.dismiss(notice.id);
  },
};

export function isNotificationTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("[data-sonner-toaster]");
}
