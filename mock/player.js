const tracks = [
  {
    contentId: "night-ferry", duration: 272,
    metadata: { metadataType: 3, title: "Last Light", artist: "Mira Vale", albumName: "Night Ferry", images: [{ url: "mock/night-ferry.webp" }] },
    customData: { quality: "FLAC 24/44.1", waveform: Array.from({length: 200}, (_, i) =>
      Math.round((.16 + .76 * Math.abs(Math.sin(i * .13) * Math.cos(i * .047))) * 100) / 100) }
  },
  {
    contentId: "tidal-atlas", duration: 236,
    metadata: { metadataType: 3, title: "Soundings", artist: "June Sound", albumName: "Tidal Atlas", images: [{ url: "mock/tidal-atlas.webp" }] },
    customData: { quality: "FLAC 16/44.1", waveform: Array.from({length: 200}, (_, i) =>
      Math.round((.12 + .82 * Math.abs(Math.sin(i * .21) * Math.sin(i * .038))) * 100) / 100) }
  }
];

export function startMock(show, tick) {
  const params = new URLSearchParams(location.search);
  const scene = params.get("scene");
  const pinnedTime = scene === "lyrics" && params.has("at") && Number.isFinite(Number(params.get("at")));
  let index = scene === "pale" ? 1 : 0;
  let state = scene === "idle" ? "IDLE" : scene === "paused" ? "PAUSED" : "PLAYING";
  let position = pinnedTime ? Math.max(0, Number(params.get("at"))) : 94;
  let started = performance.now();
  const media = structuredClone(tracks);

  if (scene === "dark") media[0].metadata.images[0].url = "mock/after-dark.webp";
  if (scene === "long") {
    media[0].metadata.title = "Every Light Along the Northern Shore, Recorded on the Last Crossing Before the Harbour Closed for Winter";
    media[0].metadata.artist = "The International Ensemble for Electroacoustic Music and Unaccompanied Voices with the Midnight Harbour Orchestra";
  }
  if (scene === "lyrics") {
    if (params.get("cover") === "pale") index = 1;
    if (params.get("cover") === "dark") media[0].metadata.images[0].url = "mock/after-dark.webp";
    media[index].customData.lyrics = [
      { t_ms: 5000, line: "The ferry leaves before the light" },
      { t_ms: 10000, line: "A gull lifts from the railing" },
      { t_ms: 15000, line: "The ropes come up in coils" },
      { t_ms: 78000, line: "Our wake runs through the harbour" },
      { t_ms: 83000, line: "The empty slips fall quiet" },
      { t_ms: 88000, line: "One last lamp along the quay" },
      { t_ms: 92000, line: "I count the windows on the hillside till the last one slips from view" },
      { t_ms: 97000, line: "Till the river turns to sea" },
      { t_ms: 102000, line: "Your coat still smells of cedar" },
      { t_ms: 107000, line: "My ticket folds along the seam" },
      { t_ms: 130000, line: "I hold the shoreline in my palm" },
      { t_ms: 135000, line: "Until the morning comes" },
      { t_ms: 140000, line: "The buoys lean with the tide" },
      { t_ms: 145000, line: "We leave the lights behind" }
    ];
  }

  const elapsed = () => position + (state === "PLAYING" && !pinnedTime ? (performance.now() - started) / 1000 : 0);
  function render() {
    show(media[index], media[1 - index], state);
    tick(elapsed(), media[index].duration);
  }
  function advance() {
    index = 1 - index;
    position = 0;
    started = performance.now();
    state = "PLAYING";
    render();
  }
  document.addEventListener("keydown", event => {
    if (event.key === "ArrowRight") advance();
    if (event.code === "Space") {
      position = elapsed();
      started = performance.now();
      state = state === "PLAYING" ? "PAUSED" : "PLAYING";
      render();
    }
  });
  render();
  setInterval(() => {
    if (state !== "PLAYING") return;
    if ((!scene && performance.now() - started >= 16000) || elapsed() >= media[index].duration) advance();
    else tick(elapsed(), media[index].duration);
  }, 200);
}
