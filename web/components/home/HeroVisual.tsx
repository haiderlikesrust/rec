"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

// three.js stays out of the page's first load: the scene arrives in its own chunk, after the text is on screen
const CoinScene = dynamic(() => import("./CoinScene"), { ssr: false });

/** If the scene throws (a lost or refused graphics context), drop it and leave the still picture underneath. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function canDraw3d() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * The picture half of the intro. It holds its size from the first paint (the caller gives the height), shows a soft
 * still orb straight away, and swaps to the 3D coin once that has loaded and drawn a frame. Browsers without WebGL
 * keep the orb, and it comes back if the graphics context is ever lost. The scene stops drawing while the tab is
 * hidden or the picture is scrolled away, and holds a single frame for anyone who asks for reduced motion.
 */
export function HeroVisual({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(false);
  const [still, setStill] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabShown, setTabShown] = useState(true);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const drawn = ready && !lost;

  useEffect(() => {
    setSupported(canDraw3d());

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const readMotion = () => setStill(motion.matches);
    readMotion();
    motion.addEventListener("change", readMotion);

    const readTab = () => setTabShown(document.visibilityState === "visible");
    readTab();
    document.addEventListener("visibilitychange", readTab);

    const seen = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting));
    if (box.current) seen.observe(box.current);

    return () => {
      motion.removeEventListener("change", readMotion);
      document.removeEventListener("visibilitychange", readTab);
      seen.disconnect();
    };
  }, []);

  return (
    <div ref={box} aria-hidden className={clsx("relative w-full min-w-0 overflow-hidden", className)}>
      <div className={clsx("absolute inset-0 transition-opacity duration-700 ease-out", drawn ? "opacity-0" : "opacity-100")}>
        <div
          className="absolute top-[46%] left-1/2 aspect-square h-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle at 34% 28%, #f7f2ff 0%, #d9ccff 30%, #f3b2d8 64%, #ffc9a4 100%)" }}
        />
        <div
          className="absolute bottom-[8%] left-1/2 aspect-[5/1] h-[11%] -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgb(182 165 255 / 0.3), transparent)" }}
        />
      </div>
      {supported && !lost && (
        <Guard>
          <div className={clsx("absolute inset-0 transition-opacity duration-700 ease-out", drawn ? "opacity-100" : "opacity-0")}>
            <CoinScene animate={!still} active={onScreen && tabShown} onReady={() => setReady(true)} onLost={() => setLost(true)} />
          </div>
        </Guard>
      )}
    </div>
  );
}
