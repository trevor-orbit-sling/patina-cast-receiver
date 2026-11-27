import { show, tick } from "./view.js";
// TEMP diagnostics: show errors and player events on screen.
const dbgBox = document.createElement("pre");
dbgBox.style.cssText = "position:fixed;left:8px;top:8px;z-index:99;max-width:60vw;max-height:90vh;overflow:hidden;font:14px monospace;color:#ff8;background:rgba(0,0,0,.7);padding:6px;margin:0;white-space:pre-wrap";
document.addEventListener("DOMContentLoaded", () => document.body.append(dbgBox));
if (document.body) document.body.append(dbgBox);
export function dbg(...a) { dbgBox.textContent = (new Date().toISOString().slice(11,19) + " " + a.map(x => typeof x === "string" ? x : JSON.stringify(x)?.slice(0, 300)).join(" ") + "\n" + dbgBox.textContent).slice(0, 4000); }
window.addEventListener("error", e => dbg("ERROR", e.message, e.filename?.split("/").pop() + ":" + e.lineno));
window.addEventListener("unhandledrejection", e => dbg("REJECT", String(e.reason?.stack || e.reason)));

function startCast() {
  const caf = window.cast.framework;
  const context = caf.CastReceiverContext.getInstance();
  const player = context.getPlayerManager();
  const events = caf.events.EventType;
  let idleTimer;

  function updateTime() {
    const duration = player.getDurationSec();
    tick(player.getCurrentTimeSec(), duration > 0 ? duration : player.getMediaInformation()?.duration);
  }

  function update(status) {
    try { dbg("update", status?.playerState || player.getPlayerState(), (status?.media || player.getMediaInformation())?.metadata?.title || "no media"); } catch (e) { dbg("dbgfail", String(e)); }
    const media = status?.media || player.getMediaInformation();
    const state = status?.playerState || player.getPlayerState();
    if (!media || state === "IDLE") {
      // A sender may finish one LOAD just before delivering the next.
      idleTimer ??= setTimeout(() => { show(null, null, "IDLE"); idleTimer = null; }, 400);
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = null;
    const queue = player.getQueueManager();
    const items = queue?.getItems() || [];
    const index = queue?.getCurrentItemIndex() ?? -1;
    let next = items.find(item => item.itemId != null && item.itemId === status?.preloadedItemId);
    if (!next && index >= 0) {
      const repeat = status?.repeatMode;
      next = repeat === "REPEAT_SINGLE" ? items[index] : items[index + 1];
      if (!next && repeat === "REPEAT_ALL") next = items[0];
    }
    show(media, next?.media, state);
    updateTime();
  }

  player.addEventListener(events.MEDIA_STATUS, event => { try { update(event.mediaStatus); } catch (e) { dbg("update threw", String(e.stack || e)); } });
  player.addEventListener(events.ERROR, e => dbg("PLAYER ERROR", e.detailedErrorCode, e.reason, e.error?.message || ""));
  player.setMessageInterceptor(caf.messages.MessageType.LOAD, req => { dbg("LOAD", req.media?.contentId?.slice(0,80), req.media?.contentType, req.media?.metadata?.metadataType, req.media?.streamType); return req; });
  player.addEventListener(events.MEDIA_INFORMATION_CHANGED, () => update());
  player.addEventListener(events.TIME_UPDATE, updateTime);
  const options = new caf.CastReceiverOptions();
  options.mediaElement = document.getElementById("audio");
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
