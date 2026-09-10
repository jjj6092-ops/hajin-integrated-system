"use client";

import { useEffect } from "react";

export default function GlobalUiPatches() {
  useEffect(() => {
    const applyWorkflowLabels = () => {
      const scheduleHeadings = Array.from(document.querySelectorAll("p")).filter((node) =>
        node.textContent?.trim().endsWith("오늘의 일정"),
      );

      scheduleHeadings.forEach((heading) => {
        const section = heading.closest("section");
        if (!section) return;

        section.querySelectorAll("button p").forEach((label) => {
          const text = label.textContent?.trim();
          if (text === "접수") label.textContent = "접수완료";
          if (text === "출동") label.textContent = "출동/작업진행중";
        });
      });
    };

    const handleLogoClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const logo = target.closest('img[src*="hajin-emblem-transparent.png"]');
      if (!logo) return;

      event.preventDefault();
      window.location.assign("/");
    };

    const markLogosClickable = () => {
      document.querySelectorAll('img[src*="hajin-emblem-transparent.png"]').forEach((logo) => {
        if (logo instanceof HTMLElement) {
          logo.style.cursor = "pointer";
          logo.setAttribute("title", "홈으로 이동");
        }
      });
    };

    const applyAll = () => {
      applyWorkflowLabels();
      markLogosClickable();
    };

    document.addEventListener("click", handleLogoClick, true);
    const observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    applyAll();

    return () => {
      document.removeEventListener("click", handleLogoClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
