import { readable, sample, senderAccent } from "./palette.js";

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

async function albumArt(scene, url, customAccent) {
  const apply = rgb => { if (rgb) scene.style.setProperty("--accent", readable(rgb)); };
  const preset = senderAccent(customAccent);
  apply(preset);
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
  scene.querySelector(".backdrop").replaceChildren(img.cloneNode());
  if (!preset && img.crossOrigin) apply(sample(img));
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
  const artReady = albumArt(scene, artURL(meta), custom.accent);
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
  const { el, cues } = current;
  const meta = next?.metadata;
  el.next.hidden = cues.length > 0 || !meta;
  if (el.next.hidden) return;
  el["next-title"].textContent = meta.title || "Unknown track";
  el["next-artist"].textContent = meta.artist || meta.albumName || "";
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
    state === "PLAYING" ? "Now playing" : "Loading";
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
  el.position.textContent = clock(position);
  el.duration.textContent = clock(duration);
  const fraction = Number.isFinite(position / duration) && duration > 0 ? position / duration : 0;
  el.played.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fraction)) + ')';
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
  if (line) {
    line.classList.add("current");
    if (!current.scene.isConnected) return;
    const step = parseFloat(getComputedStyle(line).lineHeight);
    const bounds = el.lines.getBoundingClientRect();
    const offset = line.getBoundingClientRect().top - bounds.top + el.lines.scrollTop;
    const target = Math.round((offset - Math.max(0, (bounds.height - line.offsetHeight) / 2)) / step) * step;
    el.lyrics.classList.toggle("at-start", target <= 0);
    el.lyrics.classList.toggle("at-end", target >= el.lines.scrollHeight - el.lines.clientHeight);
    const follow = previous >= 0 && index === previous + 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.lines.scrollTo({ top: target, behavior: follow ? "smooth" : "instant" });
  } else {
    el.lines.scrollTo({ top: 0, behavior: "instant" });
    el.lyrics.classList.add("at-start");
  }
}
