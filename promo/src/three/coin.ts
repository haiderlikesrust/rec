import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector2,
  type Texture,
  type WebGLRenderer,
} from "three";
import { logo } from "../data";

/*
 * The coin from the site's home page (web/components/home/CoinScene.tsx), rebuilt for the film: the same lathe
 * outline, the same pearl material and the same lavender → pink → peach room for it to reflect. Nothing here loads
 * a file: the relief on the face is drawn from the logo paths, so a frame never has to wait for an asset.
 */

export const RADIUS = 1.5;

/**
 * The coin's outline from its centre to its edge, spun into a solid: a gently domed face, a shallow groove, a raised
 * rim, and an edge rounded almost into a half circle. Texture coordinates are laid flat across each face, and
 * mirrored on the back so the mark reads the right way round on both sides.
 */
export function coinGeometry() {
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
  const geometry = new LatheGeometry(outline, 160);
  const at = geometry.attributes.position!;
  const uv: number[] = [];
  for (let i = 0; i < at.count; i++) {
    const back = at.getY(i) < 0;
    uv.push(0.5 + ((back ? -1 : 1) * at.getX(i)) / (2 * RADIUS), 0.5 - at.getZ(i) / (2 * RADIUS));
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
}

/** The brand mark as a height map for the coin's face: the strokes stand proud, softened so they read as pressed in. */
export function markRelief() {
  const size = 1024;
  const side = size * 0.5;
  const start = (size - side) / 2;
  const scale = side / logo.viewBox;

  const sharp = document.createElement("canvas");
  sharp.width = sharp.height = size;
  const ctx = sharp.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  // the site icon nudges the mark left by 1.25 units to centre it optically (web/app/icon.svg)
  ctx.setTransform(scale, 0, 0, scale, start - 1.25 * scale, start);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of logo.paths) {
    ctx.lineWidth = p.strokeWidth;
    ctx.stroke(new Path2D(p.d));
  }

  const soft = document.createElement("canvas");
  soft.width = soft.height = size;
  const softCtx = soft.getContext("2d")!;
  softCtx.fillStyle = "#000";
  softCtx.fillRect(0, 0, size, size);
  softCtx.filter = "blur(8px)";
  softCtx.drawImage(sharp, 0, 0);
  const texture = new CanvasTexture(soft);
  texture.anisotropy = 8;
  return texture;
}

/**
 * What the coin reflects: a room that fades from lavender overhead through pale pink to peach underfoot, with two
 * soft white panels for highlights. It is drawn once into a blurred environment map; nothing of it is seen directly.
 */
export function roomEnvironment(gl: WebGLRenderer): Texture {
  const room = new Scene();
  const made: { dispose: () => void }[] = [];

  const sky = new SphereGeometry(8, 48, 24);
  const top = new Color("#b3a6ff");
  const mid = new Color("#f3c4dd");
  const low = new Color("#f7a983");
  const tint = new Color();
  const colors: number[] = [];
  const y = sky.attributes.position!;
  for (let i = 0; i < y.count; i++) {
    const h = y.getY(i) / 8;
    tint.copy(mid).lerp(h >= 0 ? top : low, Math.abs(h));
    colors.push(tint.r, tint.g, tint.b);
  }
  sky.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const skyMaterial = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  room.add(new Mesh(sky, skyMaterial));
  made.push(sky, skyMaterial);

  const box = new BoxGeometry(1, 1, 1);
  made.push(box);
  const panel = (position: [number, number, number], size: [number, number, number], power: number) => {
    const material = new MeshBasicMaterial({ color: new Color(power, power, power) });
    const mesh = new Mesh(box, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    room.add(mesh);
    made.push(material);
  };
  panel([-3.5, 5, 3.5], [5, 0.2, 5], 5);
  panel([5.5, 0.5, 2.5], [0.2, 5, 3], 2.5);

  const pmrem = new PMREMGenerator(gl);
  const target = pmrem.fromScene(room, 0.06);
  pmrem.dispose();
  for (const m of made) m.dispose();
  return target.texture;
}
