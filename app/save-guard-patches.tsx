"use client";

import { useEffect } from "react";

export default function SaveGuardPatches() {
  useEffect(() => {
    const savingSince = new WeakMap<HTMLButtonElement, number>();

    const normalizeSavingButtons = () => {
      Array.from(document.querySelectorAll("button")).forEach((button) => {
        const text = button.textContent?.trim() || "";
        if (text.startsWith("저장 중...")) {
          if (!savingSince.has(button)) savingSince.set(button, Date.now());
          button.dataset.hajinSavingGuard = "true";
          button.removeAttribute("aria-disabled");
          button.style.pointerEvents = "auto";
          button.style.opacity = "1";
          button.title = "저장이 오래 걸리면 다시 눌러 잠금을 해제할 수 있습니다.";

          const started = savingSince.get(button) || Date.now();
          if (Date.now() - started > 15000) {
            button.textContent = "수정 내용 저장";
            button.dataset.hajinSavingRecovered = "true";
            delete button.dataset.hajinSavingGuard;
            savingSince.delete(button);
          }
        } else if (button.dataset.hajinSavingGuard === "true") {
          delete button.dataset.hajinSavingGuard;
          savingSince.delete(button);
          button.removeAttribute("aria-disabled");
          button.style.pointerEvents = "";
          button.style.opacity = "";
          button.removeAttribute("title");
        }
      });
    };

    const recoverStuckSave = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button") as HTMLButtonElement | null;
      if (!button) return;
      const text = button.textContent?.trim() || "";
      if (!text.startsWith("저장 중...")) return;

      const started = savingSince.get(button) || Date.now();
      if (Date.now() - started < 3000) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      button.textContent = "수정 내용 저장";
      button.dataset.hajinSavingRecovered = "true";
      savingSince.delete(button);
      window.alert("저장 요청이 지연되어 버튼 잠금을 해제했습니다. 다시 저장을 눌러주세요.");
    };

    const observer = new MutationObserver(normalizeSavingButtons);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", recoverStuckSave, true);
    const timer = window.setInterval(normalizeSavingButtons, 1000);
    normalizeSavingButtons();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", recoverStuckSave, true);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
