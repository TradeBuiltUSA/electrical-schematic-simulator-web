# TradeBuilt Electrical Schematic Simulator

### ▶︎ [Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)

An interactive electrical training tool that helps students, apprentices,
instructors, and skilled trades professionals build practical skills in reading
schematics, understanding AC and DC circuits, using electrical test instruments,
and troubleshooting electrical systems.

Design, wire, energize, and troubleshoot circuits with real-time Ohm's Law
calculations, electron flow animation, and IEEE/ANSI schematic symbols —
entirely in your browser. Nothing to install, nothing uploaded.

> **Proprietary software — not open source.** This repository is public so the
> app can be delivered to your browser, not so the code can be reused. See
> [Copyright and licensing](#copyright-and-licensing).

- **[Launch the simulator](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/)**
- **[User manual](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/manual.html)**

## Features

- **Draw and wire schematics** — place components on the canvas and connect them
- **Energize and observe** — live solve with real-time Ohm's Law values
- **Electron flow animation** — see current direction and magnitude as it moves
- **AC power** — 120V and 240V single-phase, 480V delta and 480Y/277V wye
  three-phase, and step-down transformers
- **DC power** — battery source with polarity, and a solver that knows the
  difference: capacitors block DC, transformers do not induce on it
- **Technician's tool bag** — multimeter (AC/DC voltage, current, resistance,
  capacitance), non-contact voltage tester, and amp clamp with inrush hold
- **Fault simulation** — introduce open and short faults and troubleshoot the
  result
- **Data boxes and properties panel** — inspect and tune any component
- **Save and load** workspaces locally
- **Touch and mobile support**, plus keyboard shortcuts

See the [user manual](https://tradebuiltusa.github.io/electrical-schematic-simulator-web/manual.html)
for the full walkthrough.

## Scope

The simulator covers schematic reading, circuit building, electrical
measurement, and troubleshooting across both AC and DC — the electrical
concepts the skilled trades work with day to day.

Some components — the CSR compressor, contactors, the low-voltage control
transformer — come from HVAC/R practice because they are familiar, useful
examples within the skilled trades. They are application examples, not the
boundary of the product: this is not an HVAC simulator, and not an AC-only
simulator.

## About this repository

This repo is the **published web build** of the simulator, deployed to GitHub
Pages from `main`. It is generated from a private development repository, so
please open an issue here for bugs or feedback rather than sending a pull
request — changes are made upstream. For licensing or permission requests, use
the email address below instead.

The simulator is intended to be used at its hosted address:
<https://tradebuiltusa.github.io/electrical-schematic-simulator-web/>

## Privacy

The simulator runs entirely client-side. No account, no telemetry, no data leaves
your browser. Saved workspaces live in your browser's local storage.

## Copyright and licensing

**© 2026 TradeBuilt™. All Rights Reserved.**

The TradeBuilt Electrical Schematic Simulator and its source code are
**proprietary software**. This repository is publicly accessible solely to
facilitate delivery of the web application — the simulator runs client-side, so
its HTML, CSS, and JavaScript must be served to your browser in order to work.

**No permission is granted** to copy, reproduce, modify, redistribute,
sublicense, sell, commercially exploit, or incorporate this software or any
substantial portion of it into another product or service without prior written
permission from TradeBuilt.

Public availability of this repository **does not constitute an open-source
license** and does not grant any rights beyond viewing this repository and using
the hosted TradeBuilt Electrical Schematic Simulator as intended. No rights in
the TradeBuilt name or logo are granted. Rights that applicable law gives you
regardless of this notice — such as fair use — are unaffected.

The source code is publicly viewable — it must be, for the app to run in your
browser — but it has not been licensed for reuse.

The full notice is in [COPYRIGHT](COPYRIGHT). For licensing, redistribution,
commercial use, or other permission requests, contact **tradebuiltusa@gmail.com**.

---

Created and designed by **Kenneth J. Thompson**.
