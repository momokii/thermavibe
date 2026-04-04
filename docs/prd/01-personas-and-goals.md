# VibePrint OS -- Personas and Goals

**Document Version:** 1.0
**Last Updated:** April 2026
**Status:** Active

---

## 1. End-User Persona: Maya

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Maya Putri |
| **Age** | 19 |
| **Occupation** | University student (communications major) |
| **Location** | Jakarta, Indonesia |
| **Device** | iPhone 15, active on Instagram, TikTok, and Spotify |
| **Income Bracket** | Student budget; discretionary spending on experiences and social outings |

### Demographics

Maya represents the core end-user demographic for VibePrint OS: a digitally native Gen Z consumer who prioritizes experiences over possessions. She spends 3-4 hours daily on social media, follows aesthetic and lifestyle content creators, and actively curates her online presence. She frequents cafes with her friend group 2-3 times per week, often choosing venues based on their Instagrammability and unique offerings. She is comfortable with technology but is not a technical person -- she expects products to "just work" without reading instructions.

### Behaviors

- **Experience-Seeking**: Maya visits cafes specifically for novel experiences. She is drawn to venues that offer something photogenic or interactive beyond standard food and beverage service. A VibePrint kiosk in a cafe provides an immediate, tangible activity that enhances her visit.
- **Social Sharing as Currency**: Maya photographs nearly everything noteworthy during her outings. She does not share content that feels generic or low-quality. The thermal receipt from VibePrint OS, with its distinctive dithered halftone aesthetic and personalized AI text, meets her quality threshold for sharing.
- **Peer Influence**: Maya's choice of cafes and activities is heavily influenced by what she sees on her social media feeds and what her friends recommend. When she shares a VibePrint receipt on her Instagram Story, it functions as an endorsement that drives her friends to seek out the same experience.
- **Impatience with Friction**: If a process requires more than a few steps, Maya will abandon it. She has a low tolerance for slow loading times, confusing interfaces, or processes that require creating an account. The VibePrint kiosk's touch-to-start, touch-to-pay, automatic photo capture flow matches her expectation of instant gratification.
- **Spending Pattern**: Maya is willing to spend IDR 5,000 to IDR 15,000 on a single experience if it produces a tangible or shareable result. She views this as comparable to buying a specialty drink or a dessert -- it is a small indulgence that enhances her outing.

### Pain Points

- **Friction in Photobooth Experiences**: Existing photobooths she has encountered require downloading an app, scanning a QR code and waiting for a link, or standing in a queue with no clear process. She dislikes any step that involves entering her phone number or email address.
- **Generic Output**: Most photobooths produce standard photo strips that look identical to everyone else's. There is nothing personalized or memorable about them, which reduces her desire to share the result.
- **Hidden Costs**: Maya has been frustrated by photobooths that advertise as free but then charge for digital downloads or physical prints. She prefers transparent, upfront pricing.
- **Embarrassment Factor**: If a photobooth is slow or glitches in a public setting, Maya feels embarrassed. She needs the process to feel smooth and polished so she does not look awkward in front of friends or strangers.
- **Privacy Concerns**: Maya is vaguely aware that her photos could be stored or misused. While she is not deeply privacy-conscious, she would be uncomfortable if she learned that a photobooth was uploading her photos to a public server or storing them indefinitely.

### What Success Looks Like for Maya

Maya walks into a cafe and notices a sleek kiosk screen displaying an attractive, animated loop. She touches the screen, sees a clear price (if applicable), and scans a QRIS QR code with her phone's default payment app. Within seconds, the webcam captures her photo. She waits briefly -- no more than 20 seconds -- and watches as a "vibe reading" appears on screen with a fun, witty personality analysis. A thermal printer whirs, and she receives a physical receipt with a stylized dithered photo and the AI-generated text. She smiles, photographs the receipt with her phone, and posts it to her Instagram Story with the venue's location tagged. The entire experience took under 60 seconds and felt effortless, fun, and unique.

---

## 2. Operator Persona: Budi

### Profile

| Attribute | Detail |
|-----------|--------|
| **Name** | Budi Santoso |
| **Age** | 35 |
| **Occupation** | Cafe owner (single location, 40-seat capacity) |
| **Location** | Bandung, Indonesia |
| **Technical Skill** | Comfortable following step-by-step guides; can use a terminal but does not write code |
| **Motivation** | Passive income, customer experience differentiation |

### Demographics

Budi represents the primary operator demographic for VibePrint OS: a small business owner in a mid-sized Indonesian city who is looking for ways to increase revenue per customer visit without hiring additional staff or investing in major renovations. He runs a specialty coffee shop that attracts a younger demographic, and he is always evaluating new experiential additions to keep his venue fresh and competitive. He has heard about photobooths from other cafe owners in his network but has been deterred by the high upfront cost of commercial solutions.

### Behaviors

- **Cost-Conscious Decision Making**: Budi evaluates every business investment against its expected return. He is willing to spend IDR 2,000,000 on hardware if he believes it will generate IDR 500,000 or more per month in additional revenue. He needs a clear business case, not just a cool product.
- **Hands-Off Operation Preference**: Once a system is set up, Budi wants it to run without daily intervention. He does not want to hire a dedicated staff member to manage the kiosk. He expects to spend no more than 15-20 minutes per week on kiosk-related tasks (checking revenue, refilling paper, occasional troubleshooting).
- **Progressive Technical Comfort**: Budi can follow a written setup guide that involves entering terminal commands, editing configuration files, and running Docker containers. He cannot write Python or TypeScript code, but he understands concepts like API keys, environment variables, and IP addresses at a practical level.
- **Revenue Monitoring**: Budi checks his business metrics daily -- sales, foot traffic, average transaction value. He expects the VibePrint admin dashboard to show him clear, actionable data: how many sessions today, how much revenue, whether the hardware is functioning, and whether any errors occurred.
- **Community Learning**: Budi learns about new tools and business strategies from his local cafe owners' WhatsApp group and from Indonesian small-business YouTube channels. Word-of-mouth recommendations carry significant weight in his purchasing decisions.

### Pain Points

- **Proprietary Vendor Dependency**: Budi previously considered a commercial photobooth solution but was put off by the requirement to purchase hardware exclusively from the vendor, the monthly software subscription fee, and the inability to customize the experience. He felt locked into a relationship with no exit strategy.
- **Technical Setup Complexity**: Budi has tried DIY solutions before (a Raspberry Pi digital signage project) but abandoned them because the documentation was fragmented, outdated, or assumed too much technical knowledge. He needs a setup process that is thoroughly documented, tested, and assumes no prior experience with the specific technology stack.
- **Hardware Failures in Unattended Environments**: Budi's cafe is open 12 hours a day, and he cannot monitor the kiosk continuously. If the printer jams, the webcam disconnects, or the software crashes, he needs the system to either recover automatically or alert him immediately with a clear error description.
- **Uncertain Revenue Model**: Budi is unsure how to price the VibePrint experience. Should it be free (to drive foot traffic) or paid (to generate direct revenue)? He needs the system to support both models and to make it easy to switch between them.
- **AI Cost Unpredictability**: Budi has read about AI API costs and is worried about unexpected bills if usage spikes. He needs clear visibility into per-session AI costs and the ability to set usage caps or switch to a cheaper/free provider.

### What Success Looks Like for Budi

Budi sets up a VibePrint kiosk in his cafe on a Saturday afternoon, following the written setup guide over approximately 2 hours. He configures his AI provider API key, sets the price to IDR 10,000 per session, and customizes the system prompt to reference his cafe's brand personality. On Monday, he checks the admin dashboard and sees that 23 sessions were completed over the weekend, generating IDR 230,000 in revenue. The dashboard shows no hardware errors and all sessions completed successfully. Over the next month, he notices an increase in foot traffic as customers come in specifically to try the "vibe reading" photobooth. He refills the thermal paper roll once a week (a 30-second task) and spends 5 minutes each morning glancing at the dashboard. His monthly AI API costs are IDR 50,000, and his thermal paper costs are IDR 30,000, yielding a net profit of approximately IDR 1,500,000 on a hardware investment of IDR 2,000,000 that paid for itself in under 6 weeks.

---

## 3. Product Goals

### Goals for End-Users (Maya)

| ID | Goal | Measurable Outcome | Priority |
|----|------|--------------------|----------|
| EG-001 | Complete a full session from start to printed receipt in under 90 seconds | 90th percentile session duration under 90 seconds from touch-to-print | P0 |
| EG-002 | Experience zero confusion about what to do at each step | Fewer than 5% of sessions require any manual intervention or restart | P0 |
| EG-003 | Receive a personalized, unique AI-generated reading every time | 100% of completed sessions produce a unique, non-generic AI response | P0 |
| EG-004 | Walk away with a physical receipt they want to photograph and share | 20% or more of receipts result in a social media share (tracked via branded hashtag) | P1 |
| EG-005 | Never encounter a situation where their photo is visibly stored or accessible to others | Zero instances of photo data persisting beyond the session lifecycle; verified through audit | P0 |
| EG-006 | Complete payment in under 15 seconds when payment is required | 90th percentile payment completion time under 15 seconds | P1 |

### Goals for Operators (Budi)

| ID | Goal | Measurable Outcome | Priority |
|----|------|--------------------|----------|
| OG-001 | Deploy a kiosk in under 3 hours including hardware assembly | Average first-time setup time under 3 hours as measured by self-reported operator onboarding surveys | P0 |
| OG-002 | Monitor kiosk health and revenue from a single dashboard | Admin dashboard displays real-time status for all connected hardware, session count, and revenue; accessible from any device on the local network | P0 |
| OG-003 | Customize the AI prompt without writing any code | Operator can modify the system prompt and preview sample outputs entirely through the web-based admin interface | P1 |
| OG-004 | Switch between paid and free mode without redeploying the system | Payment toggle in admin dashboard takes effect on the next session with zero downtime | P1 |
| OG-005 | Receive automated alerts when hardware malfunctions | Admin dashboard displays real-time hardware status; configurable alerts for printer offline, camera disconnected, or storage low | P1 |
| OG-006 | Understand per-session costs and profitability | Admin dashboard displays cost breakdown (AI API cost, thermal paper estimate) alongside revenue per session and per day | P2 |
| OG-007 | Replace a broken hardware component without software reconfiguration | Swapping a webcam or printer of the same class (UVC/ESC-POS) requires no software changes; the system auto-detects the new device | P1 |

---

## 4. Non-Goals

The following are explicitly out of scope for VibePrint OS. These items represent deliberate boundary decisions to keep the product focused, maintainable, and achievable by a small team.

### NG-001: Multi-User and Group Sessions

VibePrint OS is designed for single-user sessions only. It does not support group photos, multi-face analysis, or simultaneous sessions. Each session serves one person. Supporting group sessions would introduce significant complexity in photo composition, AI prompt handling (which person's vibe to read?), and print layout. This may be revisited in a future major version, but it is not a goal for v1.0.

### NG-002: Digital Photo Delivery (Email, SMS, Download Link)

The product outputs exclusively through the thermal printer. There is no email delivery, no SMS link, no QR code to download a digital file, and no cloud gallery. This is an intentional design decision to keep the output tangible and to eliminate the privacy and infrastructure complexity of storing and delivering user data. If operators want to offer digital delivery, they are free to fork the project and add it, but it will not be part of the core product.

### NG-003: Video or Animated Content

VibePrint OS captures still photos only. It does not record video, create GIFs, produce boomerangs, or generate any animated content. The thermal printer medium is inherently static, and video capture would introduce storage, processing, and privacy concerns that are inconsistent with the product's design philosophy.

### NG-004: Social Media Integration (Auto-Posting)

The product does not integrate with Instagram, TikTok, Twitter, or any social media platform. Users who wish to share their receipt do so by photographing it with their own phone. There is no "share to Instagram" button on the kiosk screen, no OAuth flow, and no API integration with social platforms. This eliminates the need for social media API keys, OAuth complexity, and the privacy implications of requesting social media permissions from users in a public setting.

### NG-005: User Accounts or Authentication

End-users do not create accounts, log in, or authenticate in any way. The kiosk experience is fully anonymous. There is no user profile, no session history accessible to the end-user, and no loyalty program integration. This is fundamental to the product's privacy-first design and its frictionless user experience.

### NG-006: Revenue Sharing or Payment Splitting

VibePrint OS does not include built-in revenue sharing between the operator and the software maintainer, nor does it include payment splitting between multiple parties. All payment revenue goes directly to the operator's payment gateway account. Monetization of the software itself, if any, will be handled through separate channels (consulting, custom development, support contracts) and will not be embedded in the product.

### NG-007: Mobile Application

There is no mobile app for end-users or operators. The kiosk UI is a web application optimized for the kiosk's touchscreen, and the admin dashboard is a responsive web application accessible via any browser on the local network. A mobile app would significantly increase development and maintenance burden without providing proportional value, since the kiosk interaction is inherently location-bound and the admin dashboard is used infrequently.

### NG-008: Multi-Language AI Output Localization

The AI-generated vibe reading is produced in the language determined by the system prompt, which defaults to English. There is no automatic language detection based on the user's appearance, speech, or location, nor is there a language selection UI on the kiosk screen. Operators can configure the system prompt to request output in Indonesian, Javanese, or any other language, but this is a prompt engineering task, not a software localization feature.

### NG-009: Kiosk Enclosure or Physical Hardware Design

VibePrint OS is purely software. It does not include designs for physical kiosk enclosures, mounting brackets, cable management solutions, or hardware assembly guides beyond identifying compatible component classes. Operators are responsible for the physical housing of their kiosks. Community-contributed enclosure designs may be shared separately but are not part of the core product.

### NG-010: Cloud Hosting or SaaS Deployment

VibePrint OS is designed to run locally on a single machine (or local network) via Docker Compose. It does not include a cloud deployment option, a managed hosting service, or a SaaS billing model. The software is self-hosted by the operator. Future versions may include optional cloud telemetry or remote monitoring, but the core product remains fully functional without any internet connection beyond what is needed for AI API calls and payment processing.
