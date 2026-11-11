# Warehouse roller shutter

- Source: [Rollershutter Door — Poly Haven](https://polyhaven.com/a/rollershutter_door)
- Author: MP. License: [CC0](https://polyhaven.com/license).
- Downloaded 2026-10-09; source file URLs and checksums are recorded in `provenance.json`.
- GTAbench keeps the clean 1K PBR variant, separates the fixed frame and moving sheet, and subdivides the sheet for a lifting animation without stretching the slat texture. The opening animation is our adaptation, not an animation supplied by Poly Haven.
- Rebuild: `cd native-city && node scripts/import-roller-shutter.mjs`. Deployment needs only the local GLB; no third-party requests are made during gameplay.

c09-n03 starts with this door closed. Approach on foot, press E, wait for the 2.6-second opening, then walk out. Collision remains active until fully open. Restarting the task resets the door; pausing pauses its animation. Other bank tasks keep their existing open exit.
