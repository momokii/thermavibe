# Out of Scope

> **Document ID:** PRD-07
> **Version:** 1.0
> **Status:** Approved
> **Last Updated:** 2026-04-04

This document explicitly lists features and capabilities that are **not** being built as part of VibePrint OS Phase 1. For each item, the rationale for exclusion is provided. Items are categorized by whether they may be revisited in a future phase or are permanently out of scope.

---

## Table of Contents

1. [Permanently Out of Scope](#1-permanently-out-of-scope)
2. [Phase 2 Candidates](#2-phase-2-candidates)
3. [Under Consideration](#3-under-consideration)

---

## 1. Permanently Out of Scope

These items are not planned for any future phase of VibePrint OS. They fall outside the product vision or would fundamentally change the nature of the project.

### 1.1 Mobile Companion App

**What it is:** A mobile application (iOS/Android) that users could download to interact with the kiosk, view past sessions, receive digital copies of their vibe readings, or access additional features from their phone.

**Why it is out of scope:**
A mobile application would require an entirely separate development track with its own design system, app store submissions, push notification infrastructure, and ongoing maintenance for two additional platforms. It would also require user accounts (see section 2.3), which contradicts the anonymous, walk-up nature of the kiosk experience. The core value proposition of VibePrint OS is a zero-friction physical interaction -- requiring users to download an app before using the kiosk would defeat that purpose. The receipt itself serves as the "takeaway" artifact. If digital delivery is desired in the future, a simpler approach like QR-code-based download links (no app required) would be more appropriate.

### 1.2 User Accounts or Loyalty Program

**What it is:** A system for users to create accounts, log in, accumulate points, track session history, earn rewards, or unlock premium features based on repeat usage.

**Why it is out of scope:**
VibePrint OS is designed as an anonymous, walk-up experience in public spaces. Requiring user identification (phone number, email, social login) adds friction to every session and creates privacy compliance obligations that conflict with the minimal-data-retention privacy model. A loyalty program would require persistent user identity, session history tracking across visits, and reward management logic -- all of which are substantial features that change the product from a simple fun experience into a customer relationship management platform. The operator's business model (per-session transaction) does not require user accounts. If operators want to offer repeat-visitor incentives, they can handle this through their own separate systems outside of VibePrint OS.

### 1.3 Video Recording or GIF Generation

**What it is:** The ability to record short video clips or animated GIFs instead of (or in addition to) still photos, which would then be printed or shared.

**Why it is out of scope:**
Thermal receipt printers output static images on paper. They cannot print video or animations. While GIFs could theoretically be displayed on screen or shared digitally, this would require significant changes to the capture pipeline (video recording instead of still capture), the AI analysis pipeline (analyzing video frames vs. a single image), and the output pipeline. The physical receipt is the core product artifact, and it is inherently static. Adding video/GIF support would shift the product toward a different category (video booth) and substantially increase complexity without a clear use case for thermal paper output.

### 1.4 Social Media Direct Posting Integration

**What it is:** Allowing users to authenticate with Instagram, Twitter/X, TikTok, or other social platforms and have the kiosk post their photo and vibe reading directly to their feed or story.

**Why it is out of scope:**
Direct social media posting requires OAuth authentication flows, which are cumbersome on a shared public kiosk. Each user would need to log in to their social media account on a shared device, which is a security risk (even with logout after posting). Social platform APIs have strict requirements for app review, rate limits, and content moderation that would add ongoing compliance burden. The receipt itself is a physical, shareable artifact -- users can photograph their receipt and post it manually if they wish, which requires zero integration work and carries no security risk for the kiosk operator.

### 1.5 Cash or Coin Acceptor Hardware Integration

**What it is:** Support for physical cash payment through a coin acceptor, bill validator, or similar hardware device connected to the kiosk.

**Why it is out of scope:**
Cash payment hardware requires specialized peripherals (coin mechs, bill validators) that add significant cost, physical complexity, and maintenance burden to the kiosk. These devices are prone to jams, wear, and vandalism. Cash handling introduces security concerns (physical cash storage, collection schedules, theft risk) and accounting complexity. QRIS-based digital payment is the dominant payment method in Indonesia and is far more practical for a self-service kiosk. The target deployment environments (cafes, events) already assume digital payment infrastructure. Supporting cash would require a fundamentally different hardware and software architecture.

### 1.6 Facial Recognition or Biometric Storage

**What it is:** Identifying users by their face, storing facial embeddings, recognizing returning visitors, or using biometric data for any purpose beyond the immediate AI vibe analysis.

**Why it is out of scope:**
Facial recognition raises serious ethical, legal, and privacy concerns. Indonesia's Personal Data Protection Law (UU PDP) imposes strict requirements for biometric data processing. Storing facial embeddings would require explicit informed consent, which is impractical on a walk-up kiosk. The public deployment context (cafes, events) means people may be captured on camera without their awareness, creating additional consent challenges. VibePrint OS's privacy model is built on minimal data retention and ephemeral processing -- biometric storage would fundamentally contradict this model. Additionally, facial recognition adds no value to the core product experience (each session is independent and anonymous).

---

## 2. Phase 2 Candidates

These items are not in scope for Phase 1 but may be considered for a future release. They have been identified as potentially valuable enhancements based on operator feedback or natural product evolution.

### 2.1 Multi-Language / Internationalization (i18n) Support

**What it is:** Translating the kiosk user interface, AI prompts, and receipt output into multiple languages (e.g., Indonesian, English, Japanese, Chinese) with automatic or manual language selection.

**Why it is out of scope for Phase 1:**
Phase 1 targets the Indonesian market, where the primary audience is comfortable with English or Bahasa Indonesia. Implementing i18n properly requires: extracting all user-facing strings into translation files, supporting right-to-left text layouts for some languages, ensuring the AI prompt generates responses in the selected language, and handling localized date/time/currency formats on receipts. This is a non-trivial effort that does not affect the core functionality. Phase 1 will use English as the default language with a hardcoded Indonesian-language option for the most visible UI elements. A proper i18n framework (e.g., `react-i18next` for the frontend, Python `gettext` for the backend) can be introduced in Phase 2 when there is a clear market demand.

**Phase 2 prerequisite:** Identify target languages based on operator deployment locations and user demographics.

### 2.2 Cloud-Hosted Deployment

**What it is:** Running the VibePrint OS backend on a cloud provider (AWS, GCP, Azure) instead of exclusively on a local machine attached to the kiosk hardware.

**Why it is out of scope for Phase 1:**
The kiosk hardware (printer, camera) requires direct USB access, which means the backend must run on the same physical machine. Cloud hosting the backend while keeping the hardware interface local would require a local agent/service that communicates with the cloud backend over the internet, adding latency, complexity, and a dependency on internet connectivity for the kiosk to function. Phase 1 is designed as a fully self-contained Docker deployment on a single machine. Cloud hosting becomes relevant only if there is a need for centralized management of multiple kiosks (see item 2.5).

**Phase 2 prerequisite:** Multi-kiosk management requirement from operators.

### 2.3 Custom Receipt Paper Sizes Beyond 58mm and 80mm

**What it is:** Support for additional thermal paper widths such as 44mm (mini printers), 110mm (wide format), or non-standard sizes.

**Why it is out of scope for Phase 1:**
The 58mm and 80mm paper sizes cover the vast majority of affordable ESC/POS thermal printers available on the market. Supporting additional sizes requires: different image dithering dimensions, different text wrapping calculations, potentially different ESC/POS command variants, and testing on each paper size. Each additional paper width multiplies the testing surface area. Phase 1 focuses on the two most common sizes. Additional sizes can be added in Phase 2 based on operator demand.

**Phase 2 prerequisite:** Operator requests for specific paper sizes not currently supported.

### 2.4 Thermal Printer Network (TCP/IP) Support

**What it is:** Connecting to the thermal printer over a network (Ethernet or Wi-Fi) using the ESC/POS network protocol, instead of exclusively USB.

**Why it is out of scope for Phase 1:**
USB is the simplest and most reliable connection method for a single-kiosk deployment where the printer is physically attached to the same machine. Network printing adds configuration complexity (IP addresses, network discovery, firewall rules) and introduces latency and reliability concerns (network congestion, packet loss, printer going offline). USB printing is zero-configuration: plug in the printer and it works. Network printing is valuable when the printer needs to be physically distant from the kiosk computer (e.g., behind a counter), which is a Phase 2 use case.

**Phase 2 prerequisite:** Operators with deployment scenarios where the printer cannot be co-located with the kiosk computer.

### 2.5 Multi-Kiosk Centralized Management Dashboard

**What it is:** A web-based dashboard that allows a single operator to monitor and manage multiple VibePrint OS kiosks from one location, including real-time status, remote configuration, analytics aggregation, and alerting.

**Why it is out of scope for Phase 1:**
Phase 1 is designed for a single kiosk managed by a single operator. The admin dashboard at `/admin` runs locally on the kiosk machine. A centralized management dashboard requires: a cloud-hosted backend to aggregate data from multiple kiosks, a secure communication channel between each kiosk and the cloud (e.g., MQTT, WebSocket), a multi-tenant data model, user authentication for the management dashboard, and role-based access control. This is essentially a separate product that sits on top of VibePrint OS. Phase 1 establishes the foundation (local analytics, per-kiosk configuration, API endpoints) that a centralized dashboard could consume in Phase 2.

**Phase 2 prerequisite:** Operators managing two or more kiosks who need consolidated oversight.

---

## 3. Under Consideration

These items are actively being discussed for potential inclusion in a future phase. They are not committed to any release but are being tracked for their potential impact on the architecture.

### 3.1 Audio Output / Text-to-Speech for Countdown

**What it is:** Playing audio cues during the kiosk flow, such as spoken countdown ("3... 2... 1..."), sound effects, or a text-to-speech reading of the AI vibe result.

**Why it is under consideration:**
Audio can enhance the user experience by making the countdown more engaging and providing accessibility for visually impaired users. However, adding audio support introduces dependencies on ALSA or PulseAudio for Linux audio output, which must be properly configured in the Docker container (device passthrough for the sound card). Audio also raises concerns about noise in the deployment environment -- a kiosk in a quiet cafe should not be loudly counting down. Volume control and the ability to disable audio entirely would be essential. Text-to-speech for reading the AI result adds latency and complexity. The architecture should be designed to support audio as an optional module that can be enabled or disabled via configuration, even if it is not implemented in Phase 1.

**Open question:** See OQ-003 in the Open Questions document for the detailed discussion on this topic.

### 3.2 Real-Time Remote Monitoring / OTA Updates

**What it is:** The ability for operators to remotely view the kiosk's live status (camera feed, current state, error logs), receive push notifications for errors, and push software updates over the air without physical access to the kiosk.

**Why it is under consideration:**
Remote monitoring is highly valuable for operators who manage kiosks in locations they cannot physically visit frequently (e.g., event spaces, mall locations). OTA updates reduce the operational cost of maintaining multiple kiosks. However, implementing this securely requires: a persistent secure tunnel from the kiosk to a monitoring server, encrypted communication, authentication for the monitoring interface, a safe update mechanism (rollback on failure, update verification), and careful consideration of privacy (the operator should not be able to view user photos remotely). The current architecture (single-machine Docker deployment) can be extended to support this, but it requires careful design to avoid creating a remote access vector that could be exploited.

**Open question:** This feature depends on whether multi-kiosk management (item 2.5) becomes a priority. If only one kiosk is being managed, physical access for monitoring and updates is sufficient.

---

## Summary Table

| # | Feature                                | Phase 1 | Phase 2+ | Never |
|---|----------------------------------------|---------|----------|-------|
| 1 | Mobile companion app                   |         |          | Yes   |
| 2 | User accounts or loyalty program       |         |          | Yes   |
| 3 | Video recording or GIF generation      |         |          | Yes   |
| 4 | Social media direct posting            |         |          | Yes   |
| 5 | Cloud-hosted deployment                |         | Maybe    |       |
| 6 | Custom paper sizes beyond 58mm/80mm    |         | Maybe    |       |
| 7 | Cash or coin acceptor integration      |         |          | Yes   |
| 8 | Facial recognition or biometric storage|         |          | Yes   |
| 9 | Multi-kiosk centralized dashboard      |         | Maybe    |       |
|10 | Thermal printer network (TCP/IP)       |         | Maybe    |       |
|11 | Multi-language / i18n support          |         | Maybe    |       |
|12 | Audio output / TTS for countdown       |         | Maybe    |       |
|13 | Real-time remote monitoring / OTA      |         | Maybe    |       |

---

## Architectural Notes

While these features are out of scope for Phase 1, the architecture should avoid decisions that would make them difficult to add later:

1. **Modular design:** Each major subsystem (AI, payment, printing, camera) is implemented as an independent module behind an interface. New providers or capabilities can be added without modifying existing code.

2. **Configuration-driven behavior:** All optional features (payment, audio, multi-language) are controlled by configuration. Adding a new feature often means adding new configuration keys and the corresponding code path, rather than restructuring the application.

3. **API-first backend:** The FastAPI backend exposes all functionality through well-defined REST endpoints. A future mobile app, centralized dashboard, or cloud service can consume these same endpoints.

4. **Privacy-conscious data model:** The data retention and cleanup system can be extended to support more complex retention policies without schema changes.

5. **Docker-based deployment:** The containerized deployment model makes it straightforward to add new services (e.g., an MQTT broker for remote monitoring) to the `docker-compose.yml` stack.
