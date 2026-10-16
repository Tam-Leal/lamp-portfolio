// Lamp Portfolio 3D: Three.js scene (source) used by index.html. Bundled into assets/lamp3d.js.
// Settings come from window.LAMP_CONFIG (see index.html). Build with: npm run build
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3, Group, Mesh, LatheGeometry,
  CylinderGeometry, SphereGeometry, TorusGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial,
  ShaderMaterial, SpotLight, PointLight, DirectionalLight, AmbientLight, CanvasTexture, SRGBColorSpace,
  RepeatWrapping, AdditiveBlending, DoubleSide, BackSide, Sprite, SpriteMaterial, Points, BufferGeometry,
  BufferAttribute, PMREMGenerator, HemisphereLight, Raycaster, Plane, ACESFilmicToneMapping, PCFShadowMap, Quaternion, BoxGeometry
} from 'three';

const CFG = Object.assign({ mode: 'login', lightColor: '#ffb867', streetLightColor: '#9bb0d4', streetLightIntensity: 1, streetWindow: true, streetPassingCars: true }, window.LAMP_CONFIG || {});
// Per mode layout: how far the lamp slides aside when the light turns on (fraction of the viewport).
// x: landscape, slides left. y: portrait, slides up. scroll: portrait, the lamp scrolls away with the page.
const LAYOUT = { login: { x: 0.215, y: 0.295, scroll: false }, portfolio: { x: 0.235, y: 0.3, scroll: true } }[CFG.mode] || { x: 0.215, y: 0.295, scroll: false };
const UI = window.LampUI;
const canvas = document.getElementById('gl');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const portraitMQ = matchMedia('(max-aspect-ratio: 1/1)');
const keyBtn = document.getElementById('lampBtn');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

let renderer;
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer) { document.body.classList.add('nogl'); throw new Error('no-webgl'); }

renderer.setClearColor(0x050507, 1);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
scene.background = new Color(0x050507);
const camera = new PerspectiveCamera(35, 1, 0.1, 60);

/* ---------- procedural textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4; return t;
}
function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.45)');
    r.addColorStop(0.6, 'rgba(255,255,255,.1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}
const floorMap = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#25201d'; g.fillRect(0, 0, w, h);
  const n = 8, ph = h / n;
  for (let i = 0; i < n; i++) {
    const y = i * ph, l = 18 + Math.random() * 10;
    g.fillStyle = `hsl(24 ${14 + Math.random() * 8}% ${l}%)`; g.fillRect(0, y, w, ph - 3);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.14})`; g.fillRect(Math.random() * w, y + Math.random() * ph, 20 + Math.random() * 120, 1); }
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, y + ph - 3, w, 3);
    const off = Math.random() * w; g.fillRect(off, y, 3, ph);
  }
}, [7, 7]);
const fabricBump = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 2) { g.fillStyle = i % 4 ? '#707070' : '#a0a0a0'; g.fillRect(i, 0, 1, h); }
  for (let j = 0; j < h; j += 2) { g.fillStyle = j % 4 ? 'rgba(60,60,60,.5)' : 'rgba(200,200,200,.5)'; g.fillRect(0, j, w, 1); }
}, [10, 3]);
const gTex = glowTex();

/* ---------- environment (metal reflections) ---------- */
{
  const envScene = new Scene(); envScene.background = new Color(0x08080c);
  const panel = (c, i, x, y, z, sx, sy) => {
    const m = new Mesh(new BoxGeometry(sx, sy, 0.1), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(i) }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
  };
  panel(0x6f8cff, 1.6, -6, 4, 3, 5, 2); panel(0xffb070, 1.2, 6, 2, 4, 3, 3); panel(0xffffff, 0.8, 0, 8, -2, 6, 2);
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.9; pm.dispose();
}

/* ---------- room ---------- */
const floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ map: floorMap, roughness: 0.42, metalness: 0.05, color: 0xc8c0b8 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const wall = new Mesh(new PlaneGeometry(40, 20), new MeshStandardMaterial({ color: 0x15151b, roughness: 0.95 }));
wall.position.set(0, 10, -3.6); scene.add(wall);
const skirt = new Mesh(new BoxGeometry(40, 0.28, 0.06), new MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6 }));
skirt.position.set(0, 0.14, -3.57); scene.add(skirt);

/* ---------- lamp ---------- */
const lamp = new Group(); scene.add(lamp);
const iron = new MeshStandardMaterial({ color: 0x17171b, metalness: 0.75, roughness: 0.34 });
const brass = new MeshStandardMaterial({ color: 0xb98a48, metalness: 1, roughness: 0.28 });

const base = new Mesh(new LatheGeometry([[0, 0], [0.46, 0], [0.48, 0.015], [0.47, 0.05], [0.4, 0.09], [0.2, 0.12], [0.07, 0.14], [0, 0.14]].map(p => new Vector2(p[0], p[1])), 56), iron);
base.castShadow = base.receiveShadow = true; lamp.add(base);
const pole = new Mesh(new CylinderGeometry(0.036, 0.04, 2.1, 24), iron); pole.position.y = 1.18; pole.castShadow = pole.receiveShadow = true; lamp.add(pole);
function ring(y, r, h) { const m = new Mesh(new CylinderGeometry(r, r, h, 32), brass); m.position.y = y; m.castShadow = true; lamp.add(m); return m; }
ring(0.17, 0.075, 0.05); ring(0.66, 0.056, 0.07); ring(1.5, 0.056, 0.07); ring(2.2, 0.06, 0.1);
const collar = new Mesh(new TorusGeometry(0.05, 0.012, 12, 28), brass); collar.rotation.x = Math.PI / 2; collar.position.y = 0.2; lamp.add(collar);

const head = new Group(); head.position.y = 0; lamp.add(head);
const socket = new Mesh(new CylinderGeometry(0.07, 0.06, 0.14, 24), brass); socket.position.y = 2.27; head.add(socket);
const bulbMat = new MeshBasicMaterial({ color: 0x2a2a30, toneMapped: false });
const bulb = new Mesh(new SphereGeometry(0.095, 28, 20), bulbMat); bulb.position.y = 2.4; head.add(bulb);

const SH_Y = 1.98, SH_H = 0.78, SH_R0 = 0.64, SH_R1 = 0.36;
const shadeProfile = [[SH_R0, 0], [SH_R1, SH_H]].map(p => new Vector2(p[0], p[1]));
const shadeGeo = new LatheGeometry(shadeProfile, 64);
const shadeMat = new MeshStandardMaterial({ color: 0x24242a, roughness: 0.92, metalness: 0, side: DoubleSide, bumpMap: fabricBump, bumpScale: 1.4, emissive: new Color(CFG.lightColor), emissiveIntensity: 0 });
const shade = new Mesh(shadeGeo, shadeMat); shade.position.y = SH_Y; head.add(shade);
const liningMat = new MeshBasicMaterial({ color: 0x0a0a0d, side: BackSide, toneMapped: true });
const lining = new Mesh(new LatheGeometry(shadeProfile.map(p => new Vector2(p.x - 0.008, p.y)), 64), liningMat); lining.position.y = SH_Y; head.add(lining);
function rim(y, r) { const t = new Mesh(new TorusGeometry(r, 0.011, 8, 64), brass); t.rotation.x = Math.PI / 2; t.position.y = y; head.add(t); return t; }
rim(SH_Y, SH_R0); rim(SH_Y + SH_H, SH_R1);
// spider (shade rods)
for (let i = 0; i < 3; i++) {
  const a = i * Math.PI * 2 / 3 + 0.5, len = SH_R1 + 0.02;
  const s = new Mesh(new CylinderGeometry(0.006, 0.006, len, 6), brass);
  s.rotation.z = Math.PI / 2; s.position.set(Math.cos(a) * len / 2, SH_Y + SH_H - 0.02, Math.sin(a) * len / 2); s.rotation.set(0, -a, Math.PI / 2);
  head.add(s);
}
// cord eyelet
const EYE = new Vector3(0.42, SH_Y - 0.005, 0.48);
const eye = new Mesh(new SphereGeometry(0.02, 12, 8), brass); eye.position.copy(EYE); head.add(eye);

/* ---------- lights ---------- */
const lightCol = new Color(CFG.lightColor);
const spot = new SpotLight(lightCol, 0, 0, 0.78, 1, 1.6);
spot.position.set(0, 2.38, 0); spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024); spot.shadow.radius = 5; spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 8;
const spotTarget = new Group(); scene.add(spotTarget); spot.target = spotTarget; scene.add(spot);
const fill = new PointLight(lightCol, 0, 9, 1.8); fill.position.set(0, 2.5, 0.3); scene.add(fill);
const wallSpill = new PointLight(lightCol, 0, 8, 2); wallSpill.position.set(0, 2.4, -1.6); scene.add(wallSpill);
const moon = new DirectionalLight(0x7f9bff, 1.1); moon.position.set(-4, 4, -3); scene.add(moon);
// street light (only dominates while the lamp is off): cool window light coming in from the side
const SI = clamp(+CFG.streetLightIntensity || 0, 0, 3), streetCol = new Color(CFG.streetLightColor);
function windowTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  // 2 x 3 window pane with thin mullions; brighter center
  const x0 = 40, x1 = 216, y0 = 26, y1 = 230, mw = 7;
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#8a8a8a');
  g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = '#000';
  g.fillRect((x0 + x1) / 2 - mw / 2, y0, mw, y1 - y0);
  for (const f of [1 / 3, 2 / 3]) g.fillRect(x0, y0 + (y1 - y0) * f - mw / 2, x1 - x0, mw);
  // soften: downscale and upscale, then blend with the original
  const sm = document.createElement('canvas'); sm.width = sm.height = 48;
  const sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(c, 0, 0, 48, 48);
  g.globalAlpha = 0.75; g.imageSmoothingEnabled = true; g.drawImage(sm, 0, 0, S, S); g.globalAlpha = 1;
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
const street = new SpotLight(streetCol, 0, 0, 0.5, 0.75, 1.0);
street.position.set(-6.2, 4.2, 1.6); street.castShadow = !!CFG.streetWindow;
if (CFG.streetWindow) { street.map = windowTex(); street.shadow.mapSize.set(512, 512); street.shadow.radius = 7; street.shadow.bias = -0.0006; street.shadow.camera.near = 2; street.shadow.camera.far = 20; }
const streetTarget = new Group(); streetTarget.position.set(1.3, 0.3, -1.1); scene.add(streetTarget); street.target = streetTarget; scene.add(street);
const hemi = new HemisphereLight(0x4a5c86, 0x16141c, 0); scene.add(hemi);
const rimL = new DirectionalLight(0xffb98a, 0.4); rimL.position.set(4, 2, 4); scene.add(rimL);
scene.add(new AmbientLight(0x20233a, 0.28));

const halo = new Sprite(new SpriteMaterial({ map: gTex, color: lightCol, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
halo.position.set(0, 2.4, 0.15); halo.scale.set(3.6, 3.6, 1); scene.add(halo);
const spill = new Sprite(new SpriteMaterial({ map: gTex, color: lightCol, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
spill.position.set(0, 2.2, -3.3); spill.scale.set(10, 8, 1); scene.add(spill);


/* ---------- volumetric cone ---------- */
const CONE_Y = SH_Y, CONE_H = CONE_Y, CONE_R = SH_R0 + CONE_H * Math.tan(0.72);
const coneGeo = new CylinderGeometry(SH_R0 - 0.04, CONE_R, CONE_H, 72, 1, true); coneGeo.translate(0, -CONE_H / 2, 0);
const coneMat = new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  uniforms: { uColor: { value: lightCol.clone() }, uOn: { value: 0 }, uTime: { value: 0 }, uH: { value: CONE_H } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vT; varying float vA; uniform float uH;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vT = -position.y/uH; vA = atan(position.z, position.x); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vT; varying float vA; uniform vec3 uColor; uniform float uOn; uniform float uTime;
    void main(){
      float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
      float n = 0.82 + 0.18*sin(vA*7. + uTime*.25 + vT*5.)*sin(vA*3. - uTime*.18 + vT*2.);
      float a = f * n * (1.0 - vT*0.78) * smoothstep(0., .05, vT) * uOn * 0.5;
      gl_FragColor = vec4(uColor*a*1.15, a); }`
});
const cone = new Mesh(coneGeo, coneMat); cone.renderOrder = 2;
const coneGroup = new Group(); coneGroup.position.y = CONE_Y; coneGroup.add(cone); scene.add(coneGroup);

/* ---------- dust ---------- */
const DUST = matchMedia('(max-width:700px)').matches ? 150 : 280;
const dpos = new Float32Array(DUST * 3), dseed = new Float32Array(DUST), dvel = new Float32Array(DUST * 3);
function respawn(i, anywhere) {
  const t = anywhere ? Math.random() : Math.random() * 0.15;
  const y = -t * CONE_H, rmax = lerp(SH_R0 - 0.1, CONE_R - 0.1, t) * 0.92;
  const r = Math.sqrt(Math.random()) * rmax, a = Math.random() * 6.283;
  dpos[i * 3] = Math.cos(a) * r; dpos[i * 3 + 1] = y; dpos[i * 3 + 2] = Math.sin(a) * r;
  dseed[i] = Math.random();
  dvel[i * 3] = (Math.random() - 0.5) * 0.04; dvel[i * 3 + 1] = -0.012 - Math.random() * 0.03; dvel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
}
for (let i = 0; i < DUST; i++) respawn(i, true);
const dgeo = new BufferGeometry();
dgeo.setAttribute('position', new BufferAttribute(dpos, 3)); dgeo.setAttribute('aSeed', new BufferAttribute(dseed, 1));
const dustMat = new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending,
  uniforms: { uOn: { value: 0 }, uTime: { value: 0 }, uScale: { value: 300 }, uColor: { value: new Color(0xffe3b8) }, uCH: { value: CONE_H } },
  vertexShader: `attribute float aSeed; uniform float uScale; uniform float uTime; uniform float uCH; varying float vA;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); float t = -position.y/uCH;
      float tw = 0.55 + 0.45*sin(uTime*(0.8+aSeed*1.6) + aSeed*40.);
      vA = tw * smoothstep(0.,.08,t) * (1.0 - t*0.55) * (0.35 + aSeed*0.65);
      gl_PointSize = (0.014 + aSeed*0.022) * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; uniform vec3 uColor; uniform float uOn;
    void main(){ vec2 c = gl_PointCoord-.5; float d = length(c); float a = smoothstep(.5,.0,d); gl_FragColor = vec4(uColor, a*a*vA*uOn*1.6); }`
});
const dust = new Points(dgeo, dustMat); dust.frustumCulled = false; coneGroup.add(dust);

/* ---------- cord (verlet) ---------- */
const N = 13, SEG = 0.07, LEN = SEG * (N - 1);
const P = [], Q = [];
const anchorW = new Vector3().copy(EYE);
for (let i = 0; i < N; i++) { const p = anchorW.clone(); p.y -= SEG * i; P.push(p); Q.push(p.clone()); }
const cordMat = new MeshStandardMaterial({ color: 0xcdb78a, roughness: 0.8, metalness: 0 });
const segGeo = new CylinderGeometry(0.0085, 0.0085, 1, 6);
const segs = []; for (let i = 0; i < N - 1; i++) { const m = new Mesh(segGeo, cordMat); m.castShadow = true; scene.add(m); segs.push(m); }
const handleMat = new MeshStandardMaterial({ color: 0xb98a48, metalness: 1, roughness: 0.26, emissive: lightCol, emissiveIntensity: 0 });
const handle = new Mesh(new LatheGeometry([[0, 0.05], [0.02, 0.05], [0.026, 0.02], [0.03, -0.02], [0.022, -0.06], [0.01, -0.085], [0, -0.09]].map(p => new Vector2(p[0], p[1])), 20), handleMat);
handle.castShadow = true; scene.add(handle);
const UP = new Vector3(0, 1, 0), tmp = new Vector3(), dirv = new Vector3(), qq = new Quaternion();

const drag = { on: false, id: -1, toggled: false, sx: 0, sy: 0, t0: 0, moved: 0, target: new Vector3() };
const ray = new Raycaster(); const plane = new Plane(new Vector3(0, 0, 1), -EYE.z); const ndc = new Vector2();
let carT = -1, carAt = -99, carK = 0;
let on = false, lit = 0, onTime = -10, layoutT = 0, hover = false;
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

function stepCord(dt, time) {
  const g = -9.8, damp = reduce.matches ? 0.94 : 0.988;
  for (let i = 1; i < N; i++) {
    const p = P[i], q = Q[i];
    const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp, vz = (p.z - q.z) * damp;
    q.copy(p);
    p.x += vx; p.y += vy + g * dt * dt; p.z += vz;
    if (!drag.on && !reduce.matches) { const k = i / N; p.x += (Math.sin(time * 0.9 + i * 0.35) * 5e-6 + Math.sin(time * 0.37) * 3e-6) * k; p.z += Math.cos(time * 0.7 + i * 0.3) * 2.5e-6 * k; }
    p.z += (EYE.z - p.z) * 0.01; // keep close to the plane
  }
  for (let it = 0; it < 12; it++) {
    P[0].copy(anchorW);
    if (drag.on) P[N - 1].copy(drag.target);
    for (let i = 0; i < N - 1; i++) {
      const a = P[i], b = P[i + 1];
      dirv.subVectors(b, a); const d = dirv.length() || 1e-6, diff = (d - SEG) / d;
      const wa = i === 0 ? 0 : 1, wb = (drag.on && i + 1 === N - 1) ? 0 : (i + 1 === N - 1 ? 0.7 : 1);
      const sum = wa + wb; if (!sum) continue;
      a.addScaledVector(dirv, diff * wa / sum); b.addScaledVector(dirv, -diff * wb / sum);
    }
  }
}
function pullAmount() { return anchorW.y - LEN - (drag.on ? drag.target.y : P[N - 1].y); }
function updateCordMeshes() {
  for (let i = 0; i < N - 1; i++) {
    const a = P[i], b = P[i + 1], m = segs[i];
    dirv.subVectors(b, a); const len = dirv.length() + 0.004;
    m.position.copy(a).addScaledVector(dirv, 0.5); m.scale.set(1, len, 1);
    qq.setFromUnitVectors(UP, dirv.normalize()); m.quaternion.copy(qq);
  }
  const e = P[N - 1], pr = P[N - 2];
  handle.position.set(e.x, e.y - 0.0, e.z);
  dirv.subVectors(pr, e).normalize(); handle.quaternion.setFromUnitVectors(UP, dirv);
  handle.position.addScaledVector(dirv, -0.03);
}
function impulse(dy) { P[N - 1].y += dy; P[N - 2].y += dy * 0.6; P[N - 3].y += dy * 0.3; }

/* ---------- input ---------- */
const hs = new Vector3();
function handleScreen() {
  hs.copy(P[N - 1]).project(camera);
  return { x: (hs.x * 0.5 + 0.5) * innerWidth, y: (-hs.y * 0.5 + 0.5) * innerHeight };
}
function setNdc(e) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
function setLamp(v, opts) { UI.set(v, opts); }
canvas.addEventListener('pointerdown', e => {
  setNdc(e);
  const h = handleScreen(), d = Math.hypot(e.clientX - h.x, e.clientY - h.y);
  const lim = e.pointerType === 'touch' ? 46 : 30;
  drag.sx = e.clientX; drag.sy = e.clientY; drag.t0 = performance.now(); drag.moved = 0; drag.toggled = false;
  if (d < lim) {
    drag.on = true; drag.id = e.pointerId; canvas.setPointerCapture(e.pointerId);
    ray.setFromCamera(ndc, camera); ray.ray.intersectPlane(plane, drag.target); canvas.style.cursor = 'grabbing'; e.preventDefault();
  }
  // only the cord handle toggles the light: tapping the lampshade or the lamp body does nothing
});
canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1;
  if (drag.on && e.pointerId === drag.id) {
    setNdc(e); ray.setFromCamera(ndc, camera); ray.ray.intersectPlane(plane, drag.target);
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
    // limits: cannot go above the rest point and stretches at most 0.5
    drag.target.y = Math.min(drag.target.y, anchorW.y - SEG * 3);
    const dx = drag.target.x - anchorW.x, dy = drag.target.y - anchorW.y, dist = Math.hypot(dx, dy), max = LEN + 0.5;
    if (dist > max) { drag.target.x = anchorW.x + dx / dist * max; drag.target.y = anchorW.y + dy / dist * max; }
    drag.target.z = EYE.z;
    if (!drag.toggled && pullAmount() > 0.2) { drag.toggled = true; setLamp(!on, { impulse: false }); }
  } else if (e.pointerType !== 'touch') {
    const h = handleScreen(); const near = Math.hypot(e.clientX - h.x, e.clientY - h.y) < 30;
    if (near !== hover) { hover = near; canvas.style.cursor = near ? 'grab' : ''; }
  }
});
function endDrag(e) {
  if (!drag.on || e.pointerId !== drag.id) return;
  drag.on = false; canvas.style.cursor = hover ? 'grab' : '';
  if (!drag.toggled && drag.moved < 8 && performance.now() - drag.t0 < 500) { setLamp(!on, { impulse: true }); }
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.style.touchAction = 'none';
// portfolio mode: the content panel covers part of the canvas, so track the mouse on the whole window (parallax only runs while lit)
if (CFG.mode === 'portfolio') addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; } });

document.addEventListener('lamp:state', e => {
  const v = e.detail.on;
  if (v !== on) { on = v; if (on) onTime = performance.now() / 1000; }
  if (e.detail.impulse) impulse(-0.22);
});

/* ---------- layout ---------- */
let W = 0, H = 0, portrait = false;
function resize() {
  W = innerWidth; H = innerHeight; portrait = portraitMQ.matches;
  const dpr = Math.min(devicePixelRatio || 1, W < 700 ? 1.5 : 2);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  camera.aspect = W / H;
  dustMat.uniforms.uScale.value = H * dpr * 0.5 / Math.tan(camera.fov * Math.PI / 360) / 1.0;
}
function frame(tNow) {
  const time = tNow / 1000, dt = Math.min(0.05, (tNow - (frame.last || tNow)) / 1000 || 0.016); frame.last = tNow;
  const rm = reduce.matches;
  // light state
  const target = on ? 1 : 0, rate = rm ? 30 : (on ? 14 : 7);
  lit += (target - lit) * Math.min(1, rate * dt); if (Math.abs(target - lit) < 0.002) lit = target;
  let flick = 1;
  if (on && !rm) {
    const s = time - onTime;
    if (s < 0.5) { flick = s < 0.07 ? 0.05 : s < 0.14 ? 0.85 : s < 0.22 ? 0.12 : s < 0.34 ? 1.05 : s < 0.41 ? 0.55 : 1; }
    else flick = 1 + 0.012 * Math.sin(time * 23) + 0.01 * Math.sin(time * 7.3);
  }
  const L = lit * flick;
  spot.intensity = 210 * L; fill.intensity = 5 * L; wallSpill.intensity = 7 * L;
  shadeMat.emissiveIntensity = 1.05 * L; handleMat.emissiveIntensity = 0.1 * L;
  liningMat.color.setRGB(0.04 + 1.9 * L * lightCol.r, 0.04 + 1.9 * L * lightCol.g * 0.95, 0.045 + 1.9 * L * lightCol.b * 0.7);
  bulbMat.color.setRGB(0.16 + 5 * L * lightCol.r, 0.16 + 4.6 * L * lightCol.g, 0.18 + 3.2 * L * lightCol.b);
  halo.material.opacity = 0.55 * L; spill.material.opacity = 0.2 * L;
  coneMat.uniforms.uOn.value = Math.min(1.2, L); dustMat.uniforms.uOn.value = Math.min(1, L);
  scene.environmentIntensity = 0.9 - 0.3 * lit;
  // street light: strong when off, low when on (crossfade with lit)
  const off = 1 - lit, sk = SI * (0.1 * lit + off);
  let sv = 1, sx = 0;
  if (!rm) {
    sv = 1 + 0.07 * Math.sin(time * 0.31) + 0.04 * Math.sin(time * 0.83 + 1.7);
    if (CFG.streetPassingCars) {
      if (carT < 0) carT = time + (window.__REC ? 0.5 : 5 + Math.random() * 4); // __REC: fixed timing for the demo recording (only with ?record=1)
      if (time > carT) { carAt = time; carT = time + 14 + Math.random() * 22; }
      const u = (time - carAt) / 4.5; // passing headlight: fades in and out smoothly, 4.5 s
      if (u >= 0 && u <= 1) { const b = Math.sin(u * Math.PI); carK = b * b; sx = (u - 0.5) * 2.2; } else carK = 0;
      sv += 0.55 * carK;
    }
  }
  street.intensity = 150 * sk * sv; hemi.intensity = (0.34 * off + 0.03 * lit) * SI;
  streetTarget.position.x = 1.3 + sx;

  // parallax
  const k = (rm || !on) ? 0 : 1; mouse.sx += (mouse.x * k - mouse.sx) * Math.min(1, 3 * dt); mouse.sy += (mouse.y * k - mouse.sy) * Math.min(1, 3 * dt);
  const vis = portrait ? 5.3 + (1 - Math.min(1, W / H)) * 6.5 : 5.3;
  const dist = vis / (2 * Math.tan(camera.fov * Math.PI / 360));
  camera.position.set(mouse.sx * 0.45, 1.55 - mouse.sy * 0.14, dist);
  camera.lookAt(mouse.sx * 0.1, 1.48, 0);
  const tx = mouse.sx * 0.5, tz = mouse.sy * 0.35;
  spotTarget.position.set(tx, 0, tz); coneGroup.rotation.set(-tz / CONE_Y, 0, tx / CONE_Y);
  // layout: the lamp slides over when it turns on
  layoutT += ((on ? 1 : 0) - layoutT) * Math.min(1, (rm ? 30 : 3.2) * dt);
  const scrollPx = (portrait && LAYOUT.scroll) ? (window.scrollY || 0) : 0;
  const ox = portrait ? 0 : W * LAYOUT.x * layoutT, oy = portrait ? H * LAYOUT.y * layoutT + scrollPx : H * -0.015;
  camera.setViewOffset(W, H, ox, oy, W, H); camera.updateProjectionMatrix();

  // physics
  if (!rm || drag.on || Math.abs(P[N - 1].y - (anchorW.y - LEN)) > 0.001) { const h = 1 / 180, sub = clamp(Math.round(dt / h), 1, 9); for (let i = 0; i < sub; i++) stepCord(h, time + i * h); }
  updateCordMeshes();
  // dust (only while lit)
  if (lit > 0.01) {
    coneMat.uniforms.uTime.value = time; dustMat.uniforms.uTime.value = rm ? 0 : time;
    if (!rm) {
      for (let i = 0; i < DUST; i++) {
        const j = i * 3, s = dseed[i];
        dpos[j] += (dvel[j] + Math.sin(time * 0.4 + s * 30) * 0.012) * dt;
        dpos[j + 1] += dvel[j + 1] * dt + Math.sin(time * 0.3 + s * 17) * 0.004 * dt;
        dpos[j + 2] += (dvel[j + 2] + Math.cos(time * 0.35 + s * 21) * 0.012) * dt;
        const t = -dpos[j + 1] / CONE_H, rmax = lerp(SH_R0 - 0.1, CONE_R - 0.1, clamp(t, 0, 1));
        if (t > 1 || t < -0.02 || Math.hypot(dpos[j], dpos[j + 2]) > rmax) respawn(i, false);
      }
      dgeo.attributes.position.needsUpdate = true;
    }
  }
  // keyboard button follows the cord
  const h = handleScreen(); keyBtn.style.left = h.x + 'px'; keyBtn.style.top = h.y + 'px';
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', resize); resize();
document.addEventListener('visibilitychange', () => { frame.last = 0; });
frame.last = 0;
for (let i = 0; i < 400; i++) stepCord(1 / 180, 0);
document.body.classList.add('gl-ready');
requestAnimationFrame(frame);
