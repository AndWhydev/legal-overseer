# BitBit Voice UX — Development Plan

## Architecture Overview

Two distinct voice modes sharing core infrastructure:

```
┌─────────────────────────────────────────────────────┐
│                   Voice Infrastructure               │
│                                                      │
│  useVoiceSession() — unified hook                    │
│  ├── STT: Web Speech API (browser) or Deepgram       │
│  ├── VAD: silence detection → semantic (later)       │
│  ├── TTS: OpenAI TTS API via /api/voice/synthesize   │
│  └── AudioContext: waveform analysis + playback       │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐   │
│  │  Dictation   │    │   Voice Conversation      │   │
│  │  (tap mic)   │    │   (long-press/toggle)     │   │
│  │              │    │                           │   │
│  │  STT → input │    │  STT → auto-submit        │   │
│  │  user sends  │    │  response → TTS → play    │   │
│  │  one-shot    │    │  persistent session       │   │
│  │              │    │  interruption support      │   │
│  └──────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Existing Infrastructure

- `use-voice-input.ts` — Web Speech API STT, continuous=false, interim results
- `MiniWaveform` — real-time frequency bar visualization (22px, foreground color)
- `VoicePill` — input component with mic button, auto-submit on final transcript
- `ChatBitBitFace` — BitBit avatar (animatable)
- SSE streaming in chat-interface — can emit TTS playback events

## What We're Building

### Wave 1: Polished Dictation
*Foundation. Get speech-to-text feeling premium.*

**1.1 — Waveform listening indicator**
Replace the static mic button with inline waveform while recording.
- When `voice.isListening`: swap mic icon for `MiniWaveform` in the button area
- Animate transition (scale in/out) using motion/react
- Red accent ring while active (matching current destructive state)
- File: `voice-pill.tsx` (button swap), no new files

**1.2 — Live transcription preview**
Show what the user is saying in real-time above the input.
- Floating toast/chip above the textarea showing interim transcript
- Fades in on speech start, fades out on submit
- Uses `voice.transcript` (already available from the hook)
- File: `voice-pill.tsx` (add transcript overlay)

**1.3 — Silence-based auto-submit refinement**
Improve the current auto-submit with visual countdown.
- After final transcript, show a brief "Sending..." indicator (the 400ms delay)
- If user starts typing during the delay, cancel auto-submit
- Shrink the waveform back to mic icon during the delay
- File: `voice-pill.tsx` (refine submit flow)

**1.4 — Haptic/audio feedback**
- Subtle sound on recording start/stop (optional, respect system prefs)
- On mobile: navigator.vibrate on start/stop
- File: new `use-voice-feedback.ts` hook

### Wave 2: TTS Response Playback
*BitBit speaks back. The other half of voice.*

**2.1 — TTS API route**
Server-side text-to-speech endpoint.
- `POST /api/voice/synthesize` — accepts text, returns audio stream
- Use OpenAI TTS API (`tts-1` model, `nova` or `alloy` voice)
- Stream audio chunks back as `audio/mpeg`
- Cache short responses (greetings, confirmations) in-memory
- Files: new `src/app/api/voice/synthesize/route.ts`

**2.2 — Client audio playback hook**
Play TTS audio in the browser.
- `useVoicePlayback()` hook: accepts audio URL/blob, manages AudioContext
- States: idle, loading, playing, paused
- Exposes: play(), pause(), stop(), isPlaying, currentTime
- Connects to AudioContext analyser for output waveform (for speaking indicator)
- File: new `src/hooks/use-voice-playback.ts`

**2.3 — Auto-play toggle in chat**
After BitBit responds, optionally read it aloud.
- Per-message speaker icon (tap to play response as audio)
- Global "voice responses" preference (stored in localStorage)
- When enabled + in voice conversation mode: auto-play every response
- File: `voice-pill.tsx` (toggle), `chat-interface.tsx` (per-message button)

**2.4 — Speaking indicator**
Visual feedback while BitBit is speaking.
- BitBit header shows waveform or pulsing indicator during TTS playback
- Reuse `MiniWaveform` with analyser output from playback AudioContext
- File: `bitbit-header.tsx` (conditional waveform)

### Wave 3: Voice Conversation Mode
*Persistent, hands-free, multi-turn voice. The main event.*

**3.1 — Voice session state machine**
Unified state management for the full voice loop.
- States: `idle` → `listening` → `processing` → `speaking` → `listening` (loop)
- `useVoiceSession()` hook orchestrating STT + submit + TTS + playback
- Manages turn-taking: mute STT while TTS is playing, resume after
- Auto-restart listening after TTS completes (persistent session)
- Exit on explicit user action (tap X, press Escape)
- File: new `src/hooks/use-voice-session.ts`

**3.2 — VAD improvements**
Better end-of-speech detection.
- Configurable silence threshold (default 1.5s)
- Audio energy monitoring via AnalyserNode (supplement Web Speech API)
- Ignore ambient noise below energy floor
- Future: semantic VAD via server-side model (like ChatGPT's eagerness parameter)
- File: enhance `use-voice-input.ts` or new `src/lib/voice/vad.ts`

**3.3 — Interruption support**
User speaks while BitBit is talking.
- Detect voice input during TTS playback
- Immediately: stop TTS, cancel pending audio chunks, switch to listening
- The interrupted response text stays in chat (already streamed)
- New user input starts a fresh turn
- File: `use-voice-session.ts` (interruption logic)

**3.4 — Inline voice mode UI**
Voice conversation lives inside the chat, not a separate overlay.
- Chat messages continue appearing during voice mode
- Input area transforms: textarea collapses, waveform expands center, X to exit
- BitBit header animates during speaking state
- Subtle background tint or border glow indicating voice mode is active
- Mobile: prevent keyboard from showing during voice mode
- File: `voice-pill.tsx` (mode transform), `chat-interface.tsx` (voice mode state)

**3.5 — Voice mode activation gesture**
How to enter voice conversation mode.
- Long-press mic button (>500ms) enters voice conversation mode
- Visual: mic button scales up, waveform expands, haptic feedback
- Alternative: double-tap mic
- Voice mode indicator in chat header ("Voice mode active")
- File: `voice-pill.tsx` (gesture detection)

### Wave 4: Differentiation
*BitBit-specific patterns that no one else does.*

**4.1 — Dual-channel output (Perplexity pattern)**
While BitBit speaks the response, show tool activity on screen.
- TTS plays the summary/answer text
- Simultaneously: tool calls, search results, data appear in chat
- User hears the answer AND sees the evidence
- Requires: TTS to run concurrently with streaming (not after)
- File: `use-voice-session.ts` (concurrent stream + TTS), `chat-interface.tsx`

**4.2 — BitBit face animation**
The BitBit avatar responds to voice state.
- Listening: subtle pulse/breathe animation on the face
- Thinking: face shifts to a processing state (subtle movement)
- Speaking: mouth/waveform overlay synced to TTS audio output
- Idle: static face
- Uses CSS animations keyed to voice session state
- File: `chat-bitbit-face.tsx` (state-driven animation)

**4.3 — Contextual voice intelligence**
BitBit adapts its voice behavior to context.
- Short confirmations ("Done", "Got it") don't need TTS — just show text
- Long responses automatically summarize for voice, full text in chat
- Agent decides voice vs text based on response type (data tables → text only)
- File: server-side in `ai-sdk-bridge.ts` (voice hint in response metadata)

**4.4 — Background voice (mobile)**
Voice session continues when app is backgrounded.
- Web Audio API + service worker for persistent audio
- Push notification for BitBit's response if app is backgrounded
- Resume voice session when app returns to foreground
- File: new service worker integration, `use-voice-session.ts`

## Execution Order

```
Wave 1 (dictation polish)     → 1.1 → 1.2 → 1.3 → 1.4
Wave 2 (TTS playback)         → 2.1 → 2.2 → 2.3 → 2.4
Wave 3 (voice conversation)   → 3.1 → 3.2 → 3.3 → 3.4 → 3.5
Wave 4 (differentiation)      → 4.1 → 4.2 → 4.3 → 4.4
```

Each wave builds on the previous. Wave 1 can ship independently.
Wave 2 requires the TTS API key (OpenAI). Waves 3-4 are incremental.

## Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| STT engine | Web Speech API (browser native) | Zero cost, good enough for dictation. Upgrade to Deepgram/Whisper for accuracy later. |
| TTS engine | OpenAI TTS API (`tts-1`) | Best quality-to-latency ratio. `nova` voice is warm and natural. ~$15/1M chars. |
| Audio transport | Streaming audio/mpeg from API route | Low latency, progressive playback. No waiting for full generation. |
| VAD | Silence-based (1.5s), upgrade to semantic later | Simple, reliable. Semantic VAD needs a server-side model. |
| State management | React hook (`useVoiceSession`) | Colocated with UI, no global state needed. |
| Waveform | Existing `MiniWaveform` + AudioContext AnalyserNode | Already built, proven, performant. |
