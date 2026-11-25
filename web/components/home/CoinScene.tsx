"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  type Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  NeutralToneMapping,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from "three";

/*
 * The picture beside the home page's headline: one pearl coin, floating and swinging slowly, with two small spheres
 * circling it. The teal one is the protection fund and the lilac one the OTC reserve: the fee, going round and
 * coming back. Nothing here is interactive beyond a slight lean towards the pointer.
 *
 * This file pulls in three.js, so it is only ever loaded through the dynamic import in HeroVisual.
 */

export type CoinSceneProps = {
  /** false holds one still frame (reduced motion) */
  animate: boolean;
  /** false stops drawing altogether (tab hidden, scrolled out of view) */
  active: boolean;
  /** called once, when the first frame is about to be drawn */
  onReady: () => void;
  /** called if the browser takes the graphics context away */
  onLost: () => void;
};

/** Where scene time stands in the still frame: the coin a little turned, both spheres in front and clear of it. */
const STILL = 118.2;

const RADIUS = 1.5;

/** The piece sits a little above the middle of the picture, which leaves room under it for the glow. */
const LIFT = 0.25;

/** A CSS colour (a design token, whatever notation it is written in) as plain sRGB, or the fallback. */
function cssColor(variable: string, fallback: string) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!value || !ctx) return fallback;
    ctx.fillStyle = fallback;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return fallback;
  }
}

/**
 * The coin's outline from its centre to its edge, spun into a solid: a gently domed face, a shallow groove, a raised
 * rim, and an edge rounded almost into a half circle. The same outline, mirrored, is the other side. Its texture
 * coordinates are laid flat across the face, so an image maps onto it like a stamp.
 */
function coinGeometry() {
  const half = 0.23;
  const bevel = 0.2;
  const rim = 0.16;
  const recess = 0.06;
  const dome = 0.085;
  const slope = 0.12;

  const inner = RADIUS - bevel - rim;
  const face = inner - slope;
  const up: Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = (face * i) / 10;
    up.push(new Vector2(x, half - recess + dome * (1 - (x / face) ** 2)));
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    up.push(new Vector2(face + slope * t, half - recess + recess * t * t * (3 - 2 * t)));
  }
  up.push(new Vector2(RADIUS - bevel - rim / 2, half));
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    up.push(new Vector2(RADIUS - bevel + Math.sin(a) * bevel, half - bevel + Math.cos(a) * bevel));
  }

  const outline = [...up.map((p) => new Vector2(p.x, -p.y)), ...up.slice().reverse()];
  const geometry = new LatheGeometry(outline, 128);
  const at = geometry.attributes.position!;
  const uv: number[] = [];
  for (let i = 0; i < at.count; i++) uv.push(0.5 + at.getX(i) / (2 * RADIUS), 0.5 - at.getZ(i) / (2 * RADIUS));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
}

/**
 * The brand mark as a height map for the coin's face, read from the site icon so the two can't drift apart: the
 * icon's own background is level ground and whatever is drawn on it stands proud. No icon, or one that can't be
 * read, simply leaves the face plain.
 */
async function markRelief() {
  const href = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
  if (!href) return null;
  const image = new Image();
  image.src = href;
  await image.decode();

  const size = 512;
  const side = Math.round(size * 0.5);
  const start = (size - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, start, start, side, side);

  const pixels = ctx.getImageData(0, 0, size, size);
  const d = pixels.data;
  const light = (i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  const ground = light((Math.round(size / 2) * size + Math.round(start + side * 0.06)) * 4);
  let found = false;
  for (let i = 0; i < d.length; i += 4) {
    const height = Math.min(1, Math.abs(light(i) - ground) / 150) * (d[i + 3]! / 255);
    if (height > 0.5) found = true;
    d[i] = d[i + 1] = d[i + 2] = Math.round(height * 255);
    d[i + 3] = 255;
  }
  if (!found) return null;
  ctx.putImageData(pixels, 0, 0);

  // soften the edges so the mark reads as pressed into the coin, not cut out of it
  const soft = document.createElement("canvas");
  soft.width = soft.height = size;
  const softCtx = soft.getContext("2d");
  if (!softCtx) return null;
  softCtx.fillStyle = "#000";
  softCtx.fillRect(0, 0, size, size);
  softCtx.filter = "blur(4px)";
  softCtx.drawImage(canvas, 0, 0);
  return new CanvasTexture(soft);
}

/** A round, soft-edged spot of light for the glow under the coin. */
function glowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(0.7, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * What the coin reflects: a room that fades from lavender overhead through pale pink to peach underfoot, with two
 * soft white panels for highlights. It is drawn once into a blurred environment map; nothing of it is seen directly.
 */
function Surroundings() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const room = new Scene();
    const made: { dispose: () => void }[] = [];

    const sky = new SphereGeometry(8, 48, 24);
    const top = new Color("#b3a6ff");
    const mid = new Color("#f3c4dd");
    const low = new Color("#f7a983");
    const c = new Color();
    const colors: number[] = [];
    const y = sky.attributes.position!;
    for (let i = 0; i < y.count; i++) {
      const h = y.getY(i) / 8;
      c.copy(mid).lerp(h >= 0 ? top : low, Math.abs(h));
      colors.push(c.r, c.g, c.b);
    }
    sky.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const skyMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
    room.add(new Mesh(sky, skyMaterial));
    made.push(sky, skyMaterial);

    const box = new BoxGeometry(1, 1, 1);
    made.push(box);
    const panel = (position: [number, number, number], scale: [number, number, number], power: number) => {
      const material = new MeshBasicMaterial({ color: new Color(power, power, power) });
      const mesh = new Mesh(box, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      room.add(mesh);
      made.push(material);
    };
    panel([-3.5, 5, 3.5], [5, 0.2, 5], 5);
    panel([5.5, 0.5, 2.5], [0.2, 5, 3], 2.5);

    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(room, 0.06);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.4;
    invalidate();

    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      for (const m of made) m.dispose();
    };
  }, [gl, scene, invalidate]);

  return null;
}

function Model({ animate, active, onReady }: Pick<CoinSceneProps, "animate" | "active" | "onReady">) {
  const rig = useRef<Group>(null);
  const float = useRef<Group>(null);
  const turn = useRef<Group>(null);
  const first = useRef<Group>(null);
  const second = useRef<Group>(null);
  const pearl = useRef<MeshPhysicalMaterial>(null);
  const time = useRef(animate ? 0 : STILL);
  const lean = useRef({ x: 0, y: 0 });
  const started = useRef(false);
  const invalidate = useThree((s) => s.invalidate);

  const coin = useMemo(coinGeometry, []);
  const glow = useMemo(glowTexture, []);
  const tone = useMemo(() => ({ shield: cssColor("--shield", "#6fd3e0"), desk: cssColor("--desk", "#b7a6ff") }), []);
  useEffect(
    () => () => {
      coin.dispose();
      glow.dispose();
    },
    [coin, glow],
  );

  // the mark is pressed into the face once the site icon has been read; until then, and without it, the face is plain
  useEffect(() => {
    let gone = false;
    let relief: CanvasTexture | null = null;
    markRelief().then(
      (texture) => {
        if (!texture) return;
        if (gone || !pearl.current) return texture.dispose();
        relief = texture;
        pearl.current.bumpMap = texture;
        pearl.current.bumpScale = 5;
        pearl.current.needsUpdate = true;
        invalidate();
      },
      () => {},
    );
    return () => {
      gone = true;
      relief?.dispose();
    };
  }, [invalidate]);

  // a mouse leans the whole piece a few degrees towards itself; touch screens and reduced motion leave it level
  useEffect(() => {
    if (!animate || !window.matchMedia("(pointer: fine)").matches) {
      lean.current = { x: 0, y: 0 };
      return;
    }
    const move = (e: PointerEvent) => {
      lean.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [animate]);

  // the still frame is a pose of its own: draw it when motion is switched off, and when the picture comes into view
  useEffect(() => {
    if (!animate) time.current = STILL;
    invalidate();
  }, [animate, active, invalidate]);

  useFrame((_, delta) => {
    if (!started.current) {
      started.current = true;
      onReady();
    }
    // a long gap (the tab was away) must not fling everything forward
    if (animate) time.current += Math.min(delta, 0.05);
    const t = time.current;
    // the coin never shows its bare edge: it swings a little way to each side and nods as it goes
    if (turn.current) {
      turn.current.rotation.y = Math.sin(t * 0.5) * 0.62;
      turn.current.rotation.x = Math.sin(t * 0.37 + 1) * 0.1;
    }
    if (float.current) float.current.position.y = Math.sin(t * 0.85) * 0.07;
    if (first.current) first.current.rotation.y = 0.9 + t * 0.52;
    if (second.current) second.current.rotation.y = 3.6 - t * 0.37;
    if (rig.current) {
      const ease = animate ? Math.min(1, delta * 2.5) : 1;
      rig.current.rotation.y += (lean.current.x * 0.22 - rig.current.rotation.y) * ease;
      rig.current.rotation.x += (lean.current.y * 0.12 - rig.current.rotation.x) * ease;
    }
  });

  return (
    <group ref={rig} position={[0, LIFT, 0]}>
      <group ref={float}>
        <group rotation={[-0.2, 0, 0.1]}>
          <group ref={turn}>
            <mesh geometry={coin} rotation={[Math.PI / 2, 0, 0]}>
              <meshPhysicalMaterial
                ref={pearl}
                color="#f3eef9"
                roughness={0.4}
                metalness={0.05}
                clearcoat={0.55}
                clearcoatRoughness={0.5}
                sheen={0.5}
                sheenColor="#ffc4e1"
                sheenRoughness={0.6}
                iridescence={0.85}
                iridescenceIOR={1.45}
                iridescenceThicknessMaximum={460}
              />
            </mesh>
          </group>
        </group>
      </group>

      <group rotation={[0.5, 0, 0.32]}>
        <group ref={first}>
          <mesh position={[2.15, 0, 0]}>
            <sphereGeometry args={[0.18, 32, 24]} />
            <meshStandardMaterial color={tone.shield} roughness={0.55} emissive={tone.shield} emissiveIntensity={0.18} />
          </mesh>
        </group>
      </group>
      <group rotation={[-0.42, 0, -0.5]}>
        <group ref={second}>
          <mesh position={[2.55, 0, 0]}>
            <sphereGeometry args={[0.14, 32, 24]} />
            <meshStandardMaterial color={tone.desk} roughness={0.55} emissive={tone.desk} emissiveIntensity={0.18} />
          </mesh>
        </group>
      </group>

      <mesh position={[0, -2.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial map={glow} color="#b6a5ff" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function CoinScene({ animate, active, onReady, onLost }: CoinSceneProps) {
  return (
    <Canvas
      frameloop={!active ? "never" : animate ? "always" : "demand"}
      dpr={[1, 2]}
      camera={{ position: [0, 0.9, 9.7], fov: 30, near: 1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "default", toneMapping: NeutralToneMapping }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onLost, { once: true })}
    >
      <Surroundings />
      <hemisphereLight args={["#ebe4ff", "#ecc3d6", 0.6]} />
      <pointLight position={[-2.7, 2.5, 3.1]} intensity={30} color="#a99bff" />
      <pointLight position={[2.6, -2.3, 3]} intensity={21} color="#ffae85" />
      <directionalLight position={[-3, 5, 6]} intensity={1} color="#fffaf4" />
      <directionalLight position={[5, 2.5, -4]} intensity={2} color="#c8b2ff" />
      <Model animate={animate} active={active} onReady={onReady} />
    </Canvas>
  );
}
