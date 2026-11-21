import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';

/* =====================================================================
   1. EDIT HERE
   ===================================================================== */

export const FPS = 30;
export const DURATION = 1200; // 40 seconds at 30 fps

// Put your CapCut voiceover in /public and write its name here, e.g. 'voice.mp3'
const VOICEOVER: string | null = null;

type Vec3 = [number, number, number];
type Focus = 'none' | 'left' | 'right' | 'both';

type Beat = {
  text: string; // caption on screen (replace with your approved script lines)
  cam: Vec3; // camera position: [right, up, forward] relative to the wheelset
  look: Vec3; // camera target:   [right, up, forward] relative to the wheelset
  focus: Focus; // which wheel glows amber
  label?: string; // small tag at the top
};

// One beat per script line. Change only the `text` to match your script.
// Keep 12 beats (or edit the camera/focus values if you change the count).
export const BEATS: Beat[] = [
  {
    text: 'Trains turn without any steering.',
    cam: [6, 3.4, -9],
    look: [0, 0.9, 0],
    focus: 'none',
  },
  {
    text: 'No steering wheel. Nothing turns the wheels.',
    cam: [5, 2.8, -7],
    look: [0, 0.9, 0],
    focus: 'none',
  },
  {
    text: 'The secret is in the wheels.',
    cam: [3.5, 1.6, -5.5],
    look: [0, 0.8, 0],
    focus: 'none',
  },
  {
    text: 'Train wheels are not flat. They are cone-shaped.',
    cam: [0, 1.3, -6.5],
    look: [0, 0.9, 0],
    focus: 'both',
    label: 'Cone-shaped wheels',
  },
  {
    text: 'Both wheels are fixed on one solid axle.',
    cam: [2.8, 1.2, -5],
    look: [0, 0.8, 0],
    focus: 'none',
    label: 'One solid axle',
  },
  {
    text: 'On a straight track, both wheels sit centered.',
    cam: [0, 1.6, -7],
    look: [0, 0.6, 0],
    focus: 'none',
  },
  {
    text: 'So both wheels roll the same distance.',
    cam: [0, 2.4, -6],
    look: [0, 0.5, 0],
    focus: 'none',
    label: 'Same distance',
  },
  {
    text: 'On a curve, the train slides slightly outward.',
    cam: [0, 2.2, -7.5],
    look: [0, 0.6, 3],
    focus: 'none',
  },
  {
    text: 'The outer wheel rides on the wide part of the cone.',
    cam: [-2.6, 1.0, -4.2],
    look: [-1.5, 0.5, 0],
    focus: 'left',
    label: 'Outer wheel · wide side',
  },
  {
    text: 'The inner wheel rides on the narrow part.',
    cam: [2.6, 1.0, -4.2],
    look: [1.5, 0.5, 0],
    focus: 'right',
    label: 'Inner wheel · narrow side',
  },
  {
    text: 'The wide wheel travels farther in every turn.',
    cam: [0, 6.5, -3.5],
    look: [0, 0, 1.5],
    focus: 'left',
    label: 'Wide = farther',
  },
  {
    text: 'That small difference steers the train along the curve.',
    cam: [7, 4, -10],
    look: [0, 0.6, 3],
    focus: 'none',
  },
];

// Beat index (0-based) where the curve begins. 7 = line 8.
const CURVE_BEAT = 7;

// Colors
const BG = '#0b1220';
const GROUND = '#111a2b';
const WHEEL_BASE = '#e6e1d3';
const WHEEL_AMBER = '#f0b24a';
const SPOKE = '#3b4252';
const RAIL = '#9aa5b5';
const SLEEPER = '#4a4036';
const TEXT = '#f3efe4';

/* =====================================================================
   2. GEOMETRY / MOTION CONSTANTS
   ===================================================================== */

const SEG = DURATION / BEATS.length; // frames per beat (100)
const SPEED = 0.06; // world units per frame
const CURVE_RADIUS = 35;
const GAUGE = 2.8; // distance between rails
const WHEEL_W = 0.6;
const R_BIG = 0.9; // radius on the inner (flange) side
const R_SMALL = 0.6; // radius on the outer side
const R_MID = (R_BIG + R_SMALL) / 2;
const TAPER = (R_BIG - R_SMALL) / WHEEL_W;
const RAIL_TOP = 0.24;
const SHIFT = 0.15; // how far the wheelset slides outward on the curve

const CURVE_FRAME = CURVE_BEAT * SEG;
const L = SPEED * CURVE_FRAME; // straight track length before the curve

// Track centre line. Train travels along -Z, then curves to the right (+X).
const theta = (s: number) => (s <= L ? 0 : (s - L) / CURVE_RADIUS);

const pathPoint = (s: number, offset = 0): Vec3 => {
  if (s <= L) {
    return [offset, 0, -s];
  }
  const th = (s - L) / CURVE_RADIUS;
  const cx = CURVE_RADIUS * (1 - Math.cos(th));
  const cz = -L - CURVE_RADIUS * Math.sin(th);
  return [cx + offset * Math.cos(th), 0, cz + offset * Math.sin(th)];
};

const SLEEPER_S: number[] = [];
for (let s = -30; s <= 130; s += 1.0) SLEEPER_S.push(s);

/* =====================================================================
   3. 3D PARTS
   ===================================================================== */

const CameraRig: React.FC<{pos: Vec3; look: Vec3}> = ({pos, look}) => {
  const {camera} = useThree();
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
  camera.updateMatrixWorld();
  return null;
};

const Ground: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
    <planeGeometry args={[600, 600]} />
    <meshStandardMaterial color={GROUND} roughness={1} />
  </mesh>
);

const Track: React.FC = () => {
  const geos = useMemo(() => {
    const make = (offset: number) => {
      const pts: THREE.Vector3[] = [];
      for (let s = -30; s <= 130; s += 1) {
        const p = pathPoint(s, offset);
        pts.push(new THREE.Vector3(p[0], 0.17, p[2]));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      return new THREE.TubeGeometry(curve, 400, 0.07, 10, false);
    };
    return {left: make(-GAUGE / 2), right: make(GAUGE / 2)};
  }, []);

  return (
    <group>
      <mesh geometry={geos.left}>
        <meshStandardMaterial color={RAIL} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh geometry={geos.right}>
        <meshStandardMaterial color={RAIL} metalness={0.6} roughness={0.35} />
      </mesh>
      {SLEEPER_S.map((s) => {
        const p = pathPoint(s, 0);
        return (
          <mesh
            key={s}
            position={[p[0], 0.05, p[2]]}
            rotation={[0, -theta(s), 0]}
          >
            <boxGeometry args={[3.6, 0.1, 0.28]} />
            <meshStandardMaterial color={SLEEPER} roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
};

// inner = +1 means the wide (flange) side of the cone points to +X, -1 to -X
const Wheel: React.FC<{x: number; inner: 1 | -1; color: THREE.Color}> = ({
  x,
  inner,
  color,
}) => (
  <group position={[x, 0, 0]}>
    <mesh rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry
        args={[
          inner === 1 ? R_BIG : R_SMALL,
          inner === 1 ? R_SMALL : R_BIG,
          WHEEL_W,
          64,
        ]}
      />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
    </mesh>
    {/* flange on the inner side */}
    <mesh
      position={[inner * (WHEEL_W / 2 - 0.04), 0, 0]}
      rotation={[0, 0, -Math.PI / 2]}
    >
      <cylinderGeometry args={[R_BIG + 0.07, R_BIG + 0.07, 0.08, 64]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
    </mesh>
    {/* two thin bars so you can see the wheel spinning */}
    <mesh>
      <boxGeometry args={[WHEEL_W + 0.02, 0.07, 1.1]} />
      <meshStandardMaterial color={SPOKE} roughness={0.6} />
    </mesh>
    <mesh>
      <boxGeometry args={[WHEEL_W + 0.02, 1.1, 0.07]} />
      <meshStandardMaterial color={SPOKE} roughness={0.6} />
    </mesh>
  </group>
);

const Wheelset: React.FC<{
  s: number;
  d: number;
  th: number;
  fl: number;
  fr: number;
}> = ({s, d, th, fl, fr}) => {
  const p = pathPoint(s, 0);
  // contact radius on each wheel (outer = left wheel on a right-hand curve)
  const rL = R_MID + TAPER * d;
  const rR = R_MID - TAPER * d;
  const y = RAIL_TOP + (rL + rR) / 2;
  const psi = Math.atan((rR - rL) / GAUGE);

  const pos: Vec3 = [p[0] - d * Math.cos(th), y, p[2] - d * Math.sin(th)];
  const rot = new THREE.Euler(0, -th, psi, 'YXZ');

  const base = new THREE.Color(WHEEL_BASE);
  const amber = new THREE.Color(WHEEL_AMBER);
  const colL = base.clone().lerp(amber, fl);
  const colR = base.clone().lerp(amber, fr);

  return (
    <group position={pos} rotation={rot}>
      <group rotation={[-s / R_MID, 0, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, GAUGE, 24]} />
          <meshStandardMaterial color="#c9ced8" metalness={0.7} roughness={0.3} />
        </mesh>
        <Wheel x={-GAUGE / 2} inner={1} color={colL} />
        <Wheel x={GAUGE / 2} inner={-1} color={colR} />
      </group>
    </group>
  );
};

type SceneProps = {
  s: number;
  d: number;
  th: number;
  fl: number;
  fr: number;
  cam: Vec3;
  look: Vec3;
};

const Scene: React.FC<SceneProps> = ({s, d, th, fl, fr, cam, look}) => (
  <>
    <color attach="background" args={[BG]} />
    <fog attach="fog" args={[BG, 25, 80]} />
    <ambientLight intensity={1.1} />
    <directionalLight position={[10, 16, 8]} intensity={2.4} />
    <CameraRig pos={cam} look={look} />
    <Ground />
    <Track />
    <Wheelset s={s} d={d} th={th} fl={fl} fr={fr} />
  </>
);

/* =====================================================================
   4. ANIMATION HELPERS
   ===================================================================== */

const camEase = Easing.bezier(0.45, 0, 0.2, 1);

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const focusAmount = (frame: number, side: 'left' | 'right') => {
  let k = 0;
  BEATS.forEach((b, i) => {
    if (b.focus === 'both' || b.focus === side) {
      const a = i * SEG;
      const e = (i + 1) * SEG;
      const v = interpolate(frame, [a, a + 15, e - 15, e], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      k = Math.max(k, v);
    }
  });
  return k;
};

/* =====================================================================
   5. 2D OVERLAYS
   ===================================================================== */

const Captions: React.FC<{frame: number}> = ({frame}) => {
  const i = Math.min(Math.floor(frame / SEG), BEATS.length - 1);
  const local = frame - i * SEG;
  const opacity = interpolate(local, [0, 12, SEG - 10, SEG], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lift = interpolate(local, [0, 14], [16, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const beat = BEATS[i];

  return (
    <>
      {beat.label ? (
        <div
          style={{
            position: 'absolute',
            top: 230,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity,
          }}
        >
          <div
            style={{
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontSize: 32,
              letterSpacing: 5,
              textTransform: 'uppercase',
              color: WHEEL_AMBER,
              border: `2px solid ${WHEEL_AMBER}`,
              padding: '12px 28px',
              borderRadius: 6,
              background: 'rgba(11,18,32,0.55)',
            }}
          >
            {beat.label}
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: 90,
          right: 90,
          bottom: 380,
          opacity,
          transform: `translateY(${lift}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 120,
            height: 3,
            background: WHEEL_AMBER,
            margin: '0 auto 26px',
          }}
        />
        <div
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 66,
            lineHeight: 1.25,
            color: TEXT,
            textShadow: '0 3px 18px rgba(0,0,0,0.75)',
          }}
        >
          {beat.text}
        </div>
      </div>
    </>
  );
};

/* =====================================================================
   6. COMPOSITION
   ===================================================================== */

export const TrainVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // wheelset motion
  const s = SPEED * frame;
  const th = theta(s);
  const d = interpolate(frame, [CURVE_FRAME, CURVE_FRAME + SEG * 0.8], [0, SHIFT], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const p0 = pathPoint(s, 0);
  const wx = p0[0] - d * Math.cos(th);
  const wz = p0[2] - d * Math.sin(th);

  // camera (offsets are relative to the wheelset, rotated with the track heading)
  const bi = Math.min(Math.floor(frame / SEG), BEATS.length - 1);
  const prev = BEATS[Math.max(bi - 1, 0)];
  const cur = BEATS[bi];
  const local = frame - bi * SEG;
  const t = camEase(Math.min(1, local / 50));
  const camRel = lerp3(prev.cam, cur.cam, t);
  const lookRel = lerp3(prev.look, cur.look, t);
  camRel[2] += 0.5 * (local / SEG); // slow push-in during each beat

  const fx = Math.sin(th);
  const fz = -Math.cos(th);
  const nx = Math.cos(th);
  const nz = Math.sin(th);
  const toWorld = (v: Vec3): Vec3 => [
    wx + nx * v[0] + fx * v[2],
    v[1],
    wz + nz * v[0] + fz * v[2],
  ];

  const fadeIn = interpolate(frame, [0, 12], [1, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{fov: 60, near: 0.1, far: 200, position: [0, 3, -8]}}
      >
        <Scene
          s={s}
          d={d}
          th={th}
          fl={focusAmount(frame, 'left')}
          fr={focusAmount(frame, 'right')}
          cam={toWorld(camRel)}
          look={toWorld(lookRel)}
        />
      </ThreeCanvas>

      <Captions frame={frame} />

      <AbsoluteFill
        style={{backgroundColor: '#000', opacity: fadeIn, pointerEvents: 'none'}}
      />

      {VOICEOVER ? <Audio src={staticFile(VOICEOVER)} /> : null}
    </AbsoluteFill>
  );
};
