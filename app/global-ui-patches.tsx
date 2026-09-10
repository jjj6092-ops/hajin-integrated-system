"use client";

import { useEffect } from "react";

export default function GlobalUiPatches() {
  useEffect(() => {
    const applyWorkflowLabelsAndIcons = () => {
      const scheduleHeadings = Array.from(document.querySelectorAll("p")).filter((node) =>
        node.textContent?.trim().endsWith("오늘의 일정"),
      );

      scheduleHeadings.forEach((heading) => {
        const section = heading.closest("section");
        if (!section) return;

        const buttons = Array.from(section.querySelectorAll("button"));
        let dispatchButton: HTMLButtonElement | null = null;
        let completeButton: HTMLButtonElement | null = null;

        buttons.forEach((button) => {
          const labels = Array.from(button.querySelectorAll("p"));
          labels.forEach((label) => {
            const text = label.textContent?.trim();
            if (text === "접수") label.textContent = "접수완료";
            if (text === "출동") label.textContent = "출동/작업진행중";
            if (label.textContent?.trim() === "출동/작업진행중") dispatchButton = button;
            if (label.textContent?.trim() === "작업완료") completeButton = button;
          });
        });

        if (section.getAttribute("data-workflow-icons-swapped") !== "true" && dispatchButton && completeButton) {
          const dispatchIcon = dispatchButton.querySelector("svg");
          const completeIcon = completeButton.querySelector("svg");
          if (dispatchIcon && completeIcon) {
            const dispatchMarkup = dispatchIcon.outerHTML;
            const completeMarkup = completeIcon.outerHTML;
            dispatchIcon.outerHTML = completeMarkup;
            completeIcon.outerHTML = dispatchMarkup;
            section.setAttribute("data-workflow-icons-swapped", "true");
          }
        }
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

    let lastSnapshot = document.body.innerText;
    let internalDepth = 0;
    let restoring = false;

    const recordInternalNavigation = () => {
      if (restoring) return;
      const nextSnapshot = document.body.innerText;
      if (nextSnapshot === lastSnapshot) return;
      lastSnapshot = nextSnapshot;
      internalDepth += 1;
      window.history.pushState({ hajinInternal: true, depth: internalDepth }, "", window.location.href);
    };

    const handleBack = () => {
      if (internalDepth > 0) {
        restoring = true;
        internalDepth -= 1;
        window.setTimeout(() => {
          const backButtons = Array.from(document.querySelectorAll("button")).filter((button) => {
            const text = button.textContent?.trim() || "";
            const aria = button.getAttribute("aria-label") || "";
            return text === "뒤로" || aria.includes("뒤로") || button.querySelector('svg.lucide-chevron-left');
          });
          const backButton = backButtons[0] as HTMLButtonElement | undefined;
          if (backButton) backButton.click();
          else window.location.assign("/");
          lastSnapshot = document.body.innerText;
          restoring = false;
        }, 0);
      }
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('img[src*="hajin-emblem-transparent.png"]')) return;
      const button = target.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";
      const aria = button.getAttribute("aria-label") || "";
      if (text === "뒤로" || aria.includes("뒤로") || button.querySelector('svg.lucide-chevron-left')) return;
      window.setTimeout(recordInternalNavigation, 50);
    };

    const applyAll = () => {
      applyWorkflowLabelsAndIcons();
      markLogosClickable();
    };

    document.addEventListener("click", handleLogoClick, true);
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handleBack);
    const observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    applyAll();

    return () => {
      document.removeEventListener("click", handleLogoClick, true);
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handleBack);
      observer.disconnect();
    };
  }, []);

  return null;
}
