# PTP desktop client

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron with Vue 3, TypeScript and SCSS. The user approved Electron, npm execution, a separate `ptp-client-ui`, and concurrent bridges. Vue follows the repository's existing Vue conventions.

## Users

Website maintainers, including the owner's business partner, connecting an FTP editor to WordPress or PHP hosting from the host.

## Product Purpose

Save connections, run multiple PTP bridges at once, inspect actual client logs, and download the standalone PHP endpoint or WordPress plugin.

## Operating Context

Import WordPress YAML or enter endpoint credentials. Keep each bridge on a distinct loopback FTP port. Connect an existing FTP editor to the displayed address and credentials. Stop bridges individually or close the app to stop all.

## Capabilities and Constraints

Use `ptp-client` underneath, preserve its CLI and transfer behavior. Use OS encryption for stored passwords. Downloads use the prepared local release while public releases are unpublished, and the approved public origin when published. Do not publish or push. No installer or automatic updates in this iteration.

## Brand Commitments

Product name PTP. Existing green identity and logo from the documentation are the visual authority. Use clear operational language and actionable errors.

## Evidence on Hand

The existing client, compiled release files, generated manifest, WordPress adapter, and VitePress documentation.
