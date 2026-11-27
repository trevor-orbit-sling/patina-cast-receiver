import { show, tick } from "./view.js";

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
