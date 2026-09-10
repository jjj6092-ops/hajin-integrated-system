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

    const applyAll = () => {
      applyWorkflowLabelsAndIcons();
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
