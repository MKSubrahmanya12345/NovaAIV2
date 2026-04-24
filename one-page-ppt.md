# NovaAI x Athernex PPT Fill

This is the same 9-slide plan, just cleaned up so it reads like notes instead of a spreadsheet.

## 1. Cover

- Title: NovaAI
- Tagline: From idea to Wokwi-backed hardware prototype in one continuous loop
- Subline: AI-guided ideation, circuit/code generation, simulation, and debug

Keep this slide clean. No team details, no features, no tech stack.

## 2. Team Check-in

- Team name
- Member names and roles
- Email, phone, college
- One short line: built for faster hardware prototyping under hackathon constraints

Keep this slide strictly about people. Do not repeat the problem or solution.

## 3. Problem Statement

- Hardware prototyping is split across too many tools and too many handoffs
- Idea, component planning, circuit wiring, firmware, and Wokwi simulation do not stay in one place
- Context gets lost between steps, so iteration slows down and debugging becomes guesswork

This slide should feel like the friction before the product exists.

## 4. Solution

- NovaAI is a hardware-build ecosystem, not just a chat box
- It turns natural language into structured project state across ideation, components, and design
- It generates Wokwi-ready artifacts like diagram.json and sketch.ino
- It uses live Wokwi context so design decisions match the actual circuit, not a stale guess

This is the big shift: from describing hardware to actually building it.

## 5. Features

- Stage-aware build flow: ideation -> components -> design -> build
- Wokwi-backed circuit generation: outputs diagram.json and sketch.ino from the project context
- Voice-assisted design loop: talk through changes, debug faster, and keep momentum
- Simulation and validation: local files, Wokwi URL context, and run-time checks keep the build grounded

Keep this slide sharp. Use only the strongest capabilities.

## 6. Flow Chart

- User intent
- AI ideation state
- Components planning
- Generate Wokwi circuit and firmware files
- Design guidance with live Wokwi context from local files or project URL
- Compile / simulate / scenario run
- Debug output with serial tail, screenshots, and saved project evidence

This slide should be the runtime story in one line.

## 7. Tech Stack

- Frontend: React, Zustand, Axios, voice-driven UI hooks
- Backend: Node.js, Express, Mongoose, JWT auth, route-guarded controllers
- AI / Voice: Groq, Deepgram STT, ElevenLabs TTS
- Hardware runtime: Wokwi CLI, Wokwi MCP, Arduino CLI, local file sync for diagram.json and sketch.ino
- Data: project state, chat timelines, and simulation evidence in MongoDB

Keep this technical, but short.

## 8. Impact

- Speed: compresses the hardware idea-to-Wokwi cycle
- Clarity: keeps project context structured across ideation, design, and simulation
- Reliability: the output is tied to real circuit files and run results, not just chat text
- Adoption fit: useful for student teams, labs, and rapid hardware PoCs

This is the value slide. No stack, no flow, no feature dump.

## 9. Thank You

- Closing line: Build hardware like software: think, generate, simulate, prove
- Add contact details and QR here
- Optional invite: ask us to run a live Wokwi simulation now

Keep this slide strong and minimal.

---

## Presenter Tone

- Keep it ecosystem-first
- Keep it semi-technical, not corporate
- Sound like execution, not generic AI hype
- Mention Wokwi naturally when talking about simulation or validation

## Transition Flow

- 1 -> 2: who built this
- 2 -> 3: why this matters
- 3 -> 4: what we built
- 4 -> 5: what it can do
- 5 -> 6: how it works
- 6 -> 7: what powers it
- 7 -> 8: why it matters in practice
- 8 -> 9: close with proof
