"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type GalleryPhoto = { name: string; url: string };

export default function GlobalUiPatches() {
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

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

    const extractPhotoFolder = (signedUrl: string) => {
      try {
        const url = new URL(signedUrl, window.location.origin);
        const decoded = decodeURIComponent(url.pathname);
        const marker = "/as-job-photos/";
        const markerIndex = decoded.indexOf(marker);
        if (markerIndex < 0) return "";
        const storagePath = decoded.slice(markerIndex + marker.length);
        const slash = storagePath.lastIndexOf("/");
        if (slash <= 0) return "";
        return storagePath.slice(0, slash);
      } catch {
        return "";
      }
    };

    const openPhotoGallery = async (firstUrl: string) => {
      setGalleryOpen(true);
      setGalleryLoading(true);
      setGalleryIndex(0);
      setGalleryPhotos(firstUrl ? [{ name: "사진 1", url: firstUrl }] : []);

      const folder = extractPhotoFolder(firstUrl);
      if (!folder) {
        setGalleryLoading(false);
        return;
      }

      const { data, error } = await supabase.storage
        .from("as-job-photos")
        .list(folder, { limit: 50, sortBy: { column: "created_at", order: "asc" } });

      if (error) {
        setGalleryLoading(false);
        return;
      }

      const files = (data || []).filter((item) => item.name && item.name !== ".emptyFolderPlaceholder");
      const signed = await Promise.all(
        files.map(async (item) => {
          const path = `${folder}/${item.name}`;
          const { data: signedData } = await supabase.storage
            .from("as-job-photos")
            .createSignedUrl(path, 60 * 60);
          return signedData?.signedUrl ? { name: item.name, url: signedData.signedUrl } : null;
        }),
      );

      const photos = signed.filter((item): item is GalleryPhoto => Boolean(item?.url));
      if (photos.length) {
        setGalleryPhotos(photos);
        const firstIndex = photos.findIndex((photo) => {
          try {
            const a = new URL(photo.url, window.location.origin).pathname.split("/").pop();
            const b = new URL(firstUrl, window.location.origin).pathname.split("/").pop();
            return a === b;
          } catch {
            return false;
          }
        });
        setGalleryIndex(firstIndex >= 0 ? firstIndex : 0);
      }
      setGalleryLoading(false);
    };

    const handlePhotoClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const photoButton = target.closest('button[aria-label="접수사진 보기"]');
      if (!photoButton) return;
      const container = photoButton.parentElement;
      const image = container?.querySelector("img") as HTMLImageElement | null;
      if (!image?.src) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openPhotoGallery(image.src);
    };

    // The app changes screens with React state instead of URL routes.
    // Keep a real stack of the in-app back buttons that existed before each screen change.
    const navigationStack: Array<() => void> = [];
    let pendingBackAction: (() => void) | null = null;
    let beforeClickSnapshot = document.body.innerText;
    let restoring = false;

    const findVisibleBackButton = () => {
      return Array.from(document.querySelectorAll("button")).find((button) => {
        const text = button.textContent?.trim() || "";
        const aria = button.getAttribute("aria-label") || "";
        const isBack = text === "뒤로" || aria.includes("뒤로") || Boolean(button.querySelector("svg.lucide-chevron-left"));
        if (!isBack) return false;
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) as HTMLButtonElement | undefined;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (restoring) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('img[src*="hajin-emblem-transparent.png"]')) return;

      const button = target.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";
      const aria = button.getAttribute("aria-label") || "";
      if (text === "뒤로" || aria.includes("뒤로") || button.querySelector('svg.lucide-chevron-left')) return;

      beforeClickSnapshot = document.body.innerText;
      const currentBack = findVisibleBackButton();
      pendingBackAction = currentBack ? () => currentBack.click() : () => window.location.assign("/");

      window.setTimeout(() => {
        if (restoring || !pendingBackAction) return;
        const changed = document.body.innerText !== beforeClickSnapshot;
        if (!changed) {
          pendingBackAction = null;
          return;
        }
        navigationStack.push(pendingBackAction);
        pendingBackAction = null;
        window.history.pushState({ hajinInternal: true, depth: navigationStack.length }, "", window.location.href);
      }, 80);
    };

    const handleBack = () => {
      const action = navigationStack.pop();
      if (!action) return;
      restoring = true;
      window.setTimeout(() => {
        action();
        window.setTimeout(() => {
          restoring = false;
        }, 100);
      }, 0);
    };

    const applyAll = () => {
      applyWorkflowLabelsAndIcons();
      markLogosClickable();
    };

    document.addEventListener("click", handlePhotoClick, true);
    document.addEventListener("click", handleLogoClick, true);
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handleBack);
    const observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    applyAll();

    return () => {
      document.removeEventListener("click", handlePhotoClick, true);
      document.removeEventListener("click", handleLogoClick, true);
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handleBack);
      observer.disconnect();
    };
  }, []);

  const previousPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setGalleryIndex((index) => (index - 1 + galleryPhotos.length) % galleryPhotos.length);
  };

  const nextPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setGalleryIndex((index) => (index + 1) % galleryPhotos.length);
  };

  return (
    <>
      {galleryOpen && (
        <div
          className="fixed inset-0 z-[10000] flex flex-col bg-black text-white"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current == null) return;
            const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
            const distance = endX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(distance) < 45) return;
            if (distance > 0) previousPhoto();
            else nextPhoto();
          }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <button
              type="button"
              onClick={() => setGalleryOpen(false)}
              className="grid size-10 place-items-center rounded-full bg-white/10 text-3xl leading-none"
              aria-label="사진 닫기"
            >
              ×
            </button>
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-black">
              {galleryLoading ? "불러오는 중" : `${galleryIndex + 1} / ${Math.max(galleryPhotos.length, 1)}`}
            </div>
            <div className="size-10" />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-6">
            {galleryPhotos[galleryIndex]?.url ? (
              <img
                src={galleryPhotos[galleryIndex].url}
                alt={`작업사진 ${galleryIndex + 1}`}
                className="max-h-full max-w-full select-none object-contain"
                draggable={false}
              />
            ) : (
              <div className="text-sm font-bold text-white/70">사진을 불러오는 중입니다.</div>
            )}

            {galleryPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={previousPhoto}
                  className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-3xl font-light backdrop-blur"
                  aria-label="이전 사진"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-3xl font-light backdrop-blur"
                  aria-label="다음 사진"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {galleryPhotos.length > 1 && (
            <div className="shrink-0 px-5 pb-[max(18px,env(safe-area-inset-bottom))] text-center text-xs font-bold text-white/60">
              좌우로 밀어서 사진을 넘길 수 있습니다.
            </div>
          )}
        </div>
      )}
    </>
  );
}
