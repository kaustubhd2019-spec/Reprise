# RepRise ⏰💪

A free wake-up alarm that **won't stop ringing until you exercise in front of your phone's camera**: squats, push-ups, jumping jacks or dancing. You pick the exercise and how many (5, 10, 15, 20 or any custom number). The camera counts your reps on the phone itself, and the alarm stops only when you're done.

No account, no subscription, no ads. The camera video never leaves your phone.

## Features

- **Alarms**: any time, repeat on chosen days (or once), label, on/off switch.
- **Challenges**:
  - 🏋️ **Squats**: counts full reps from your knee angle; half squats don't count.
  - 💪 **Push-ups**: counts from your elbow angle (put the phone on the floor, side-on).
  - 🤸 **Jumping jacks**: arms down by your sides ↔ arms overhead.
  - 💃 **Dance**: a timer that only runs while you're really moving.
  - Amounts: 5 / 10 / 15 / 20 reps (10–30 s for dance) or a custom number.
- **Anti-snooze**: no dismiss or snooze button. The back button does nothing while it rings. If you close the app, it starts ringing again as soon as you reopen it, with your progress saved.
- **Anti-cheat** (Normal and Strict modes): bending your knees or waving your arms while lying in bed doesn't count, and standing arm curls don't count as push-ups.
- **Sounds**: 14 original built-in sounds, from energetic (dhol beat, workout beat, coach whistle, level-up, air horn, siren, loud buzzer) to classic (beeps, digital watch, old telephone, fanfare) and gentle (marimba, chimes, birds), or **your own audio file** (MP3/M4A/WAV). The volume can start softer and build up. It gets quieter while you're exercising and loud again if you stop or walk out of frame.
- **Bedside clock (automatic)**: no mode to start or stop. While an alarm is on and RepRise is open, the screen stays awake, and after 30 seconds untouched the app dims into a clock. Tap it to see your alarms. It only shows a note when something needs fixing (sound not unlocked yet, camera blocked, low battery).
- **Practice mode**: try any challenge without the alarm to find the best spot for your phone.
- **Streaks and history** of your wake-ups.
- **Works offline** after the first load (installable as a home-screen app).
- **Backup**: if the camera fails (broken or permission blocked), you have to solve 3 maths problems instead.

## How to use it every night

1. Open RepRise, tap **+ Add alarm**, pick the time, exercise and amount, then **Save**.
2. Do a **Practice** run once to find a spot where the camera sees your whole body (1.5–2 m away, phone propped up).
3. At bedtime, **just leave RepRise open** on your bedside table. After 30 seconds it dims into a clock and keeps the screen on.
4. When it rings: stand in front of the camera and do your reps. There's no stop or snooze button; only finishing the exercise stops it.

**Important:** phones don't let web apps ring while they're closed or the phone is locked, so RepRise has to stay open on screen. If you lock the phone or switch apps, the alarm can't ring.

**Charger:** recommended but not required. The screen stays on all night (very dim), which can use a good part of the battery, so RepRise reminds you to plug in when the battery is below 50%.

## Put it on your phone (free hosting with GitHub Pages)

The camera only works over **https**, so the app needs to be hosted. GitHub Pages is free for public repositories:

1. On GitHub open this repository → **Settings → Pages**.
2. Under **Build and deployment** choose **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After a minute or two the app is live at
   **https://kaustubhd2019-spec.github.io/Reprise/**
4. On your phone, open that link and **install** it. This is not an APK and nothing downloads: the browser just gives the web app its own icon and window.
   - **Android (Chrome)**: tap **Install** in the app (or Chrome's ⋮ menu → **Install app** / **Add to Home screen**), then confirm. The icon appears on your home screen or in your app drawer after a few seconds.
   - **iPhone (Safari)**: Share → **Add to Home Screen** → Add.
   - If there's no install option, you probably opened the link inside another app's browser; choose **Open in Chrome** first.
5. Open RepRise from the home-screen icon and allow camera access when asked.

### Phone settings that help

- Turn **media volume** up. On iPhone, also check that Settings → Safari → Camera is set to **Allow** so it doesn't ask every morning.
- If the screen still turns off while RepRise is open, set Auto-Lock / Screen timeout to the longest option.
- If reps aren't being counted, improve the lighting, step back so your whole body is in view, or switch **Settings → Form strictness → Easy**.

## Privacy

Everything runs on your device. Pose detection uses Google's MediaPipe Pose Landmarker (Apache 2.0), bundled in `vendor/` and `models/`. Camera frames are processed in memory and never uploaded or saved. Alarms, history and your sound files are stored only in your browser.

## For developers

Plain HTML, CSS and JavaScript modules. No build step.

```
  index.html, styles.css, manifest.webmanifest, sw.js
  js/app.js        UI, alarm scheduling, ringing session
  js/counters.js   rep counting for each exercise (pure logic)
  js/schedule.js   alarm time maths (pure logic)
  js/sound.js      synthesized alarm sounds, custom files, playback
  js/pose.js       camera + MediaPipe pose detection, skeleton drawing
  js/wake.js       keep the screen awake
  vendor/mediapipe @mediapipe/tasks-vision 0.10.35 (bundle + wasm)
  models/          pose_landmarker_lite.task
  tests/           unit tests (node --test) and a Playwright end-to-end script
```

- Run locally: `python3 -m http.server 8765` in this folder, then open http://localhost:8765 (localhost counts as secure, so the camera works).
- Unit tests: `node --test tests/*.test.mjs`
- End-to-end (headless Chromium with a fake camera video): see the header of `tests/e2e.cjs`.
- After changing any app file, bump `CACHE` in `sw.js` so installed copies update.
