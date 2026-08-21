# TradeBuilt Electrical Schematic Simulator

### ▶︎ [Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)

An interactive AC circuit schematic simulator built for HVAC trade education.
Design, wire, and energize circuits with real-time Ohm's Law calculations,
electron flow animation, and IEEE/ANSI schematic symbols — entirely in your
browser. Nothing to install, nothing uploaded.

- **[Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)**
- **[User manual](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/manual.html)**

## Features

- **Draw and wire schematics** — place components on the canvas and connect them
- **Energize and observe** — live solve with real-time Ohm's Law values
- **Electron flow animation** — see current direction and magnitude as it moves
- **Power sources** — 120V, 240V, 480V delta and wye, transformers, DC battery
- **Technician's tool bag** — multimeter and field instruments for probing nodes
- **Fault simulation** — introduce faults and troubleshoot the result
- **Data boxes and properties panel** — inspect and tune any component
- **Save and load** workspaces locally
- **Touch and mobile support**, plus keyboard shortcuts

See the [user manual](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/manual.html)
for the full walkthrough.

## Running it locally

No build step and no dependencies — plain HTML, CSS, and JavaScript.

```bash
git clone https://github.com/TradeBuiltUSA/electrical-schematic-simulator-web.git
cd electrical-schematic-simulator-web
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## About this repository

This repo is the **published web build**, deployed to GitHub Pages from `main`.
It is generated from a private development repository, so please open an issue
here rather than sending a pull request — changes are made upstream.

## Privacy

The simulator runs entirely client-side. No account, no telemetry, no data leaves
your browser. Saved workspaces live in your browser's local storage.

---

© 2026 TradeBuilt™ · All Rights Reserved
Created and Designed by Kenneth J. Thompson

Published for use in the browser; not licensed for redistribution or derivative works.
