"use client";

import { useEffect } from "react";

export default function UniversalBackPatches() {
  useEffect(() => {
    let restoring = false;

    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const isGalleryOpen = () => {
      const close = document.querySelector('button[aria-label="사진 닫기"]');
      return close instanceof HTMLElement && visible(close);
    };

    const isBackControl = (element: Element) => {
      const button = element.closest("button");
      if (!button) return false;
      const text = button.textContent?.trim() || "";
      const aria = button.getAttribute("aria-label") || "";
      return (
        text === "뒤로" ||
        text.startsWith("←") ||
        text.includes("이전 화면") ||
        aria.includes("뒤로") ||
        aria.includes("이전 화면") ||
        Boolean(button.querySelector("svg.lucide-chevron-left"))
      );
    };

    const findVisibleBackControl = () => {
      const candidates = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
      return candidates.find((button) => visible(button) && isBackControl(button));
    };

    const screenSignature = () => {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .filter((node) => node instanceof HTMLElement && visible(node))
        .map((node) => node.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 8)
        .join("|");

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"],.fixed.inset-0'))
        .filter((node) => node instanceof HTMLElement && visible(node))
        .map((node) => (node.textContent || "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 3)
        .join("|");

      return `${headings}::${dialogs}`;
    };

    const handleClick = (event: MouseEvent) => {
      if (restoring || isGalleryOpen()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isBackControl(target)) return;
      if (target.closest('img[src*="hajin-emblem-transparent.png"]')) return;

      const interactive = target.closest('button,a,[role="button"],summary');
      if (!interactive) return;

      const beforeSignature = screenSignature();
      const beforeLength = window.history.length;

      window.setTimeout(() => {
        if (restoring || isGalleryOpen()) return;
        const afterSignature = screenSignature();
        if (!afterSignature || afterSignature === beforeSignature) return;

        // global-ui-patches already records ordinary button navigation.
        // Only add an entry when that handler did not record this transition.
        if (window.history.length === beforeLength) {
          window.history.pushState({ hajinUniversal: true }, "", window.location.href);
        }
      }, 180);
    };

    const handlePopState = (event: PopStateEvent) => {
      // Photo gallery owns its own history entry and must close itself first.
      if (isGalleryOpen()) return;

      const backButton = findVisibleBackControl();
      if (!backButton) return;

      // Prevent the older fallback handler from sending nested screens straight home.
      event.stopImmediatePropagation();
      restoring = true;
      window.setTimeout(() => {
        backButton.click();
        window.setTimeout(() => {
          restoring = false;
        }, 150);
      }, 0);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return null;
}
