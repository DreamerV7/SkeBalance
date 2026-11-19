import {makeKing} from './king-model.mjs?v=2';

const restingYaw = -.32;
const restingPitch = .16;

export function createKingScene(canvas) {
  const context = canvas.getContext('2d');
  const body = document.createElement('canvas');
  body.width = canvas.width;
  body.height = canvas.height;
  const paint = body.getContext('2d');
  if (!context || !paint) return null;

  const {vertices, faces, emitters} = makeKing();
  const radius = canvas.width / 2;
  const scale = canvas.width / 44;
  const visible = [];
  const particleScale = canvas.width / 288;
  let paintedYaw;
  let paintedPitch;

  function project(point, view) {
    const {x, y, z} = point;
    const depth = z * view.cosYaw - x * view.sinYaw;
    point.screenX = radius + (x * view.cosYaw + z * view.sinYaw) * scale;
    point.screenY = radius - (y * view.cosPitch - depth * view.sinPitch) * scale;
    point.depth = y * view.sinPitch + depth * view.cosPitch;
  }

  function drawParticles(time) {
    for (const [index, emitter] of emitters.entries()) {
      const lifetime = 1420 + index % 7 * 180;
      const age = (time + index * 117) % lifetime;
      const progress = age / lifetime;
      const drift = Math.sign(emitter.x || 1) * (8 + index % 4 * 5) * progress;
      const sway = Math.sin(progress * Math.PI * 2 + index) * progress * 3;
      const x = emitter.screenX + (drift + sway) * particleScale;
      const y = emitter.screenY - (32 + index % 6 * 7) * progress * particleScale;
      const size = Math.round((1 + index % 3) * particleScale);
      context.globalAlpha = Math.min(1, progress * 10, Math.max(0, y) / (10 * particleScale)) * (1 - progress) ** 1.2;
      context.fillStyle = index % 3 ? '#f6b5d1' : '#fff3e9';
      context.fillRect(Math.round(x), Math.round(y), size, size);
    }
    context.globalAlpha = 1;
  }

  function drawBody(yaw, pitch) {
    const view = {
      sinYaw: Math.sin(yaw), cosYaw: Math.cos(yaw),
      sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch),
    };
    for (const point of vertices) project(point, view);
    visible.length = 0;
    for (const face of faces) {
      const [x, y, z] = face.normal;
      const depth = z * view.cosYaw - x * view.sinYaw;
      const normalZ = y * view.sinPitch + depth * view.cosPitch;
      if (normalZ < .001 && !face.twoSided) continue;
      const normalX = x * view.cosYaw + z * view.sinYaw;
      const normalY = y * view.cosPitch - depth * view.sinPitch;
      const light = -.32 * normalX + .52 * normalY + .72 * normalZ;
      const shade = Math.max(0, Math.min(face.shades.length - 1, Math.round((light + .68) * 4.8)));
      face.color = face.shades[shade];
      face.depth = face.corners.reduce((sum, point) => sum + point.depth, 0) / face.corners.length;
      visible.push(face);
    }
    visible.sort((a, b) => a.depth - b.depth);

    paint.clearRect(0, 0, body.width, body.height);
    paint.lineWidth = .46 * particleScale;
    for (const face of visible) {
      const corners = face.corners;
      paint.beginPath();
      paint.moveTo(corners[0].screenX, corners[0].screenY);
      for (let index = 1; index < corners.length; index++) {
        paint.lineTo(corners[index].screenX, corners[index].screenY);
      }
      paint.closePath();
      paint.fillStyle = paint.strokeStyle = face.color;
      paint.fill();
      paint.stroke();
    }
  }

  return function draw(time, yaw = restingYaw, pitch = restingPitch, particles = true) {
    if (yaw !== paintedYaw || pitch !== paintedPitch) {
      drawBody(yaw, pitch);
      paintedYaw = yaw;
      paintedPitch = pitch;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(body, 0, 0);
    if (particles) drawParticles(time);
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

  function follow(angle, target) {
    const change = target - angle;
    return Math.abs(change) < .001 ? target : angle + change * .21;
  }

  function paint(now) {
    pointerYaw = follow(pointerYaw, targetYaw);
    pointerPitch = follow(pointerPitch, targetPitch);
    draw(now - start, restingYaw + pointerYaw, restingPitch + pointerPitch);
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
