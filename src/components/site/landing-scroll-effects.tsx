"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const HERO_PARALLAX_DISTANCE = 26;
const TILT_MAX_DEGREES = 4.5;
const ANCHOR_SCROLL_DURATION_MS = 600;
const ANCHOR_SCROLL_OFFSET_PX = 88;

export function LandingScrollEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const siteRoot = document.querySelector<HTMLElement>(".coffee-site");
    if (!siteRoot) return;

    const header = siteRoot.querySelector<HTMLElement>(".site-header");
    const main = siteRoot.querySelector<HTMLElement>("main");
    const revealElements = Array.from(siteRoot.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shouldReduceMotion =
      reducedMotionQuery.matches && new URLSearchParams(window.location.search).has("unpublished");

    if (shouldReduceMotion) {
      siteRoot.dataset.reducedMotion = "true";
      siteRoot.style.setProperty("--scroll-progress", "0");
      for (const element of revealElements) {
        element.dataset.reveal = "visible";
      }
      return () => {
        delete siteRoot.dataset.reducedMotion;
      };
    }

    delete siteRoot.dataset.reducedMotion;

    const parallaxElements = Array.from(siteRoot.querySelectorAll<HTMLElement>("[data-parallax]"));
    let trackedRevealElements = revealElements;
    let frameId = 0;
    let initFrameId = 0;
    let revealObserver: IntersectionObserver | null = null;

    const syncScrollState = () => {
      frameId = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const progress = Math.min(1, Math.max(0, scrollY / maxScroll));

      siteRoot.style.setProperty("--scroll-progress", progress.toFixed(4));

      if (header) {
        if (scrollY > 24) {
          header.dataset.scrolled = "true";
        } else {
          delete header.dataset.scrolled;
        }
      }

      for (const element of trackedRevealElements) {
        if (element.dataset.reveal !== "ready") continue;
        const rect = element.getBoundingClientRect();
        if (rect.top < viewportHeight - 40 && rect.bottom > 0) {
          element.dataset.reveal = "visible";
        }
      }

      const viewportCenter = viewportHeight / 2;
      for (const element of parallaxElements) {
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const normalized = Math.max(
          -1,
          Math.min(1, (elementCenter - viewportCenter) / Math.max(1, viewportHeight)),
        );
        element.style.setProperty("--parallax-y", `${(normalized * -HERO_PARALLAX_DISTANCE).toFixed(2)}px`);
      }

      if (header) {
        const story = siteRoot.querySelector<HTMLElement>("#our-story");
        const visit = siteRoot.querySelector<HTMLElement>("#visit");
        const focusLine = viewportHeight * 0.45;
        let activeSection: string | undefined;

        if (visit && visit.getBoundingClientRect().top <= focusLine) {
          activeSection = "visit";
        } else if (story && story.getBoundingClientRect().top <= focusLine) {
          activeSection = "our-story";
        }

        if (activeSection) {
          header.dataset.activeSection = activeSection;
        } else {
          delete header.dataset.activeSection;
        }
      }
    };

    const scheduleSync = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(syncScrollState);
    };

    syncScrollState();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });

    const initRevealAndPageEnter = () => {
      initFrameId = 0;
      if (main) {
        delete main.dataset.pageEnter;
        void main.offsetWidth;
        main.dataset.pageEnter = "active";
      }

      trackedRevealElements = Array.from(siteRoot.querySelectorAll<HTMLElement>("[data-reveal]"));
      const initialHeight = window.innerHeight || document.documentElement.clientHeight;
      for (const element of trackedRevealElements) {
        if (element.dataset.reveal === "visible") continue;
        const rect = element.getBoundingClientRect();
        element.dataset.reveal = rect.top < initialHeight * 0.78 ? "visible" : "ready";
      }

      if (typeof IntersectionObserver !== "undefined") {
        revealObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const target = entry.target as HTMLElement;
              target.dataset.reveal = "visible";
              revealObserver?.unobserve(target);
            }
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );

        for (const element of trackedRevealElements) {
          if (element.dataset.reveal === "ready") {
            revealObserver.observe(element);
          }
        }
      }
    };

    initFrameId = window.requestAnimationFrame(initRevealAndPageEnter);

    const cleanupTilt: Array<() => void> = [];
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (finePointer.matches) {
      const tiltElements = Array.from(siteRoot.querySelectorAll<HTMLElement>("[data-interactive-tilt]"));
      for (const element of tiltElements) {
        const handleMove = (event: PointerEvent) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const relX = (event.clientX - rect.left) / rect.width - 0.5;
          const relY = (event.clientY - rect.top) / rect.height - 0.5;
          const rotateY = (relX * 2 * TILT_MAX_DEGREES).toFixed(2);
          const rotateX = (-relY * 2 * TILT_MAX_DEGREES).toFixed(2);
          element.style.setProperty("--tilt-x", `${rotateX}deg`);
          element.style.setProperty("--tilt-y", `${rotateY}deg`);
        };
        const handleLeave = () => {
          element.style.setProperty("--tilt-x", "0deg");
          element.style.setProperty("--tilt-y", "0deg");
        };
        element.addEventListener("pointermove", handleMove);
        element.addEventListener("pointerleave", handleLeave);
        cleanupTilt.push(() => {
          element.removeEventListener("pointermove", handleMove);
          element.removeEventListener("pointerleave", handleLeave);
        });
      }
    }

    let scrollAnimFrameId = 0;
    const cancelAnchorScroll = () => {
      if (scrollAnimFrameId !== 0) {
        window.cancelAnimationFrame(scrollAnimFrameId);
        scrollAnimFrameId = 0;
      }
    };

    const handleAnchorClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const href = link.getAttribute("href") ?? "";
      let targetId = "";
      if (href.startsWith("#") && href.length > 1) {
        targetId = href.slice(1);
      } else if (href.startsWith("/#") && href.length > 2 && window.location.pathname === "/") {
        targetId = href.slice(2);
      } else {
        return;
      }

      if (targetId === "public-main") return;
      const target = document.getElementById(targetId);
      if (!target) return;

      event.preventDefault();
      cancelAnchorScroll();

      const startY = window.scrollY || window.pageYOffset || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
      const destinationY = Math.max(
        0,
        Math.min(maxScroll, target.getBoundingClientRect().top + startY - ANCHOR_SCROLL_OFFSET_PX),
      );

      if (window.location.hash !== `#${targetId}`) {
        window.history.pushState(null, "", `#${targetId}`);
      }

      let startTime: number | null = null;
      const step = (now: number) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / ANCHOR_SCROLL_DURATION_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        window.scrollTo(0, startY + (destinationY - startY) * eased);
        if (t < 1) {
          scrollAnimFrameId = window.requestAnimationFrame(step);
        } else {
          scrollAnimFrameId = 0;
        }
      };

      scrollAnimFrameId = window.requestAnimationFrame(step);
    };

    siteRoot.addEventListener("click", handleAnchorClick);
    window.addEventListener("wheel", cancelAnchorScroll, { passive: true });
    window.addEventListener("touchstart", cancelAnchorScroll, { passive: true });

    return () => {
      if (initFrameId !== 0) window.cancelAnimationFrame(initFrameId);
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      cancelAnchorScroll();
      siteRoot.removeEventListener("click", handleAnchorClick);
      window.removeEventListener("wheel", cancelAnchorScroll);
      window.removeEventListener("touchstart", cancelAnchorScroll);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      revealObserver?.disconnect();
      for (const dispose of cleanupTilt) dispose();
      siteRoot.style.removeProperty("--scroll-progress");
      if (main) {
        delete main.dataset.pageEnter;
      }
      if (header) {
        delete header.dataset.scrolled;
        delete header.dataset.activeSection;
      }
    };
  }, [pathname]);

  return (
    <div className="site-scroll-progress" aria-hidden="true">
      <span />
    </div>
  );
}
