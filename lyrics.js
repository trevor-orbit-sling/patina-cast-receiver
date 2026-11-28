// Cast supplies cue starts, without vocal end times. Give a phrase time to
// finish before marking a long break, and release the last phrase in the outro.
const GAP_MS = 6000;
const PHRASE_MS = 4000;

export function buildLyrics(lines, lyrics) {
  const cues = Array.isArray(lyrics) ? lyrics.filter(cue =>
    Number.isFinite(cue?.t_ms) && cue.t_ms >= 0 && typeof cue.line === "string"
  ).sort((a, b) => a.t_ms - b.t_ms) : [];
  if (!cues.some(cue => cue.line.trim())) return null;

  const starts = [];
  function add(start, text, gap = false) {
    starts.push(start);
    const row = document.createElement("p");
    row.className = gap ? "lyric gap" : "lyric";
    const ink = document.createElement("span");
    if (gap) {
      row.setAttribute("aria-label", "Instrumental");
      for (let i = 0; i < 3; i++) ink.append(document.createElement("i"));
    } else {
      row.dir = "auto";
      row.dataset.line = text;
      ink.textContent = text;
    }
    row.append(ink);
    lines.append(row);
  }
  add(-1, "", cues[0].t_ms > GAP_MS);
  for (const [i, cue] of cues.entries()) {
    const next = cues[i + 1];
    const text = cue.line.trim();
    add(cue.t_ms, text, !text && !!next);
    if (text && next?.line.trim() && next.t_ms - cue.t_ms > GAP_MS) {
      add(cue.t_ms + PHRASE_MS, "", true);
    }
  }
  add(cues.at(-1).t_ms + GAP_MS, "");

  let active = -1;
  function center(follow = false) {
    const row = lines.children[active];
    if (!row || !lines.isConnected) return;
    lines.classList.toggle("follow", follow);
    lines.style.transform = 'translateY(-' + (row.offsetTop + row.offsetHeight / 2) + 'px)';
    lines.classList.add("ready");
  }

  const observer = new ResizeObserver(() => center());
  return {
    connect() {
      observer.observe(lines);
      center();
    },
    disconnect() { observer.disconnect(); },
    tick(position, duration) {
      // Upper bound works for both normal playback and seeks.
      let low = 0, high = starts.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (starts[mid] <= position * 1000) low = mid + 1;
        else high = mid;
      }
      const index = duration > 0 && position >= duration ? starts.length - 1 : Math.max(0, low - 1);
      if (index === active) return;
      for (let i = Math.max(0, active - 2); i <= Math.min(active + 2, starts.length - 1); i++) {
        lines.children[i].classList.remove("current", "near", "far");
      }
      for (let i = Math.max(0, index - 2); i <= Math.min(index + 2, starts.length - 1); i++) {
        lines.children[i].classList.add(["current", "near", "far"][Math.abs(i - index)]);
      }
      const follow = active >= 0 && index === active + 1;
      active = index;
      center(follow);
    },
  };
}
