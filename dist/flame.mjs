const gridSize = 40;
const sceneSize = 256;
const voxelScale = 5.6;

function makeMesh(image) {
  const sample = document.createElement('canvas');
  sample.width = sample.height = gridSize;
  const context = sample.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, gridSize, gridSize);
  const {data} = context.getImageData(0, 0, gridSize, gridSize);
  const tiles = [];
  const grid = Array.from({length: gridSize}, (_, row) => (
    Array.from({length: gridSize}, (_, column) => {
      const index = (row * gridSize + column) * 4;
      if (data[index + 3] < 192) return null;
      const tile = {row, column, color: [data[index], data[index + 1], data[index + 2]]};
      tiles.push(tile);
      return tile;
    })
  ));
  if (!tiles.length) return null;

  const top = tiles[0].row;
  const bottom = tiles.at(-1).row;
  const left = Math.min(...tiles.map(tile => tile.column));
  const right = Math.max(...tiles.map(tile => tile.column));
  const middleX = (left + right + 1) / 2;
  const middleY = (top + bottom + 1) / 2;
  const bodyHeight = bottom - top + 1;
  const foot = middleY - bottom - 1;
  const tileAt = (row, column) => grid[row]?.[column];
  const edges = [];

  for (const tile of tiles) {
    const {row, column} = tile;
    const exposed = !tileAt(row - 1, column) || !tileAt(row + 1, column)
      || !tileAt(row, column - 1) || !tileAt(row, column + 1);
    const height = (row - top) / bodyHeight;
    tile.depth = 2 + Math.round(height * 3) + (exposed ? 0 : 1);
    tile.x = column - middleX;
    tile.y = middleY - row - 1;
    if (exposed && height < .72) edges.push(tile);
  }

  const emberCount = Math.min(18, edges.length);
  const embers = Array.from({length: emberCount}, (_, index) => {
    const tile = edges[Math.floor((index + .5) * edges.length / emberCount)];
    const ember = {
      tile,
      life: 860 + (index % 6) * 105,
      offset: index * 83,
      rise: 25 + (index % 5) * 7,
      drift: (tile.x < 0 ? -1 : 1) * (8 + (index % 4) * 5),
      size: 2 + index % 3,
      color: index % 4 ? '#f5a8cd' : '#ffe3ef',
    };
    tile.ember = ember;
    return ember;
  });

  const faces = [];
  const vertices = new Map();
  function face(tile, nx, ny, nz, points, light) {
    const corners = points.map(([x, y, z]) => {
      const key = `${x},${y},${z}`;
      if (!vertices.has(key)) vertices.set(key, {x, y, z});
      return vertices.get(key);
    });
    const shade = tile.color.map((channel, index) => {
      const shadow = [26, 45, 113][index];
      return Math.max(0, Math.min(255, Math.round(channel * light + shadow * (1 - light))));
    });
    faces.push({tile, nx, ny, nz, corners, color: `rgb(${shade.join(',')})`});
  }

  for (const tile of tiles) {
    const {x, y, depth, row, column} = tile;
    for (const sign of [1, -1]) {
      const z = sign * depth;
      face(tile, 0, 0, sign, [[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z]], sign > 0 ? 1 : .94);
    }
    const sides = [
      {neighbor: tileAt(row, column - 1), nx: -1, ny: 0, a: [x, y], b: [x, y + 1], light: .78},
      {neighbor: tileAt(row, column + 1), nx: 1, ny: 0, a: [x + 1, y], b: [x + 1, y + 1], light: .71},
      {neighbor: tileAt(row - 1, column), nx: 0, ny: 1, a: [x, y + 1], b: [x + 1, y + 1], light: 1.08},
      {neighbor: tileAt(row + 1, column), nx: 0, ny: -1, a: [x, y], b: [x + 1, y], light: .65},
    ];
    for (const {neighbor, nx, ny, a, b, light} of sides) {
      const adjacent = neighbor?.depth ?? 0;
      if (adjacent >= depth) continue;
      const exposed = adjacent ? [[-depth, -adjacent], [adjacent, depth]] : [[-depth, depth]];
      for (const [near, far] of exposed) {
        face(tile, nx, ny, 0, [[...a, near], [...b, near], [...b, far], [...a, far]], light);
      }
    }
  }
  return {faces, vertices: [...vertices.values()], embers, foot, bodyHeight};
}

function startFlame(stage, image, canvas) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const mesh = makeMesh(image);
  if (!mesh) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = stage.closest('.soul-hero');
  const start = performance.now();
  const point = {x: 0, y: 0, z: 0};
  const visibleFaces = [];
  let targetYaw = 0;
  let targetPitch = 0;
  let pointerYaw = 0;
  let pointerPitch = 0;
  let isVisible = true;
  let frame = 0;
  let lastPaint = -Infinity;

  function pose(time) {
    const yaw = .23 + time / 3050 + pointerYaw;
    const pitch = .10 + Math.sin(time / 1400) * .08 + pointerPitch;
    return {
      sinYaw: Math.sin(yaw), cosYaw: Math.cos(yaw),
      sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch),
      stretch: 1 + Math.sin(time / 230) * .042,
      bend: Math.sin(time / 201) * 1.6 + Math.sin(time / 93) * .5,
    };
  }

  function project(vertex, view) {
    const height = vertex.y - mesh.foot;
    const x = vertex.x + view.bend * (height / mesh.bodyHeight) ** 2;
    const y = mesh.foot + height * view.stretch;
    const depth = vertex.z * view.cosYaw - x * view.sinYaw;
    vertex.screenX = sceneSize / 2 + (x * view.cosYaw + vertex.z * view.sinYaw) * voxelScale;
    vertex.screenY = sceneSize / 2 - (y * view.cosPitch - depth * view.sinPitch) * voxelScale;
    vertex.depth = y * view.sinPitch + depth * view.cosPitch;
  }

  function draw(now) {
    const elapsed = now - start;
    pointerYaw += (targetYaw - pointerYaw) * .17;
    pointerPitch += (targetPitch - pointerPitch) * .17;
    const view = pose(elapsed);
    for (const vertex of mesh.vertices) project(vertex, view);
    for (const ember of mesh.embers) ember.age = (elapsed + ember.offset) % ember.life;

    visibleFaces.length = 0;
    for (const face of mesh.faces) {
      const normalDepth = face.ny * view.sinPitch + (face.nz * view.cosYaw - face.nx * view.sinYaw) * view.cosPitch;
      if (normalDepth <= .005 || face.tile.ember?.age < 95) continue;
      const [a, b, c, d] = face.corners;
      face.depth = (a.depth + b.depth + c.depth + d.depth) / 4;
      visibleFaces.push(face);
    }
    visibleFaces.sort((a, b) => a.depth - b.depth);

    context.clearRect(0, 0, sceneSize, sceneSize);
    context.lineWidth = .38;
    for (const face of visibleFaces) {
      const [a, b, c, d] = face.corners;
      context.beginPath();
      context.moveTo(a.screenX, a.screenY);
      context.lineTo(b.screenX, b.screenY);
      context.lineTo(c.screenX, c.screenY);
      context.lineTo(d.screenX, d.screenY);
      context.closePath();
      context.fillStyle = context.strokeStyle = face.color;
      context.fill();
      context.stroke();
    }

    for (const {tile, age, life, rise, drift, size, color} of mesh.embers) {
      const progress = age / life;
      const release = pose(elapsed - age);
      point.x = tile.x + .5;
      point.y = tile.y + .5;
      point.z = release.cosYaw >= 0 ? tile.depth : -tile.depth;
      project(point, release);
      const y = point.screenY - rise * progress;
      context.globalAlpha = Math.min(1, progress * 18) * (1 - progress) ** 1.2 * Math.max(0, Math.min(1, y / 12));
      context.fillStyle = color;
      context.fillRect(Math.round(point.screenX + drift * progress), Math.round(y), size, size);
    }
    context.globalAlpha = 1;
  }

  function tick(now) {
    if (now - lastPaint >= 1000 / 30 - 1) {
      draw(now);
      lastPaint = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    if (reducedMotion.matches || document.hidden || !isVisible) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reducedMotion.matches) stage.classList.remove('is-burning');
    } else if (!frame) {
      draw(performance.now());
      stage.classList.add('is-burning');
      frame = requestAnimationFrame(tick);
    }
  }

  hero.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const {left, top, width, height} = hero.getBoundingClientRect();
    targetYaw = ((event.clientX - left) / width - .5) * 1.12;
    targetPitch = (.5 - (event.clientY - top) / height) * .62;
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

const stage = document.querySelector('.flame-stage');
const image = stage?.querySelector('img');
const canvas = stage?.querySelector('canvas');
if (image && canvas) {
  if (image.complete && image.naturalWidth) startFlame(stage, image, canvas);
  else image.addEventListener('load', () => startFlame(stage, image, canvas), {once: true});
}
