# Patina Player — Chromecast screen

This is the TV screen for [Patina Player](https://github.com/trevor-orbit-sling), a desktop music player for Navidrome and Subsonic servers.
When you cast from Patina, your Chromecast or Google TV loads this page and shows the track, cover art, Next up and synced lyrics in Patina's style.

It is a Google Cast Custom Web Receiver: plain HTML, CSS and JavaScript with no build step, served by GitHub Pages.
Open `index.html?mock` in a browser to see it with sample tracks.

Music and artwork stream directly from your own server to the TV; this page only draws the screen.

Licence: GPL-3.0-only. Noto Sans is under the SIL Open Font License (`assets/noto-sans-LICENSE.txt`). The sample covers in `mock/` were made for this project.
