# Open Questions and Assumptions

> **Document ID:** PRD-08
> **Version:** 1.0
> **Status:** Active
> **Last Updated:** 2026-04-04

This document tracks open questions that have not yet been definitively resolved, along with the assumptions the team is proceeding with until each question is answered. For each question, the document explains what is unclear, the current working assumption, and why the resolution matters for downstream design and implementation decisions.

Open questions are assigned an identifier (OQ-XXX) for easy cross-referencing in code comments, commit messages, and other documentation.

---

## Table of Contents

1. [Active Open Questions](#1-active-open-questions)
2. [Resolved Questions](#2-resolved-questions)
3. [Assumption Register](#3-assumption-register)

---

## 1. Active Open Questions

### OQ-001: Which QRIS provider will be the primary integration target?

**What is unclear:**
There are multiple QRIS payment aggregators available in Indonesia (Midtrans, Xendit, Duitku, Tripay, and others). Each has different API designs, pricing structures, sandbox environments, onboarding processes, and webhook implementations. Choosing one as the primary integration target affects the payment adapter implementation, testing strategy, documentation, and operator setup instructions.

**Current assumption:**
Midtrans will be the primary QRIS integration target, with Xendit added as a secondary option. Midtrans is the most widely used payment gateway in Indonesia, has comprehensive documentation, offers a reliable sandbox environment, and has strong developer support. The mock provider will be used for development and testing. Xendit integration will be built after Midtrans is stable.

**Why it matters downstream:**
- The payment adapter interface must be generic enough to support both providers without significant refactoring.
- The webhook endpoint structure may differ between providers (Midtrans sends the full transaction object; Xendit wraps it in an event envelope).
- The admin dashboard setup wizard needs provider-specific configuration screens (different field names, different sandbox URLs, different key formats).
- Operator documentation and onboarding materials will be written for Midtrans first.
- If Midtrans and Xendit have different QR code expiration behaviors, the polling and timeout logic must account for both.

**Decision criteria:**
- Operator preference (if early adopters have an existing relationship with a specific provider)
- API reliability and uptime SLA
- Pricing (transaction fees)
- Ease of sandbox testing
- Webhook reliability and delivery guarantees

**Target resolution:** Before the start of payment integration implementation.

---

### OQ-002: What is the exact thermal printer model for initial testing and development?

**What is unclear:**
ESC/POS thermal printers vary in their implementation details even though they nominally support the same protocol. Differences in USB VID/PID, command support (some commands may be unsupported or behave differently), paper feed calibration, print density, and image quality can affect the development and testing experience. The team needs a specific printer model to test against during development.

**Current assumption:**
The Xprinter XP-58IIH (58mm paper width) will be the primary development and testing printer. This model is widely available, inexpensive (approximately $25-40 USD), uses standard ESC/POS commands, and has USB VID `0x0525` / PID `0xa700`. A secondary test with an 80mm printer (Xprinter XP-80C or Epson TM-T20II) will be conducted before release to verify 80mm paper width support.

**Why it matters downstream:**
- USB auto-detection logic depends on the correct VID/PID combination.
- The dithering pipeline output must be tested on actual printed output, not just in software. Print quality varies based on the printer's DPI, print head condition, and paper quality.
- The `python-escpos` library has been tested with many printer models, but edge cases in specific models can cause unexpected behavior (e.g., partial image printing, incorrect paper cutting).
- The Docker USB passthrough configuration must be validated with the specific printer model.
- Print speed varies between models and affects the overall session timing (if printing takes 10 seconds vs. 3 seconds, the user waits longer).

**Decision criteria:**
- Local availability in Indonesia (where most operators are based)
- Price point accessible to operators
- Known compatibility with `python-escpos`
- Community support and documentation

**Target resolution:** Purchase printer for development within the first sprint.

---

### OQ-003: Should the kiosk support audio output for the countdown?

**What is unclear:**
Adding audio output (spoken countdown "3... 2... 1...", camera shutter sound effect, or text-to-speech reading of the AI result) would enhance the user experience but introduces additional dependencies and complexity. The question is whether the benefit outweighs the cost for Phase 1.

**Current assumption:**
No audio output in Phase 1. The visual countdown (large numbers on screen with animation) is sufficient for the initial release. Audio support is deferred to Phase 2 when the UX can be tested with real users and the specific audio requirements are better understood.

**Why it matters downstream:**
- Audio requires ALSA or PulseAudio configuration in the Docker container, which adds complexity to the deployment.
- Not all kiosk hardware will have speakers or audio output capability, so audio must be optional and gracefully degrade when no audio device is detected.
- If audio is added later, the frontend state machine must emit events at specific points (countdown start, each second, capture moment, result reveal) that an audio module can listen to. Designing for this from the start (event bus pattern) costs little but saves significant refactoring later.
- Audio in a public space raises volume management concerns -- the operator should be able to control volume or mute the kiosk entirely.
- Text-to-speech for reading the AI result would require a TTS engine (e.g., Coqui TTS, pyttsx3, or a cloud TTS API), adding another integration and potential latency.

**Decision criteria:**
- User testing feedback from early deployments
- Operator preference (is audio wanted or unwanted in their venue?)
- Whether the event bus architecture is in place to support audio as an optional module
- Availability of a lightweight, offline TTS solution for the AI result reading

**Target resolution:** Evaluate after initial operator feedback from Phase 1 deployments.

---

### OQ-004: What is the maximum acceptable print queue length before refusing new sessions?

**What is unclear:**
If printing is slow (e.g., a complex image on a low-speed printer takes 10+ seconds) and the user does not tear off their receipt before the next user starts a session, should the system queue multiple print jobs or refuse new sessions until printing is complete? This is a concurrency and resource management question.

**Current assumption:**
A queue depth of 1 -- the print job for the current session must complete (or fail) before the next session can proceed to the REVEAL/PRINT state. The system does not queue multiple print jobs. If a print job is still in progress when a new session reaches the REVEAL/PRINT state, the new session waits (with a timeout) or displays the result on screen without printing.

**Why it matters downstream:**
- A queue depth of 1 simplifies the print job management significantly -- no queue data structure, no priority management, no complex error recovery for queued jobs.
- If the printer is slow or jams, it affects the user experience for the next user only, not a chain of users.
- The REVEAL/PRINT state timeout (15 seconds) must account for the maximum expected print duration. If printing takes 10 seconds and the timeout is 15 seconds, the user gets only 5 seconds to view their result on screen before the system moves on.
- If the queue depth were higher (e.g., 3), the system would need to handle scenarios like: printer jam clears multiple jobs, out-of-paper cancels the entire queue, or power loss loses all queued jobs.
- The admin dashboard should show the current print queue status so the operator can intervene if the printer is stuck.

**Decision criteria:**
- Real-world print duration testing with the target printer and image complexity
- Operator feedback on whether they expect back-to-back usage or spaced-out usage
- Whether the 15-second REVEAL/PRINT timeout is sufficient for the typical print duration

**Target resolution:** Determine during print integration testing with the actual hardware.

---

### OQ-005: Should analytics be stored locally only, or should there be an optional cloud sync for multi-kiosk?

**What is unclear:**
Analytics data (session events, print job status, AI usage, payment transactions) is currently stored only in the local PostgreSQL database. If an operator deploys multiple kiosks, they cannot see aggregated analytics across all locations. The question is whether Phase 1 should include any form of remote analytics sync.

**Current assumption:**
Local only in Phase 1. All analytics data resides in the PostgreSQL database on the kiosk machine. Operators can access analytics through the local admin dashboard (`/admin` route). No cloud sync or centralized analytics aggregation is included. This keeps the system simple, self-contained, and avoids the privacy and security implications of transmitting user data (including photo event metadata) to external servers.

**Why it matters downstream:**
- Local-only analytics means each kiosk is a data silo. Operators with multiple kiosks must visit each kiosk's admin dashboard separately to view analytics.
- If cloud sync is deferred to Phase 2, the local analytics schema must be designed to be sync-friendly (e.g., using UUIDs as primary keys, including timestamps on all records, avoiding auto-increment IDs that could collide across kiosks).
- The analytics event schema (see PRD-05) already uses UUIDs and includes timestamps, which positions it well for future sync capability.
- Privacy implications: syncing analytics that include session metadata (even without photos) to a cloud server may require user consent or regulatory compliance in some jurisdictions.
- The admin dashboard should export analytics data in a standard format (CSV or JSON) so operators can manually aggregate data across kiosks if needed.

**Decision criteria:**
- Whether multi-kiosk operators request centralized analytics
- Privacy regulation review for transmitting session metadata to cloud
- Availability of a simple, secure sync mechanism (e.g., periodic CSV upload, PostgreSQL logical replication)

**Target resolution:** Evaluate after Phase 1 operators deploy multiple kiosks.

---

### OQ-006: What is the pricing model for operators?

**What is unclear:**
VibePrint OS is open-source, but the question of how operators are charged for using the software (if at all) affects the architecture. Options include: free and open-source with no restrictions, a flat fee per session, a variable fee based on usage (e.g., number of AI API calls, pages printed), or a subscription model.

**Current assumption:**
Flat fee per session, configurable by the operator via the admin dashboard. The operator sets the price that end users pay (via QRIS), and the operator keeps 100% of the revenue. VibePrint OS itself does not collect any fees. The operator is responsible for all costs: AI API usage, payment gateway fees, paper and ink, hardware, and electricity.

**Why it matters downstream:**
- If VibePrint OS charged a per-session fee, the system would need a licensing server, usage reporting, and enforcement mechanisms (e.g., the kiosk stops working if the license expires).
- The current assumption (no fees) means the architecture does not need any licensing or DRM infrastructure, which keeps it simple and aligned with the open-source philosophy.
- The operator-configurable price per session is already supported by the `payment.amount` configuration key.
- If a future "hosted" or "managed" version of VibePrint OS is offered (where the team provides setup, monitoring, and support for a fee), that would be a separate business model that does not affect the open-source core.

**Decision criteria:**
- Community feedback on monetization expectations
- Whether operators want a managed/hosted version of the software
- Whether the project needs revenue to sustain development

**Target resolution:** This is a business decision that does not block Phase 1 development. Revisit after initial operator deployments.

---

### OQ-007: What happens if the printer runs out of paper mid-session?

**What is unclear:**
A thermal printer running out of paper mid-print is a common hardware failure scenario. The question is how the system detects this condition, how it responds, and what the user and operator experience should be.

**Current assumption:**
The session is marked as partially complete (the user sees the result on screen but does not receive a physical receipt). The print job is marked as `failed` with `error_message = "paper_out"`. The operator is alerted via the admin dashboard (a notification banner appears on the `/admin` page). The user does not see a system error message -- they see their result on screen with a note like "Receipt could not be printed. Please ask staff for assistance."

**Why it matters downstream:**
- Paper-out detection is not reliable across all printer models. Some ESC/POS printers report paper status via a status pin, but USB-only printers may not support this. The system may need to detect paper-out indirectly (e.g., the print command succeeds but produces no output, or the printer returns an error after the cut command).
- If payment was confirmed and the printer runs out of paper, the operator is in a difficult position: the user has paid but not received the full product. The system should log this clearly for the operator to handle manually (e.g., reprint when paper is loaded, or issue a refund).
- The admin dashboard should have a "reprint last session" button for operators to reprint a recent session's receipt after loading new paper.
- The `photo_path` and `ai_response_text` fields in the session record are retained until the session is cleared, which enables reprinting. However, the RESET state clears these. The system should either delay the RESET until the print is confirmed, or preserve the data in a "reprint buffer" for a configurable period after reset.
- The UI should handle this gracefully: the user should never feel like the system "broke." A simple "Please see staff" message with the on-screen result is sufficient.

**Decision criteria:**
- Testing with the actual printer model to determine paper-out detection capabilities
- Operator feedback on how they want to handle this scenario (auto-retry after paper load, manual reprint, refund policy)

**Target resolution:** Determine during hardware integration testing.

---

### OQ-008: How should operators access the admin dashboard?

**What is unclear:**
The admin dashboard needs to be accessible to operators for configuration, monitoring, and troubleshooting. The question is about the access method: should it be accessible only through a hidden gesture on the kiosk touch screen, only through a separate URL on a browser, or both?

**Current assumption:**
Both methods are supported. Method 1: A hidden gesture (long-press for 3 seconds on the bottom-left corner of the idle screen) opens the admin dashboard as a full-screen overlay on the kiosk. Method 2: A separate `/admin` route accessible from any browser on the same network (e.g., `http://192.168.1.100:8000/admin`). Both methods require PIN authentication.

**Why it matters downstream:**
- The hidden gesture method requires the frontend to listen for a specific touch pattern on the idle screen without interfering with the normal "touch anywhere to start" behavior. The long-press on a specific corner is unlikely to be triggered accidentally by users.
- The separate URL method requires the backend to serve the admin dashboard as a web application accessible over the local network. This means the admin dashboard must be a separate React route or a separate build output served by the FastAPI backend.
- PIN authentication must be implemented consistently across both access methods. The PIN is stored as a hash in the `operator_configs` table.
- The on-screen admin dashboard must be optimized for touch interaction (large buttons, scrollable lists, touch-friendly input fields), while the browser-based admin dashboard can be optimized for mouse and keyboard.
- Both methods should have session timeout (e.g., 15 minutes of inactivity returns to the idle screen or logs out).
- Security consideration: if the kiosk is on a public Wi-Fi network, the `/admin` route should be protected by the PIN and ideally by network-level access control (e.g., the kiosk's Wi-Fi is password-protected). The admin dashboard should not be accessible from the internet without a VPN or similar security measure.

**Decision criteria:**
- Operator feedback on preferred access method
- Whether operators typically carry a laptop/tablet to the kiosk location
- Security requirements for the deployment environment

**Target resolution:** Confirm before admin dashboard implementation begins.

---

## 2. Resolved Questions

This section tracks questions that were previously open and have been resolved. They are kept here for historical reference and to document the decision-making process.

*(No resolved questions at this time. As decisions are made, they will be moved from Section 1 to this section with the resolution details.)*

---

## 3. Assumption Register

The following table consolidates all working assumptions from the open questions above, along with any additional assumptions that are implicit in the current design but have not been raised as formal questions.

| ID     | Assumption                                                                                       | Risk Level | Impact if Wrong                                      |
|--------|--------------------------------------------------------------------------------------------------|------------|------------------------------------------------------|
| OQ-001 | Midtrans is the primary QRIS provider                                                            | Low        | Payment adapter may need refactoring for Xendit-first approach |
| OQ-002 | Xprinter XP-58IIH is the development printer (VID: 0x0525, PID: 0xa700)                         | Low        | USB auto-detection defaults may need updating        |
| OQ-003 | No audio output in Phase 1                                                                       | Low        | UX may feel less polished; can be added later        |
| OQ-004 | Print queue depth is 1 (no queuing)                                                              | Medium     | High-traffic venues may experience bottlenecks; redesign needed |
| OQ-005 | Analytics are local-only in Phase 1                                                              | Low        | Multi-kiosk operators cannot see aggregated data     |
| OQ-006 | No per-session fee for VibePrint OS itself                                                       | Low        | Licensing infrastructure would need to be added       |
| OQ-007 | Paper-out: session marked partially complete, operator alerted, user sees on-screen result        | Medium     | User experience may be confusing; refund complexity  |
| OQ-008 | Admin dashboard accessible via both hidden gesture and separate /admin URL                        | Low        | One access method could be removed without major impact |
| A-001  | Target OS is Ubuntu 22.04 LTS or Debian 12                                                      | Low        | Docker should abstract most OS differences           |
| A-002  | Operators have internet access for AI API calls and payment gateway                              | Medium     | Offline mode would need local AI (Ollama) + no payment |
| A-003  | Kiosk screen resolution is 1080p (1920x1080) or higher                                           | Low        | Lower resolutions would need responsive layout adjustments |
| A-004  | Users are comfortable interacting with a touch-screen kiosk in a public space                    | Low        | On-screen instructions and visual cues mitigate this  |
| A-005  | The AI response will be in English by default                                                    | Low        | i18n support (Phase 2) would add language selection  |
| A-006  | A single Docker Compose stack runs all services (backend, frontend, database) on one machine     | Low        | Multi-machine deployment is out of scope for Phase 1  |
| A-007  | The Python version is 3.11+ and Node.js version is 20+                                          | Low        | Older versions may have compatibility issues          |
| A-008  | The thermal printer supports the standard ESC/POS image raster command (1D 76 30)                 | Medium     | Non-standard printers would need custom drivers      |
| A-009  | Camera MJPEG streaming is supported by the target webcam                                         | Low        | Fallback to raw YUYV streaming if MJPEG unavailable  |
| A-010  | Payment webhook callbacks can be received via polling fallback if direct webhook is unavailable   | Low        | Polling is already implemented as primary mechanism   |

---

## Process for Resolving Open Questions

1. **Identify:** A new open question is identified during design, development, or stakeholder discussion.
2. **Document:** The question is added to this document with an OQ-XXX identifier, a clear description of what is unclear, a working assumption, and downstream impact analysis.
3. **Reference:** The OQ-XXX identifier is used in code comments, pull request descriptions, and commit messages where the assumption affects the implementation (e.g., `# OQ-001: Using Midtrans-specific webhook format; refactor if Xendit becomes primary`).
4. **Review:** Open questions are reviewed at each sprint planning meeting to determine if they need to be escalated for decision.
5. **Resolve:** When a decision is made, the question is moved to Section 2 (Resolved Questions) with the resolution details, date, and decision-maker.
6. **Update:** Any code, documentation, or configuration that relied on the assumption is updated to reflect the final decision.
