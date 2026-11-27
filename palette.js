// Pick a representative saturated colour instead of one noisy, high-chroma pixel.
export function sample(image) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const key = rgb.map(value => value >> 5).join(",");
    const bin = bins.get(key) || { count: 0, sum: [0, 0, 0] };
    bin.count++;
    rgb.forEach((value, channel) => bin.sum[channel] += value);
    bins.set(key, bin);
  }
  let best, highest = 0;
  for (const { count, sum } of bins.values()) {
    const rgb = sum.map(value => value / count);
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    const score = Math.sqrt(count) * (chroma + 4);
    if (score > highest) { best = rgb; highest = score; }
  }
  return best;
}

export function senderAccent(hex) {
  if (typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)) {
    return hex.slice(1).match(/../g).map(pair => parseInt(pair, 16));
  }
}

// The scrim caps background luminance even over white. Target 0.60 for text
// and progress so the additional 28% long-pause dim still clears 4.5:1.
export function readable(rgb) {
  const luminance = values => values.reduce((total, value, channel) => {
    const s = value / 255;
    const linear = s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    return total + linear * [.2126, .7152, .0722][channel];
  }, 0);
  let result = rgb.map(Math.round);
  while (luminance(result) < .60) {
    result = result.map(channel => Math.ceil(channel + (255 - channel) * .06));
  }
  return 'rgb(' + result.join(',') + ')';
}
