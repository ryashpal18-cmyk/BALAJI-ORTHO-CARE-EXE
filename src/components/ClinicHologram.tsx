import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, ShaderMaterial, TorusGeometry, WebGLRenderer,
} from "three";

import kneeMesh from "@/assets/clinic-holograms/knee.mesh.b64?raw";
import shoulderMesh from "@/assets/clinic-holograms/shoulder.mesh.b64?raw";
import spineMesh from "@/assets/clinic-holograms/spine.mesh.b64?raw";
import kneePreview from "@/assets/clinic-holograms/knee.webp";
import shoulderPreview from "@/assets/clinic-holograms/shoulder.webp";
import spinePreview from "@/assets/clinic-holograms/spine.webp";

const MODEL_INTERVAL_MS = 10 * 60 * 1000;
const models = [
  { name: "Knee", mesh: kneeMesh, preview: kneePreview, angle: .36, tilt: -.17, rim: 1.9, rings: [-.78, .63], fade: 1 },
  { name: "Shoulder", mesh: shoulderMesh, preview: shoulderPreview, angle: -.42, tilt: -.07, rim: 2.48, rings: [-1.08, .80], fade: 2 },
  { name: "Spine", mesh: spineMesh, preview: spinePreview, angle: .55, tilt: -.07, rim: 1.25, rings: [-1.26, .85], fade: 0 },
];

const vertexShader = `
varying vec3 world, normalWorld, local;
void main() {
  local = position;
  world = (modelMatrix * vec4(position, 1.0)).xyz;
  normalWorld = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const fragmentShader = `
uniform float time, motion, fade;
varying vec3 world, normalWorld, local;
void main() {
  vec3 normal = normalize(normalWorld);
  vec3 view = normalize(cameraPosition - world);
  float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
  vec3 key = normalize(vec3(-.72, .66, .65));
  vec3 fill = normalize(vec3(.81, -.25, -.36));
  float diffuse = max(dot(normal, key), 0.0);
  float edge = pow(max(dot(normal, fill), 0.0), 3.5);
  float specular = pow(max(dot(normal, normalize(key + view)), 0.0), 32.0);
  float reflection = pow(max(dot(normal, normalize(fill + view)), 0.0), 20.0);
  float scanY = mix(3.9, -3.9, fract(time / 7.5));
  float scan = exp(-abs(local.y - scanY) * 20.0) * motion;
  float ends = fade < .5 ? 0.0 : fade < 1.5
    ? smoothstep(2.05, 3.23, abs(local.y))
    : smoothstep(1.20, 1.94, -local.y);
  vec3 color = vec3(.018, .094, .17) + vec3(.051, .31, .45) * diffuse
    + vec3(.26, .89, 1.0) * rim * 1.13 + vec3(.05, .42, .55) * edge
    + vec3(.84, 1.0, 1.0) * specular * .85 + vec3(.06, .52, .74) * reflection * .4
    + vec3(.30, .84, 1.0) * scan * .41;
  gl_FragColor = vec4(color, (.76 + .22 * max(rim, specular)) * (1.0 - ends));
}`;

async function loadGeometry(payload: string) {
  const compressed = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const data = await new Response(stream).arrayBuffer();
  const view = new DataView(data);
  const count = view.getUint32(0, true);
  const geometries: BufferGeometry[] = [];
  let offset = 4;

  try {
    for (let bone = 0; bone < count; bone++) {
      const positionsCount = view.getUint32(offset, true);
      const indexCount = view.getUint32(offset + 4, true);
      offset += 8;
      const positions = new Float32Array(positionsCount);
      for (let i = 0; i < positionsCount; i++, offset += 2) {
        positions[i] = view.getInt16(offset, true) / 4096;
      }
      const indices = new Uint16Array(indexCount);
      for (let i = 0; i < indexCount; i++, offset += 2) {
        indices[i] = view.getUint16(offset, true);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      geometries.push(geometry);
    }
    return geometries;
  } catch (error) {
    geometries.forEach(geometry => geometry.dispose());
    throw error;
  }
}

export function ClinicHologram() {
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [modelIndex, setModelIndex] = useState(0);
  const [painted, setPainted] = useState(-1);
  const model = models[modelIndex];

  useEffect(() => {
    const timer = window.setInterval(() => setModelIndex(index => (index + 1) % models.length), MODEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const container = panel.current;
    if (!element || !container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: element, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return;
    }
    const controller = new AbortController();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, .1, 40);
    const tilt = new Group();
    const body = new Group();
    tilt.rotation.z = model.tilt;
    body.rotation.set(.06, model.angle, 0);
    tilt.add(body);
    scene.add(tilt);
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, motion: { value: 0 }, fade: { value: model.fade } },
      transparent: true,
      vertexShader,
      fragmentShader,
    });
    const ringMaterial = new MeshBasicMaterial({
      color: 0x50dfff, transparent: true, opacity: .42, depthWrite: false, side: DoubleSide,
    });
    const rings = model.rings.map((height, index) => {
      const mesh = new Mesh(new TorusGeometry(model.rim + index * .16, .008, 7, 96), ringMaterial);
      mesh.rotation.x = Math.PI / 2 + .16;
      mesh.position.y = height;
      scene.add(mesh);
      return mesh;
    });

    let geometries: BufferGeometry[] = [];
    let onScreen = true;
    let ready = false;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    function draw() {
      if (!ready) return;
      material.uniforms.time.value = elapsed;
      material.uniforms.motion.value = reducedMotion.matches ? 0 : 1;
      renderer.render(scene, camera);
    }

    function tick(now: number) {
      if (!last) last = now;
      if (now - last >= 31) {
        const delta = Math.min((now - last) / 1000, .065);
        elapsed += delta;
        body.rotation.y += delta * .31;
        draw();
        last = now;
      }
      frame = window.requestAnimationFrame(tick);
    }

    function updateMotion() {
      window.cancelAnimationFrame(frame);
      last = 0;
      if (!ready || document.hidden || !onScreen) return;
      draw();
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(tick);
    }

    function resize() {
      if (!container) return;
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(0, .05, Math.max(10.4, 10.4 / camera.aspect));
      camera.updateProjectionMatrix();
      draw();
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      ready = false;
      window.cancelAnimationFrame(frame);
      setPainted(-1);
    }

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(container);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateMotion();
    });
    visibilityObserver.observe(container);
    reducedMotion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    element.addEventListener("webglcontextlost", handleContextLost);
    resize();

    void loadGeometry(model.mesh).then(result => {
      if (controller.signal.aborted) {
        result.forEach(geometry => geometry.dispose());
        return;
      }
      geometries = result;
      result.forEach((geometry, index) => {
        const mesh = new Mesh(geometry, material);
        mesh.renderOrder = index;
        body.add(mesh);
      });
      ready = true;
      resize();
      setPainted(modelIndex);
      updateMotion();
    }).catch(() => {
      if (!controller.signal.aborted) setPainted(-1);
    });

    return () => {
      controller.abort();
      ready = false;
      window.cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      reducedMotion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
      element.removeEventListener("webglcontextlost", handleContextLost);
      geometries.forEach(geometry => geometry.dispose());
      rings.forEach(ring => ring.geometry.dispose());
      material.dispose();
      ringMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [model, modelIndex]);

  return (
    <div
      className="clinic-anatomy-panel"
      ref={panel}
      role="img"
      aria-label={`${model.name} anatomy hologram`}
      title="BodyParts3D, © The Database Center for Life Science · CC BY 4.0 · cropped, scaled and shaded"
    >
      <img className="clinic-anatomy-preview" src={model.preview} alt="" hidden={painted === modelIndex} />
      <canvas
        key={model.name}
        className="clinic-anatomy-canvas"
        ref={canvas}
        aria-hidden="true"
        data-ready={painted === modelIndex}
      />
    </div>
  );
}
