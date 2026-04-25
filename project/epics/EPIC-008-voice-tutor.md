---
id: EPIC-008
title: Voice tutor (think-aloud listening + speech response)
type: epic
status: backlog
priority: P2
phase: v1
tags: [voice, stt, tts, accessibility]
created: 2026-04-25
updated: 2026-04-25
---

## Goal

Let users "think aloud" while solving problems, mimicking a human teacher who hears their student. Voice is **deferred to v1** — the MVP ships text-only to keep scope tight and prove the core loop first.

## Scope

**v1:**
- Push-to-talk mode (NOT always-on at first — privacy and noise are real concerns).
- STT pipeline: Web Speech API for the prototype.
- TTS: browser SpeechSynthesis for the prototype.
- "Think-aloud" transcription stored alongside keystrokes in the episode log.
- Always-visible mute / recording indicator (trust — non-negotiable when voice ships).
- Voice activity detection for opt-in always-on mode.

**v2:**
- Whisper (cloud or self-hosted) replaces Web Speech for quality.
- Better TTS (ElevenLabs, OpenAI, or Azure).
- Frustration / confusion detection from prosody + content → proactive difficulty adjustment.

**v3:**
- Wake-word for hands-free mode (privacy implications need thought).
- Streaming STT for true conversational latency.

## Out of scope

- Voice in MVP (deferred per locked decision).
- Cloning specific voices (legal/ethical minefield).

## Stories under this Epic

(To be created when v1 work begins. None pre-populated since this is post-MVP.)

## Exit criteria (v1)

- [ ] User can hold a key to speak; audio is transcribed and shown to the tutor agent as context.
- [ ] Transcription and recording state are visible at all times.
- [ ] Voice features are entirely opt-in; text-only users are unaffected.

## Related

- Vision: [`docs/vision/GROOMED_FEATURES.md`](../../docs/vision/GROOMED_FEATURES.md) § Theme 5
- Recommended additions: frustration detection

## Activity log

- 2026-04-25 — created (deferred to v1)
