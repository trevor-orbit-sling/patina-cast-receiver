import { show, tick } from "./view.js";

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

  player.addEventListener(events.MEDIA_STATUS, event => update(event.mediaStatus));
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
