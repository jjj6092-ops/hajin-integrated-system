"use client";

import { useEffect } from "react";

export default function SaveGuardPatches() {
  useEffect(() => {
    const normalizeSavingButtons = () => {
      Array.from(document.querySelectorAll("button")).forEach((button) => {
        const text = button.textContent?.trim() || "";
        if (text.startsWith("저장 중...")) {
          button.dataset.hajinSavingGuard = "true";
          button.textContent = "저장 중...";
          button.setAttribute("aria-disabled", "true");
          button.style.pointerEvents = "none";
          button.style.opacity = "0.85";
        } else if (button.dataset.hajinSavingGuard === "true" && text === "수정 내용 저장") {
          delete button.dataset.hajinSavingGuard;
          button.removeAttribute("aria-disabled");
          button.style.pointerEvents = "";
          button.style.opacity = "";
        }
      });
    };

    const blockDuplicateSave = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";
      if (text.startsWith("저장 중...")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    const observer = new MutationObserver(normalizeSavingButtons);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", blockDuplicateSave, true);
    normalizeSavingButtons();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", blockDuplicateSave, true);
    };
  }, []);

  return null;
}
