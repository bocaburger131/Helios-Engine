"use client";

import { usePathname } from "next/navigation";
import { useVera, VERA_ACCENT } from "@/components/vera/VeraProvider";

/**
 * Global FAB — hidden on underwriting dashboard where VeraDock is the entry point.
 */
export default function VeraFab() {
  const { isOpen, toggle } = useVera();
  const pathname = usePathname() || "";
  const onDashboard = pathname.startsWith("/dashboard/");

  if (onDashboard) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isOpen ? "Close Vera chat" : "Open Vera chat"}
      aria-expanded={isOpen}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3366a9]"
      style={{ backgroundColor: VERA_ACCENT }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-7 w-7"
        aria-hidden
      >
        <path d="M12 2l1.2 3.6L17 7l-3.8 1.4L12 12l-1.2-3.6L7 7l3.8-1.4L12 2zm6.5 8.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1zM5.5 14l.6 1.8 1.8.6-1.8.6L5.5 19l-.6-1.8L3 16.6l1.8-.6.7-2z" />
      </svg>
    </button>
  );
}
