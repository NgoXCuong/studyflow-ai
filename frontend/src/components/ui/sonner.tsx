"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return <Sonner
    theme="light"
    position="top-right"
    richColors
    closeButton
    duration={4500}
    visibleToasts={3}
    offset={{ top: 24, right: 24 }}
    mobileOffset={{ top: 16, right: 16, left: 16 }}
    containerAriaLabel="Thông báo"
    style={{
      "--normal-bg": "var(--card)",
      "--normal-text": "var(--foreground)",
      "--normal-border": "var(--color-border, #dce5df)",
      "--border-radius": "var(--radius)",
      zIndex: 100,
    } as CSSProperties}
    toastOptions={{ closeButtonAriaLabel: "Đóng thông báo", classNames: { toast: "font-sans", title: "leading-6 [overflow-wrap:anywhere]", closeButton: "focus-visible:outline-2 focus-visible:outline-ring" } }}
  />;
}
