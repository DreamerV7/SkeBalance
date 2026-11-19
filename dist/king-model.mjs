const palette = {
  night: [21, 35, 83],
  ink: [32, 52, 119],
  cobalt: [53, 79, 158],
  satin: [83, 109, 181],
  rose: [168, 89, 128],
  blush: [226, 151, 186],
  silk: [245, 192, 214],
  ivory: [250, 237, 232],
  glint: [255, 248, 239],
};

function faceNormal([a, b, c]) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function makeKing() {
  const vertices = [];
  const faces = [];
  const emitters = [];

  function vertex(x, y, z) {
    const point = {x, y, z};
    vertices.push(point);
    return point;
  }

  function face(corners, material, twoSided = false) {
    const normal = faceNormal(corners);
    const shades = Array.from({length: 9}, (_, index) => {
      const strength = .65 + index * .05;
      const channels = palette[material].map((channel, axis) => Math.min(255,
        Math.round(channel * strength + palette.night[axis] * Math.max(0, 1 - strength))));
      return `rgb(${channels.join(',')})`;
    });
    faces.push({corners, normal, shades, twoSided});
  }

  function loft(profile, segments, material, folds = []) {
    const rings = profile.map(([y, center, radiusX, radiusZ], row) => (
      Array.from({length: segments}, (_, side) => {
        const angle = side * Math.PI * 2 / segments;
        const fold = folds[side] ?? 0;
        const drape = 1 + fold * (1 - row / profile.length) * .14;
        return vertex(center + Math.cos(angle) * radiusX * drape,
          y + fold * (row === 0 ? .60 : .18), Math.sin(angle) * radiusZ * drape);
      })
    ));
    for (let row = 0; row < rings.length - 1; row++) {
      for (let side = 0; side < segments; side++) {
        const next = (side + 1) % segments;
        const lower = rings[row];
        const upper = rings[row + 1];
        const fabric = material(side, row);
        if (folds.length) {
          face([lower[side], upper[side], upper[next]], fabric);
          face([lower[side], upper[next], lower[next]], fabric);
        } else {
          face([lower[side], upper[side], upper[next], lower[next]], fabric);
        }
      }
    }
    for (const row of [0, rings.length - 1]) {
      const center = vertex(profile[row][1], profile[row][0], 0);
      for (let side = 0; side < segments; side++) {
        const next = (side + 1) % segments;
        const rim = rings[row];
        face(row ? [center, rim[next], rim[side]] : [center, rim[side], rim[next]], material(side, row));
      }
    }
    return rings;
  }

  // Asymmetric folds travel around the back as well as across the front.
  const cloakPanels = ['ink', 'rose', 'silk', 'cobalt', 'blush', 'rose', 'ink', 'cobalt',
    'satin', 'ink', 'rose', 'cobalt', 'blush', 'ink', 'satin', 'cobalt'];
  const folds = [-.3, .55, .85, -.4, .6, -.1, .85, -.45, .45, -.3, .7, -.5, .3, .7, -.45, .5];
  const hemTrim = ['ink', 'cobalt', 'rose', 'blush'];
  const cloak = loft([
    [-17.2, -1.5, 11.3, 6.3], [-16.35, -1.38, 10.91, 6.14], [-14.6, -1.05, 10, 5.8], [-10.2, -.3, 8.2, 5.0],
    [-5.3, .35, 6.3, 4.4], [-.3, .7, 5.5, 3.8], [3.45, .6, 5.8, 3.55],
    [6.1, .3, 6.6, 3.6], [7.9, .25, 2.8, 2.55],
  ], 16, (side, row) => row === 0 ? hemTrim[side % hemTrim.length] : cloakPanels[side], folds);

  const capelet = ['rose', 'silk', 'ivory', 'silk', 'blush', 'ivory', 'silk', 'rose',
    'cobalt', 'rose', 'blush', 'rose', 'ink', 'rose', 'blush', 'silk'];
  const shoulders = loft([
    [1.5, -.5, 6.25, 4.2], [2.05, -.42, 6.44, 4.23], [4.3, -.2, 7, 4.25],
    [5.8, .08, 7.18, 4.04], [6.15, .15, 7.15, 3.95], [7.75, .3, 2.9, 2.65],
  ], 16, (side, row) => {
    if (row === 0) return side < 8 ? 'rose' : 'ink';
    if (row === 3 && side < 8) return side % 2 ? 'ivory' : 'silk';
    return capelet[side];
  });

  loft([
    [6.1, .28, 1.8, 1.75], [7.85, .28, 2.65, 2.25], [10.9, .37, 3.06, 2.70],
    [13.35, .42, 2.83, 2.48], [14.6, .42, 1.90, 1.85],
  ], 12, (side, row) => side > 0 && side < 6 ? 'night' : row % 2 ? 'ink' : 'cobalt');

  const mask = [
    vertex(.45, 13.3, 2.82), vertex(-1.75, 12.65, 2.48), vertex(-1.92, 10.25, 2.74),
    vertex(-1.25, 8.85, 2.77), vertex(.35, 7.93, 2.8), vertex(1.82, 9.1, 2.75),
    vertex(2.30, 11.75, 2.48), vertex(1.72, 12.8, 2.61),
  ];
  const ridge = vertex(.52, 11.06, 3.97);
  const ceramic = ['ivory', 'glint', 'ivory', 'silk', 'ivory', 'silk', 'blush', 'ivory'];
  mask.forEach((point, side) => face([ridge, point, mask[(side + 1) % mask.length]], ceramic[side]));
  const maskEdge = mask.map(point => vertex(.45 + (point.x - .45) * 1.04, point.y, point.z - .25));
  maskEdge.forEach((point, side) => {
    const next = (side + 1) % maskEdge.length;
    face([point, maskEdge[next], mask[next], mask[side]], side % 2 ? 'rose' : 'silk', true);
  });
  face([vertex(-1.52, 11.42, 3.08), vertex(-1.28, 10.94, 3.28), vertex(-.22, 10.93, 3.68), vertex(-.38, 11.21, 3.57)], 'night', true);
  face([vertex(.95, 11.21, 3.68), vertex(1.14, 10.94, 3.57), vertex(1.90, 11.16, 3.07), vertex(1.88, 11.47, 3.04)], 'night', true);

  const crest = [1.0, .42, 1.85, .53, 4.35, .46, 2.5, .32, 1.15, .21, 1.64, .32];
  const outer = [];
  const inner = [];
  const base = [];
  const band = [];
  for (let side = 0; side < crest.length; side++) {
    const angle = Math.PI * 2 * side / crest.length;
    const x = Math.cos(angle), z = Math.sin(angle);
    const height = crest[side];
    const flare = height > 2 ? .52 : 0;
    base.push(vertex(.35 + x * 2.68, 13.45, z * 2.45));
    band.push(vertex(.35 + x * 2.98, 14.1, z * 2.70));
    outer.push(vertex(.35 + x * (3.2 + flare), 14.45 + height, z * (2.86 + flare)));
    inner.push(vertex(.35 + x * (2.83 + flare), 14.35 + height, z * (2.50 + flare)));
  }
  for (let side = 0; side < crest.length; side++) {
    const next = (side + 1) % crest.length;
    face([base[side], band[side], band[next], base[next]], side % 3 ? 'rose' : 'ivory');
    face([band[side], outer[side], outer[next], band[next]], side % 3 ? 'blush' : 'silk');
    face([outer[side], inner[side], inner[next], outer[next]], 'ivory', true);
    face([inner[next], inner[side], base[side], base[next]], 'rose');
  }

  const clasp = [vertex(.35, 6.06, 4.13), vertex(-.63, 4.83, 4.21),
    vertex(.35, 3.52, 4.18), vertex(1.29, 4.83, 4.21)];
  const claspPoint = vertex(.35, 4.83, 4.7);
  clasp.forEach((point, side) => face([claspPoint, point, clasp[(side + 1) % clasp.length]], side < 2 ? 'glint' : 'blush', true));

  emitters.push(...cloak[0]);
  for (const [ring, indices] of [[shoulders[2], [0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 13, 14]],
    [outer, [0, 1, 2, 4, 6, 8, 10, 11]]]) {
    for (const index of indices) emitters.push(ring[index]);
  }
  return {vertices, faces, emitters};
}
