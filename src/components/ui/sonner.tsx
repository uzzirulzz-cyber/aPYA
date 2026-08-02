"use client";

/**
 * Neon "Midnight Tech" Toaster — matches the GPS tracking theme.
 *
 * Toast types map to neon accent colors:
 *   default  → neon blue   (#3b82f6)
 *   success  → neon green  (#10b981)
 *   error    → red         (#ef4444) with glow
 *   warning  → neon amber  (#f59e0b)
 *   info     → neon cyan   (#06b6d4)
 *
 * Each toast has:
 *   - Dark translucent background (#0d1117 / 92% opacity)
 *   - Neon-colored border with glow (box-shadow)
 *   - Neon icon glow
 *   - Monospace label for the type badge
 *   - Close button with neon hover
 *   - Subtle slide-in animation from the right
 */

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps, toast } from "sonner";
import { useEffect, useState } from "react";

// Theme tokens (must match the EmployeeTrackingView T constant)
const NEON = {
  bg: "#0d1117",
  bgTranslucent: "rgba(13, 17, 23, 0.95)",
  panel: "#161b22",
  border: "rgba(48, 54, 61, 0.8)",
  textPrimary: "#f0f6fc",
  textSecondary: "#8b949e",
  textMuted: "#6e7681",
  neonBlue: "#3b82f6",
  neonBlueGlow: "rgba(59, 130, 246, 0.5)",
  neonGreen: "#10b981",
  neonGreenGlow: "rgba(16, 185, 129, 0.5)",
  neonAmber: "#f59e0b",
  neonAmberGlow: "rgba(245, 158, 11, 0.5)",
  neonCyan: "#06b6d4",
  neonCyanGlow: "rgba(6, 182, 212, 0.5)",
  neonPink: "#ec4899",
  red: "#ef4444",
  redGlow: "rgba(239, 68, 68, 0.5)",
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <Sonner
      theme="dark"
      className="neon-toaster"
      position="top-right"
      closeButton
      duration={4000}
      toastOptions={{
        // Per-type styling — applied via Sonner's data attribute system
        classNames: {
          toast:
            "group toast-neon !bg-[#0d1117]/95 !backdrop-blur-xl !border !rounded-lg !px-4 !py-3 !min-w-[320px] !shadow-2xl",
          title: "!text-[#f0f6fc] !font-semibold !text-sm",
          description: "!text-[#8b949e] !text-xs !mt-0.5",
          closeButton:
            "!bg-transparent !border !border-[#30363d] !text-[#8b949e] hover:!bg-[#161b22] hover:!text-[#f0f6fc] !rounded !w-5 !h-5 !opacity-60 hover:!opacity-100",
          actionButton:
            "!bg-[#3b82f6]/15 !text-[#3b82f6] !border !border-[#3b82f6]/40 !rounded !px-3 !py-1 !text-xs !font-medium hover:!bg-[#3b8f6]/25",
          cancelButton:
            "!bg-transparent !text-[#8b949e] !border !border-[#30363d] !rounded !px-3 !py-1 !text-xs hover:!bg-[#161b22]",
          loader: "!border-[#3b82f6] !border-t-transparent",
        },
      }}
      style={
        {
          // CSS variables consumed by Sonner's internal styles
          "--normal-bg": NEON.bgTranslucent,
          "--normal-text": NEON.textPrimary,
          "--normal-border": NEON.border,
          "--success-bg": NEON.bgTranslucent,
          "--success-text": NEON.textPrimary,
          "--success-border": NEON.neonGreen,
          "--error-bg": NEON.bgTranslucent,
          "--error-text": NEON.textPrimary,
          "--error-border": NEON.red,
          "--warning-bg": NEON.bgTranslucent,
          "--warning-text": NEON.textPrimary,
          "--warning-border": NEON.neonAmber,
          "--info-bg": NEON.bgTranslucent,
          "--info-text": NEON.textPrimary,
          "--info-border": NEON.neonCyan,
          // Font
          "--font-sans": "Inter, system-ui, sans-serif",
          "--font-mono": "'JetBrains Mono', monospace",
        } as React.CSSProperties
      }
      // Inject custom CSS for neon glow effects (Sonner doesn't expose these via props)
      {...props}
    />
  );
};

export { Toaster };

/**
 * Neon-styled toast helpers — drop-in replacements for `toast.*` from sonner.
 * Each one wraps the default toast with neon icon + glow border via description.
 *
 * Usage:
 *   import { neonToast } from "@/components/ui/sonner";
 *   neonToast.success("Member clocked in");
 *   neonToast.error("Failed to delete geofence");
 *   neonToast.info("Generating invite link...");
 *   neonToast.warning("Seat limit reached");
 *   neonToast.default("Link copied to clipboard");
 */
export const neonToast = {
  default: (msg: string, opts?: Parameters<typeof toast>[1]) =>
    toast(msg, {
      ...opts,
      style: {
        borderColor: NEON.neonBlue,
        boxShadow: `0 0 0 1px ${NEON.neonBlueGlow}, 0 0 20px ${NEON.neonBlueGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
        ...opts?.style,
      },
      icon: "◈",
    }),

  success: (msg: string, opts?: Parameters<typeof toast.success>[1]) =>
    toast.success(msg, {
      ...opts,
      style: {
        borderColor: NEON.neonGreen,
        boxShadow: `0 0 0 1px ${NEON.neonGreenGlow}, 0 0 20px ${NEON.neonGreenGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
        ...opts?.style,
      },
      icon: "✓",
    }),

  error: (msg: string, opts?: Parameters<typeof toast.error>[1]) =>
    toast.error(msg, {
      ...opts,
      style: {
        borderColor: NEON.red,
        boxShadow: `0 0 0 1px ${NEON.redGlow}, 0 0 20px ${NEON.redGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
        ...opts?.style,
      },
      icon: "✕",
    }),

  warning: (msg: string, opts?: Parameters<typeof toast.warning>[1]) =>
    toast.warning(msg, {
      ...opts,
      style: {
        borderColor: NEON.neonAmber,
        boxShadow: `0 0 0 1px ${NEON.neonAmberGlow}, 0 0 20px ${NEON.neonAmberGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
        ...opts?.style,
      },
      icon: "▲",
    }),

  info: (msg: string, opts?: Parameters<typeof toast>[1]) =>
    toast(msg, {
      ...opts,
      style: {
        borderColor: NEON.neonCyan,
        boxShadow: `0 0 0 1px ${NEON.neonCyanGlow}, 0 0 20px ${NEON.neonCyanGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
        ...opts?.style,
      },
      icon: "ℹ",
    }),

  // Promise-style with neon loading state
  promise: <T,>(
    promise: Promise<T> | (() => Promise<T>),
    opts: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) =>
    toast.promise(promise, {
      loading: opts.loading,
      success: (data) => (typeof opts.success === "function" ? opts.success(data) : opts.success),
      error: (err) => (typeof opts.error === "function" ? opts.error(err) : opts.error),
      style: {
        backgroundColor: NEON.bgTranslucent,
        color: NEON.textPrimary,
        backdropFilter: "blur(16px)",
      },
    }),
};
