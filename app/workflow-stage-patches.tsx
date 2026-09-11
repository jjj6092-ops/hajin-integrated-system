"use client";

import { useEffect } from "react";

export default function WorkflowStagePatches() {
  useEffect(() => {
    let advancing = false;

    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const findStageHeading = () =>
      Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "접수" && visible(node as HTMLElement),
      ) as HTMLElement | undefined;

    const markDispatchActions = () => {
      const heading = findStageHeading();
      if (!heading) return;

      const root = heading.parentElement?.parentElement?.parentElement || document.body;
      Array.from(root.querySelectorAll("span")).forEach((span) => {
        if (span.textContent?.trim() !== "출동") return;
        const element = span as HTMLElement;
        if (!visible(element)) return;
        element.style.cursor = "pointer";
        element.style.touchAction = "manipulation";
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", "출동 단계로 이동");
        element.dataset.hajinWorkflowDispatch = "true";
      });
    };

    const waitForDetailDispatch = () => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        const detailTitle = Array.from(document.querySelectorAll("h2")).find(
          (node) => node.textContent?.trim() === "A/S 접수 수정" && visible(node as HTMLElement),
        );
        if (detailTitle) {
          const dispatchButton = Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "출동" && visible(button),
          ) as HTMLButtonElement | undefined;
          if (dispatchButton && !dispatchButton.disabled) {
            window.clearInterval(timer);
            dispatchButton.click();
            advancing = false;
            return;
          }
        }
        if (attempts >= 40) {
          window.clearInterval(timer);
          advancing = false;
          window.alert("출동 단계 이동 화면을 찾지 못했습니다. 접수 상세에서 출동 버튼을 눌러주세요.");
        }
      }, 100);
    };

    const advanceDispatch = (target: Element) => {
      if (advancing) return;
      const action = target.closest('[data-hajin-workflow-dispatch="true"]') as HTMLElement | null;
      if (!action) return;

      const card = action.closest("div.relative.w-full") || action.closest("div.rounded-2xl");
      if (!card) return;

      const openButton = Array.from(card.querySelectorAll("button")).find((button) => {
        const text = button.textContent || "";
        return text.includes("출동장소") && text.includes("고장원인");
      }) as HTMLButtonElement | undefined;

      if (!openButton) {
        window.alert("접수 상세 열기 버튼을 찾지 못했습니다.");
        return;
      }

      advancing = true;
      openButton.click();
      waitForDetailDispatch();
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest('[data-hajin-workflow-dispatch="true"]');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      advanceDispatch(action);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest('[data-hajin-workflow-dispatch="true"]');
      if (!action) return;
      event.preventDefault();
      advanceDispatch(action);
    };

    const observer = new MutationObserver(markDispatchActions);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    markDispatchActions();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
