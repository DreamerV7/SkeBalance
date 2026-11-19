export function createProfileBurn(canvas) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.hidden = true;
  }

  reducedMotion.addEventListener('change', event => {
    if (event.matches) stop();
  });

  function play(reverse = false) {
    stop();
    if (reducedMotion.matches) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const cellSize = Math.max(9, Math.ceil(Math.max(innerWidth, innerHeight) / 180));
    const columns = canvas.width = Math.ceil(innerWidth / cellSize);
    const rows = canvas.height = Math.ceil(innerHeight / cellSize);
    const image = context.createImageData(columns, rows);
    const heat = new Float32Array(columns * rows);
    const flecks = new Float32Array(heat.length);

    // The diagonal front moves unevenly as neighbouring groups of pixels catch.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        const cross = reverse ? (columns - x) / columns : x / columns;
        const patch = (Math.imul(x >> 2, 31) ^ Math.imul(y >> 2, 23)) % 11 / 11;
        const flicker = (Math.imul(x, 131) ^ Math.imul(y, 97)) % 37 / 37;
        heat[index] = cross * .62 + (1 - y / rows) * .26 + patch * .13 + flicker * .06;
        flecks[index] = flicker;
      }
    }

    const started = performance.now();
    const pixels = image.data;
    function draw(now) {
      const progress = (now - started) / 430;
      if (progress >= 1) {
        stop();
        return;
      }

      const front = .12 + progress * 1.15;
      for (let index = 0; index < heat.length; index++) {
        const edge = heat[index] - front;
        const offset = index * 4;
        const grain = flecks[index];
        if (edge > .09) {
          pixels[offset] = 24;
          pixels[offset + 1] = 25;
          pixels[offset + 2] = 74;
          pixels[offset + 3] = 223;
        } else if (edge > 0) {
          pixels[offset] = 158 + grain * 91;
          pixels[offset + 1] = 38 + grain * 114;
          pixels[offset + 2] = 97 + grain * 64;
          pixels[offset + 3] = 194 + grain * 60;
        } else if (edge > -.18 && grain > .76) {
          pixels[offset] = 242;
          pixels[offset + 1] = 139;
          pixels[offset + 2] = 167;
          pixels[offset + 3] = 180 * (1 + edge / .18);
        } else pixels[offset + 3] = 0;
      }

      context.putImageData(image, 0, 0);
      frame = requestAnimationFrame(draw);
    }

    canvas.hidden = false;
    draw(started);
  }

  return {play, stop};
}
