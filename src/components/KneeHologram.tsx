import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type Point = { x: number; y: number; z: number };
type Ring = [height: number, width: number, depth: number, x?: number, z?: number, split?: number];
type Face = [number, number, number, number];

const segments = 32;
const mesh = { points: [] as Point[], faces: [] as Face[] };

function addBone(rings: Ring[]) {
  // Interpolate cross sections to keep the rim and joint contours smooth in motion.
  rings = rings.flatMap((ring, index) => {
    const following = rings[index + 1];
    if (!following) return [ring];
    const middle = Array.from({ length: 6 }, (_, field) =>
      ((ring[field] ?? 0) + (following[field] ?? 0)) / 2,
    ) as Ring;
    return [ring, middle];
  });
  const start = mesh.points.length;
  for (const [y, width, depth, x = 0, z = 0, split = 0] of rings) {
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const across = Math.cos(angle);
      mesh.points.push({
        x: x + width * across,
        y: y + split * (1 - Math.abs(across)),
        z: z + depth * Math.sin(angle),
      });
    }
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const a = start + row * segments + i;
      const b = start + row * segments + (i + 1) % segments;
      mesh.faces.push([a, b, b + segments, a + segments]);
    }
  }
}

// Simplified femur, tibia, fibula, and kneecap for the dashboard illustration.
addBone([
  [3.2, .01, .01], [3.08, .51, .48], [2.3, .49, .47],
  [1.55, .55, .51], [1.02, .78, .65], [.65, 1, .78],
  [.28, 1.02, .81, 0, -.04, .19], [.02, .78, .59, 0, -.06, .24],
  [-.06, .01, .01, 0, -.06, .25],
]);
addBone([
  [-.22, .01, .01], [-.27, .73, .58], [-.38, .92, .68],
  [-.61, .86, .62], [-.94, .65, .53], [-1.52, .51, .44],
  [-2.27, .43, .39], [-3.05, .44, .38], [-3.16, .01, .01],
]);
addBone([
  [-.63, .01, .01, .9, -.36], [-.77, .22, .22, .94, -.38],
  [-1.02, .19, .18, .92, -.41], [-1.65, .13, .14, .75, -.4],
  [-2.39, .12, .13, .65, -.37], [-2.98, .01, .01, .63, -.34],
]);
addBone([
  [.78, .01, .01, 0, .76], [.63, .34, .2, 0, .84],
  [.34, .4, .25, 0, .96], [.06, .29, .2, 0, 1.02],
  [-.18, .01, .01, 0, .95],
]);

function renderKnee(ctx: CanvasRenderingContext2D, width: number, height: number, yaw: number) {
  ctx.clearRect(0, 0, width, height);
  const scale = height / 5.8;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const projected = mesh.points.map(({ x, y, z }) => {
    const rotatedX = (x * cos + z * sin) * 1.22;
    const rotatedZ = -x * sin + z * cos;
    const depth = rotatedZ * .993 + y * .12;
    const perspective = 8 / (8 - depth);
    return {
      x: width / 2 + (rotatedX * .984 + y * .178) * scale * perspective,
      y: height / 2 - (y * .975 - rotatedX * .176 - rotatedZ * .12) * scale * perspective,
      z: depth,
    };
  });

  const faces = mesh.faces.map(vertices => {
    const points = vertices.map(index => projected[index]);
    const [a, b, c] = points;
    const winding = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return { points, winding, depth: points.reduce((total, point) => total + point.z, 0) / 4 };
  }).sort((a, b) => a.depth - b.depth);

  ctx.lineWidth = Math.max(.55, height / 395);
  for (const { points, winding, depth } of faces) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    const light = Math.max(0, Math.min(1, (depth + 1.1) / 2.6));
    const facing = Math.abs(winding) / (height * height / 900);
    const rim = Math.max(0, 1 - facing);
    ctx.fillStyle = `rgba(12, ${Math.round(35 + light * 105 + rim * 40)}, ${Math.round(62 + light * 110 + rim * 35)}, ${winding > 0 ? .19 : .61})`;
    ctx.strokeStyle = `rgba(120, 245, 255, ${.05 + light * .23 + rim * .25})`;
    ctx.fill();
    ctx.stroke();
  }
}

export function KneeHologram() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const angle = useRef(-.6);
  const dragX = useRef<number | null>(null);
  const draw = useRef(() => {});
  const [rotating, setRotating] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;

    let frame = 0;
    let last = 0;
    function tick(now: number) {
      if (last === 0) last = now;
      if (now - last >= 32) {
        if (dragX.current === null) angle.current += Math.min(now - last, 64) * .00042;
        draw.current();
        last = now;
      }
      frame = window.requestAnimationFrame(tick);
    }

    draw.current = () => renderKnee(ctx, element.width, element.height, angle.current);
    draw.current();
    if (rotating) frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      draw.current = () => {};
    };
  }, [rotating]);

  return (
    <div className="knee-hologram">
      <canvas
        ref={canvas}
        width={620}
        height={320}
        tabIndex={0}
        aria-label="3D knee illustration. Drag or use the left and right arrow keys to rotate."
        onPointerDown={event => {
          if (event.button !== 0) return;
          dragX.current = event.clientX;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (dragX.current === null) return;
          angle.current += (event.clientX - dragX.current) * .025;
          dragX.current = event.clientX;
          draw.current();
        }}
        onLostPointerCapture={() => { dragX.current = null; }}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          angle.current += event.key === "ArrowLeft" ? -.2 : .2;
          draw.current();
        }}
      />
      <button
        type="button"
        className="knee-hologram-control"
        aria-label={rotating ? "Pause knee rotation" : "Play knee rotation"}
        title={rotating ? "Pause rotation" : "Play rotation"}
        onClick={() => setRotating(current => !current)}
      >
        {rotating ? <Pause size={15} /> : <Play size={15} />}
      </button>
    </div>
  );
}
