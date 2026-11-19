import {makeKing} from './king-model.mjs';

export function createKingScene(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return null;

  const {vertices, faces, emitters} = makeKing();
  const radius = canvas.width / 2;
  const scale = canvas.width / 44;
  const visible = [];
  const release = {};

  function project(point, view, time) {
    const hem = Math.max(0, (2 - point.y) / 20);
    const x = point.x + Math.sin(time / 410 + point.z / 4) * hem * .64;
    const y = point.y + Math.sin(time / 970) * .32;
    const z = point.z + Math.sin(time / 510 + point.x / 4) * hem * .4;
    const depth = z * view.cosYaw - x * view.sinYaw;
    point.screenX = radius + (x * view.cosYaw + z * view.sinYaw) * scale;
    point.screenY = radius - (y * view.cosPitch - depth * view.sinPitch) * scale;
    point.depth = y * view.sinPitch + depth * view.cosPitch;
  }

  function drawParticles(time, view) {
    for (const [index, emitter] of emitters.entries()) {
      const lifetime = 1420 + index % 7 * 180;
      const age = (time + index * 117) % lifetime;
      const progress = age / lifetime;
      release.x = emitter.x;
      release.y = emitter.y;
      release.z = emitter.z;
      project(release, view, time - age);
      const x = release.screenX + Math.sign(emitter.x || 1) * (8 + index % 4 * 5) * progress;
      const y = release.screenY - (32 + index % 6 * 7) * progress;
      const size = 1 + index % 3;
      context.globalAlpha = Math.min(1, progress * 10, Math.max(0, y) / 10) * (1 - progress) ** 1.2;
      context.fillStyle = index % 3 ? '#f6b5d1' : '#fff3e9';
      context.fillRect(Math.round(x), Math.round(y), size, size);
    }
    context.globalAlpha = 1;
  }

  return function draw(time, yaw = time / 4110 - .32, pitch = .16, particles = true) {
    const view = {
      sinYaw: Math.sin(yaw), cosYaw: Math.cos(yaw),
      sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch),
    };
    for (const point of vertices) project(point, view, time);
    visible.length = 0;
    for (const face of faces) {
      const [x, y, z] = face.normal;
      const depth = z * view.cosYaw - x * view.sinYaw;
      const normalZ = y * view.sinPitch + depth * view.cosPitch;
      if (normalZ < .001 && !face.twoSided) continue;
      const normalX = x * view.cosYaw + z * view.sinYaw;
      const normalY = y * view.cosPitch - depth * view.sinPitch;
      const light = -.32 * normalX + .52 * normalY + .72 * normalZ;
      const shade = Math.max(0, Math.min(5, Math.round((light + .68) * 3)));
      face.color = face.shades[shade];
      face.depth = face.corners.reduce((sum, point) => sum + point.depth, 0) / face.corners.length;
      visible.push(face);
    }
    visible.sort((a, b) => a.depth - b.depth);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = .46;
    for (const face of visible) {
      const corners = face.corners;
      context.beginPath();
      context.moveTo(corners[0].screenX, corners[0].screenY);
      for (let index = 1; index < corners.length; index++) {
        context.lineTo(corners[index].screenX, corners[index].screenY);
      }
      context.closePath();
      context.fillStyle = context.strokeStyle = face.color;
      context.fill();
      context.stroke();
    }
    if (particles) drawParticles(time, view);
  };
}

function mountKing(stage) {
  const canvas = stage.querySelector('canvas');
  const draw = createKingScene(canvas);
  if (!draw) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = stage.closest('.soul-hero');
  const start = performance.now();
  let targetYaw = 0;
  let targetPitch = 0;
  let pointerYaw = 0;
  let pointerPitch = 0;
  let isVisible = true;
  let frame = 0;
  let lastPaint = -Infinity;

  function paint(now) {
    const time = now - start;
    pointerYaw += (targetYaw - pointerYaw) * .17;
    pointerPitch += (targetPitch - pointerPitch) * .17;
    draw(time, time / 4110 - .32 + pointerYaw, .16 + pointerPitch);
    lastPaint = now;
  }

  function tick(now) {
    if (now - lastPaint >= 1000 / 30 - 1) paint(now);
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    if (reducedMotion.matches || document.hidden || !isVisible) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reducedMotion.matches) stage.classList.remove('is-animated');
    } else if (!frame) {
      paint(performance.now());
      stage.classList.add('is-animated');
      frame = requestAnimationFrame(tick);
    }
  }

  hero.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const {left, top, width, height} = hero.getBoundingClientRect();
    targetYaw = ((event.clientX - left) / width - .5) * 1.42;
    targetPitch = (.5 - (event.clientY - top) / height) * .52;
  }, {passive: true});
  hero.addEventListener('pointerleave', () => { targetYaw = targetPitch = 0; });
  reducedMotion.addEventListener?.('change', syncPlayback);
  document.addEventListener('visibilitychange', syncPlayback);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(stage);
  }
  syncPlayback();
}

const stage = document.querySelector('.king-stage');
if (stage) mountKing(stage);
