---
name: PTP desktop client
description: A connection workspace using PTP's existing green identity.
colors:
  primary: '#25634b'
  rail: '#173e2e'
  ground: '#f5f7f5'
  surface: '#ffffff'
  ink: '#202f28'
  muted: '#5d6d63'
  line: '#dce3dd'
  error: '#a33131'
typography:
  fine:
    fontSize: '10px'
  compact:
    fontSize: '11px'
  metadata:
    fontSize: '12px'
  helper:
    fontSize: '13px'
  body:
    fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '14px'
    lineHeight: 1.5
  heading:
    fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  section:
    fontSize: '16px'
  brand:
    fontSize: '25px'
  welcome:
    fontSize: '34px'
rounded:
  small: '4px'
  badge: '5px'
  control: '6px'
  navigation: '7px'
  notice: '8px'
  inset: '10px'
  panel: '12px'
  welcome: '20px'
spacing:
  tight: '8px'
  group: '16px'
  section: '26px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
---

## Overview

An operational desktop interface extending the documentation's PTP palette. Native expectations and explicit bridge state lead the design.

## Colors

The fixed forest-green rail owns navigation. Pale green identifies selection and setup context. Green means running; red means an error; gray means stopped. Pair every status color with a text label.

## Typography

Use the host system's UI sans-serif. Reserve monospace for FTP values, file hashes, commands, and client output. Use tabular numerals for ports, timestamps, and versions.

## Layout

The rail is 240px wide, becoming 218px below 1100px. The Electron minimum window is 900 × 650. Main content uses 36px padding, falling to 26px at compact desktop widths. Keep fields and details within a readable work area. Logs scroll independently. Small browser widths are a preview convenience, not a mobile product.

## Elevation & Depth

Use a single light border to separate panels. No decorative shadows or glow.

## Shapes

Controls use 6px corners; data panels use 12px corners. Status badges remain compact, with a dot and text. Use Lucide SVG icons consistently.

## Components

The saved list persists across connection details, setup, and downloads. Start/stop controls stay beside the selected connection's heading. Stop before editing; allow other bridges to run. Forms display encrypted-password retention clearly. Log filtering and Follow are independent controls. Downloads show verification and installation steps; they do not imply remote installation.

## Do's and Don'ts

Show actual client status and errors. Label preview examples as synthetic. Preserve keyboard focus, reduced motion, visible labels, and readable contrast. Do not introduce terminal decoration, fabricated activity, or claims that a running bridge proves remote write access.
