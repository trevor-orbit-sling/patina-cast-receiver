import { luminance, readable, sample, senderAccent } from "./palette.js";

const tracks = document.querySelector("#tracks");
const idle = document.querySelector("#idle");
const template = document.querySelector("#track");
let current, trackKey, queueKey, pauseTimer;

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "–:––";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, "0");
  if (minutes < 60) return minutes + ":" + ss;
  return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0") + ":" + ss;
}

function artURL(meta) {
  for (const image of meta?.images || []) {
    if (typeof image?.url !== "string" || !image.url) continue;
    try {
      const url = new URL(image.url, document.baseURI);
      if (url.protocol === "https:" || (url.protocol === "http:" && url.origin === location.origin)) return url.href;
    } catch { /* Try the next image. */ }
  }
  return "";
}

// Render once per sleeve, at the same 256 px / 14 px blur as native v3.
function paintBackdrop(canvas, image) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const edge = Math.min(image.naturalWidth, image.naturalHeight);
  const size = canvas.width;
  const bleed = 32;
  ctx.filter = "blur(14px)";
  ctx.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2,
    edge, edge, -bleed, -bleed, size + 2 * bleed, size + 2 * bleed);
}

function applyAppearance(scene, {font, radius, theme}) {
  if (["Noto Sans", "Inter", "JetBrains Mono"].includes(font)) {
    scene.style.setProperty("--font", '"' + font + '"');
  }
  if (Number.isFinite(radius)) {
    scene.style.setProperty("--radius", Math.max(0, Math.min(24, radius)) / 10 + "rem");
  }
  const roles = {surface: "--surface", onSurface: "--text", onSurfaceVariant: "--secondary", primary: "--accent"};
  for (const [role, token] of Object.entries(roles)) {
    const rgb = senderAccent(theme?.[role]);
    if (!rgb) continue;
    scene.style.setProperty(token, theme[role]);
    if (role === "surface") {
      scene.classList.toggle("light-surface", luminance(rgb) > .20);
      scene.style.setProperty("--scrim", 'rgba(' + rgb.join(',') + ', .90)');
      scene.style.setProperty("--pause-scrim", 'rgba(' + rgb.join(',') + ', .96)');
    }
  }
}

async function albumArt(scene, url, customAccent, themePrimary) {
  const apply = rgb => { if (rgb) scene.style.setProperty("--accent", readable(rgb, scene.classList.contains("light-surface"))); };
  const preset = senderAccent(customAccent);
  if (!themePrimary) apply(preset);
  if (!url) return;
  const img = new Image();
  img.alt = "";
  // First request can serve both display and palette. A server that disallows
  // canvas reads can still serve a display-only copy with the default accent.
  img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
  } catch {
    img.removeAttribute("crossorigin");
    img.src = url;
    try { await img.decode(); } catch { return; }
  }
  scene.querySelector(".sleeve").replaceChildren(img);
  // Canvas allocation or pixel access can fail on a receiver. The sleeve and
  // metadata are already usable and the incoming scene must still resolve.
  try {
    paintBackdrop(scene.querySelector(".backdrop"), img);
    if (!themePrimary && !preset && img.crossOrigin) apply(sample(img));
  } catch { /* Keep the available art and theme roles. */ }
}

function build(media) {
  const scene = document.importNode(template.content.firstElementChild, true);
  const el = Object.fromEntries([...scene.querySelectorAll("[class]")].map(node => [node.classList[0], node]));
  const meta = media.metadata || {}, custom = media.customData || {};
  el.title.textContent = meta.title || "Unknown track";
  el.artist.textContent = meta.artist || "";
  el.album.textContent = (meta.albumName && meta.artist ? " · " : "") + (meta.albumName || "");
  if (typeof custom.quality === "string" && custom.quality.trim()) {
    el.quality.textContent = custom.quality;
    el.quality.hidden = false;
  }
  applyAppearance(scene, custom);
  const artReady = albumArt(scene, artURL(meta), custom.accent, senderAccent(custom.theme?.primary));
  const cues = Array.isArray(custom.lyrics) ? custom.lyrics.filter(cue =>
    Number.isFinite(cue?.t_ms) && cue.t_ms >= 0 && typeof cue.line === "string"
  ).sort((a, b) => a.t_ms - b.t_ms) : [];
  if (cues.length) {
    scene.classList.add("with-lyrics");
    el.lyrics.hidden = false;
    for (const cue of cues) {
      const line = document.createElement("p");
      line.dir = "auto";
      line.textContent = cue.line;
      el.lines.append(line);
    }
  }
  return { scene, el, cues, artReady, activeCue: -1 };
}

function showNext(next) {
  const { el } = current;
  const meta = next?.metadata;
  el.next.hidden = !meta;
  if (el.next.hidden) return;
  el["next-title"].textContent = [meta.title || "Unknown track", meta.artist || meta.albumName].filter(Boolean).join(" · ");
  el["next-time"].textContent = Number.isFinite(next.duration) ? clock(next.duration) : "";
  const url = artURL(meta);
  el.thumb.hidden = !url;
  el.thumb.replaceChildren();
  if (url) {
    const img = new Image();
    img.alt = "";
    img.onerror = () => { if (img.parentNode === el.thumb) el.thumb.hidden = true; };
    img.src = url;
    el.thumb.append(img);
  }
}

export function show(media, next, state) {
  if (state !== document.body.dataset.state) {
    clearTimeout(pauseTimer);
    document.body.classList.remove("deep-pause");
    document.body.dataset.state = state;
    if (state === "PAUSED") pauseTimer = setTimeout(() => document.body.classList.add("deep-pause"), 600000);
  }
  if (!media || state === "IDLE") {
    current = trackKey = queueKey = null;
    tracks.replaceChildren();
    idle.hidden = false;
    return;
  }
  const key = JSON.stringify([media.contentId, media.metadata, media.customData]);
  if (key !== trackKey) {
    const incoming = build(media);
    current = incoming;
    trackKey = key;
    queueKey = null;
    const reveal = () => {
      if (current !== incoming || incoming.scene.isConnected) return;
      const previous = tracks.lastElementChild;
      if (previous) {
        previous.getAnimations().forEach(fade => fade.cancel());
        tracks.replaceChildren(previous);
        previous.setAttribute("aria-hidden", "true");
      }
      tracks.append(incoming.scene);
      incoming.activeCue = -1;
      // The queue can advance while paused. Position lyrics after the incoming
      // scene has a layout, even if CAF sends no further clock event.
      if (incoming.clock) tick(incoming.clock.position, incoming.clock.duration);
      idle.hidden = true;
      if (previous) {
        const duration = parseFloat(getComputedStyle(incoming.scene).getPropertyValue("--fade"));
        const fade = incoming.scene.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-in-out" });
        fade.onfinish = () => previous.remove();
      }
    };
    // Retain the outgoing sleeve until the incoming image decodes. Slow or
    // missing art must not hold the new track information off screen.
    if (tracks.childElementCount) {
      const deadline = setTimeout(reveal, 850);
      incoming.artReady.then(() => { clearTimeout(deadline); reveal(); });
    } else reveal();
  }
  current.el.status.textContent = state === "PAUSED" ? "Paused" :
    state === "PLAYING" ? "Playing on TV" : "Loading";
  const nextKey = JSON.stringify([next?.metadata, next?.duration]);
  if (nextKey !== queueKey) {
    showNext(next);
    queueKey = nextKey;
  }
}

export function tick(position, duration) {
  if (!current) return;
  current.clock = { position, duration };
  const { el, cues } = current;
  const elapsed = clock(position), total = clock(duration);
  if (el.position.textContent !== elapsed) el.position.textContent = elapsed;
  if (el.duration.textContent !== total) el.duration.textContent = total;
  const fraction = Number.isFinite(position / duration) && duration > 0 ? position / duration : 0;
  el.played.style.transform = 'translateX(' + (100 * (Math.max(0, Math.min(1, fraction)) - 1)) + '%)';
  if (!cues.length) return;
  // Upper bound works for forward playback and seeks in either direction.
  let low = 0, high = cues.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cues[mid].t_ms <= position * 1000) low = mid + 1;
    else high = mid;
  }
  const index = low - 1;
  if (index === current.activeCue) return;
  const previous = current.activeCue;
  el.lines.children[previous]?.classList.remove("current");
  current.activeCue = index;
  const line = el.lines.children[index];
  el["cue-count"].textContent = index >= 0 ? `Line ${index + 1} of ${cues.length}` : "";
  if (line) {
    line.classList.add("current");
    if (!current.scene.isConnected) return;
    const step = parseFloat(getComputedStyle(line).lineHeight);
    const bounds = el.lines.getBoundingClientRect();
    const offset = line.getBoundingClientRect().top - bounds.top + el.lines.scrollTop;
    const target = Math.round((offset - Math.max(0, (bounds.height - line.offsetHeight) / 2)) / step) * step;
    const follow = previous >= 0 && index === previous + 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.lines.scrollTo({ top: target, behavior: follow ? "smooth" : "instant" });
  } else {
    el.lines.scrollTo({ top: 0, behavior: "instant" });
  }
}
