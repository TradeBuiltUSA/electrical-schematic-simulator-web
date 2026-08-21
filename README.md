# Electrical Schematic Simulator — Web

The public web build of the **TradeBuilt Electrical Schematic Simulator**.

### ▶︎ [Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)

Draw a circuit, wire it up, and watch it behave. Components, meters, and tools
run against a live circuit solver (nodal analysis with Gaussian elimination),
entirely in your browser — nothing is uploaded, nothing is installed.

- **[Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)**
- **[User manual](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/manual.html)**

## What it does

- Place components onto a schematic canvas and wire them together
- Live solve on every change — no run/stop cycle
- Virtual multimeter: probe any node or branch for voltage, current, and resistance
- Pan, zoom, and edit with mouse, keyboard, or touch
- Save and reload your workspace locally

## Running it locally

No build step and no dependencies — it's plain HTML, CSS, and JavaScript.

```bash
git clone https://github.com/TradeBuiltUSA/electrical-schematic-simulator-web.git
cd electrical-schematic-simulator-web
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## About this repository

This repo is the **published web build**, deployed to GitHub Pages from `main`.
It is generated from the private development repository — please open issues here
rather than sending pull requests, since changes are made upstream.

## Privacy

The simulator runs entirely client-side. No account, no telemetry, no data leaves
your browser. Saved workspaces live in your browser's local storage.

---

© TradeBuilt. All rights reserved. Published for use in the browser; not licensed
for redistribution or derivative works.
