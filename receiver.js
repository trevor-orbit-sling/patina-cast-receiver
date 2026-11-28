import { show, tick } from "./view.js";
// TEMP diagnostics
const dbgBox = document.createElement("pre");
dbgBox.style.cssText = "position:fixed;left:8px;top:8px;z-index:99;max-width:60vw;max-height:90vh;overflow:hidden;font:14px monospace;color:#ff8;background:rgba(0,0,0,.75);padding:6px;margin:0;white-space:pre-wrap";
if (document.body) document.body.append(dbgBox); else document.addEventListener("DOMContentLoaded", () => document.body.append(dbgBox));
function dbg(...a) { dbgBox.textContent = (new Date().toISOString().slice(11,19) + " " + a.map(x => typeof x === "string" ? x : JSON.stringify(x)?.slice(0, 200)).join(" ") + "\n" + dbgBox.textContent).slice(0, 3000); }
window.addEventListener("error", e => dbg("ERROR", e.message, (e.filename || "").split("/").pop() + ":" + e.lineno, String(e.error?.stack || "").slice(0, 300)));
window.addEventListener("unhandledrejection", e => dbg("REJECT", String(e.reason?.stack || e.reason)));
const origErr = console.error; console.error = (...a) => { dbg("console.error", ...a.map(String)); origErr(...a); };

function startCast() {
  const caf = window.cast.framework;
  const context = caf.CastReceiverContext.getInstance();
  const player = context.getPlayerManager();
  const events = caf.events.EventType;
  let idleTimer;

  // CAF's getters throw while a new LOAD replaces the media element. A throw in
  // a player event handler makes CAF stop playback, so never let one escape.
  function safe(read, fallback) {
    try { return read(); } catch { return fallback; }
  }

  function updateTime() {
    const media = safe(() => player.getMediaInformation(), null);
    if (!media) return;
    const duration = safe(() => player.getDurationSec(), 0);
    tick(safe(() => player.getCurrentTimeSec(), 0), duration > 0 ? duration : media.duration);
  }

  function update(status) {
    const media = status?.media || safe(() => player.getMediaInformation(), null);
    const state = status?.playerState || safe(() => player.getPlayerState(), "IDLE");
    if (!media || state === "IDLE") {
      // A sender may finish one LOAD just before delivering the next.
      idleTimer ??= setTimeout(() => { show(null, null, "IDLE"); idleTimer = null; }, 400);
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = null;
    const queue = safe(() => player.getQueueManager(), null);
    const items = safe(() => queue?.getItems(), null) || [];
    const index = safe(() => queue?.getCurrentItemIndex(), -1) ?? -1;
    let next = items.find(item => item.itemId != null && item.itemId === status?.preloadedItemId);
    if (!next && index >= 0) {
      const repeat = status?.repeatMode;
      next = repeat === "REPEAT_SINGLE" ? items[index] : items[index + 1];
      if (!next && repeat === "REPEAT_ALL") next = items[0];
    }
    show(media, next?.media, state);
    updateTime();
  }

  const guard = handler => event => {
    try { handler(event); } catch (error) { console.error("Patina receiver", error); }
  };
  player.addEventListener(events.MEDIA_STATUS, guard(event => update(event.mediaStatus)));
  player.addEventListener(events.MEDIA_INFORMATION_CHANGED, guard(() => update()));
  player.addEventListener(events.TIME_UPDATE, guard(updateTime));
  player.addEventListener(events.ERROR, e => dbg("PLAYER ERROR", e.detailedErrorCode, e.reason, e.error?.message || "", JSON.stringify(e.error || {}).slice(0, 200)));
  player.addEventListener(events.REQUEST_LOAD, e => { const m = e.requestData?.media; dbg("REQUEST_LOAD", m?.metadata?.title, m?.contentType, "customData bytes", JSON.stringify(m?.customData || {}).length, "queue", e.requestData?.queueData?.items?.length); });
  player.addEventListener(events.PLAYER_LOAD_COMPLETE, () => dbg("LOAD_COMPLETE"));
  const options = new caf.CastReceiverOptions();
  // CastReceiverOptions has no mediaElement; hand CAF our <audio> the documented way.
  player.setMediaElement(document.getElementById("audio"));
  options.skipPlayersLoad = true;
  const commands = caf.messages.Command;
  options.supportedCommands = commands.ALL_BASIC_MEDIA | commands.QUEUE_NEXT | commands.QUEUE_PREV;
  context.start(options);
}

if (new URLSearchParams(location.search).has("mock")) {
  import("./mock/player.js").then(({ startMock }) => startMock(show, tick));
} else {
  const sdk = document.createElement("script");
  sdk.src = "//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js";
  sdk.onload = startCast;
  document.head.append(sdk);
}
