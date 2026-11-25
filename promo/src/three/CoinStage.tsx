import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { useEffect, useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { Euler, NeutralToneMapping, Vector3 } from "three";
import { c, H, W } from "../theme";
import { clamp01, cue, ease, lerp, prog, pulse } from "../timing";
import { L, camera, coin, onBoard, toScreen, type Pt } from "../world";
import { RADIUS, coinGeometry, markRelief, roomEnvironment } from "./coin";

/*
 * The 3D layer: the pearl coin and its two orbs (teal for the protection fund, lilac for the OTC reserve), on a
 * transparent canvas that sits between the 2D layers. The camera looks straight down the z axis, so a point on the
 * z = 0 plane maps linearly to the screen and the coin can be placed in the same pixels as everything else.
 */

const FOV = 30;
const CAM_Z = 12;
/** world units per screen pixel on the z = 0 plane */
const UPP = (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * CAM_Z) / H;
const toUnits = (p: Pt): [number, number, number] => [(p.x - W / 2) * UPP, -(p.y - H / 2) * UPP, 0];

const ORBITS = [
  { tilt: new Euler(0.5, 0, 0.32), radius: 2.15, size: 0.18, phase: 0.9, speed: 0.95, color: c.shield, node: L.fee.shield, endAt: Math.PI - 0.8, endSpeed: 0.42 },
  { tilt: new Euler(-0.42, 0, -0.5), radius: 2.55, size: 0.14, phase: 3.6, speed: -0.72, color: c.desk, node: L.fee.reserve, endAt: 0.95, endSpeed: -0.5 },
] as const;

function Stage() {
  const frame = useCurrentFrame();
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(coinGeometry, []);
  const relief = useMemo(markRelief, []);
  const env = useMemo(() => roomEnvironment(gl), [gl]);
  useEffect(
    () => () => {
      geometry.dispose();
      relief.dispose();
      env.dispose();
    },
    [geometry, relief, env],
  );

  const cam = camera(frame);
  const state = coin(frame);
  const centre = toScreen(cam, state);
  const pxRadius = state.r * cam.zoom;
  const s = (pxRadius * UPP) / RADIUS;
  const position = toUnits(centre);
  const lit = state.light;
  const sec = frame / 30;

  // one pass of light across the face as the coin arrives
  const sweep = prog(frame, 10, 62, ease.inOut);
  const sweepPower = Math.sin(Math.PI * sweep) * 30;
  // a warm light from below while it climbs
  const thrust = state.thrust;
  // the coin brightens for a moment on the beats that land on it
  const flash = 1 + 0.35 * pulse(frame, cue.caught, 2, 16) + 0.3 * pulse(frame, cue.settle, 6, 24);

  // the orbs: in orbit for the open, out to the two ends of the fee split, away, then back in orbit for the end card
  const toNode = prog(frame, 86, 124, ease.inOut);
  const gone = prog(frame, 286, 300);
  const back = prog(frame, cue.orbsBack, cue.orbsBack + 40, ease.out);
  const ending = frame >= cue.orbsBack;
  const orbs = ORBITS.map((o, i) => {
    // on the end card each orb keeps to its own side of the coin, so both are in view while the card is read
    const angle = ending ? o.endAt + ((frame - cue.settle) / 30) * o.endSpeed : o.phase + sec * o.speed;
    const rel = new Vector3(o.radius, 0, 0).applyEuler(new Euler(0, angle, 0)).applyEuler(o.tilt).multiplyScalar(s);
    const orbit: [number, number, number] = [position[0] + rel.x, position[1] + rel.y, rel.z];
    const node = toUnits(toScreen(cam, onBoard("fee", o.node)));
    const nodeSize = (L.fee.orbR * cam.zoom * UPP) / 1; // radius in units
    const inOrbit = ending ? 1 : 1 - toNode;
    const bow = Math.sin(Math.PI * toNode) * (i === 0 ? -1.1 : 1.1);
    const p: [number, number, number] =
      ending ? orbit : [lerp(orbit[0], node[0], toNode) + bow * 0.4, lerp(orbit[1], node[1], toNode) + Math.abs(bow) * 0.5, lerp(orbit[2], node[2], toNode)];
    const size = ending ? o.size * s * back : lerp(o.size * s, nodeSize, toNode) * (1 - gone);
    const lands = pulse(frame, cue.streamLands, 3, 26);
    const breathe = inOrbit < 0.5 ? 0.06 * Math.sin(sec * 2.4 + i * 1.7) : 0;
    return { ...o, p, size: Math.max(0, size * (1 + 0.16 * lands + breathe)), glow: 0.2 + 0.75 * lands + (inOrbit < 0.5 ? 0.12 : 0) };
  });

  return (
    <>
      <hemisphereLight args={["#e6deff", "#f0bfd0", 0.34 * lit * flash]} />
      <directionalLight position={[-3, 5, 6]} intensity={0.75 * lit} color="#fffaf4" />
      <directionalLight position={[5, 2.5, -4]} intensity={2.6 * lit} color="#c8b2ff" />

      <group position={position} scale={s}>
        <pointLight position={[-2.7, 2.5, 3.1]} intensity={52 * s * s * lit * flash} color="#9f90ff" />
        <pointLight position={[2.6, -2.3, 3]} intensity={38 * s * s * lit * flash} color="#ffa67c" />
        <pointLight position={[lerp(-4.6, 4.6, sweep), lerp(1.9, 0.2, sweep), 2.4]} intensity={sweepPower * s * s} color="#f6f1ff" />
        <pointLight position={[0, -2.6, 1.2]} intensity={46 * thrust * s * s} color="#ffc19a" />
        <group rotation={[-0.2, 0, 0.1]}>
          <group rotation={[state.rotX, state.rotY, 0]} scale={[1 + (1 - state.squash) * 0.6, state.squash, 1]}>
            <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]}>
              <meshPhysicalMaterial
                color="#f3eef9"
                roughness={0.4}
                metalness={0.05}
                clearcoat={0.55}
                clearcoatRoughness={0.42}
                sheen={0.5}
                sheenColor="#ffc4e1"
                sheenRoughness={0.6}
                iridescence={0.85}
                iridescenceIOR={1.45}
                iridescenceThicknessMinimum={160}
                iridescenceThicknessMaximum={460}
                bumpMap={relief}
                bumpScale={7}
                envMap={env}
                envMapIntensity={0.5 * lit * flash}
              />
            </mesh>
          </group>
        </group>
      </group>

      {orbs.map((o, i) =>
        o.size > 0.0005 ? (
          <mesh key={i} position={o.p} scale={o.size}>
            <sphereGeometry args={[1, 48, 32]} />
            <meshStandardMaterial color={o.color} roughness={0.5} emissive={o.color} emissiveIntensity={o.glow * clamp01(lit * 1.4)} envMap={env} envMapIntensity={0.25 * lit} />
          </mesh>
        ) : null,
      )}
    </>
  );
}

export const CoinStage: React.FC = () => {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return (
    <ThreeCanvas
      width={W}
      height={H}
      dpr={dpr}
      camera={{ position: [0, 0, CAM_Z], fov: FOV, near: 1, far: 60 }}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      <Stage />
    </ThreeCanvas>
  );
};
