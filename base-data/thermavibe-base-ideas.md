# Product Requirements Document (PRD): VibePrint OS

## 1. Project Vision & Executive Summary
VibePrint OS is an open-source, hardware-agnostic kiosk software designed to power self-service "AI Vibe/Aura Booths" in public spaces. By combining low-barrier hardware (a basic camera, a generic screen, and a cheap thermal receipt printer) with AI-powered image analysis, the software provides an interactive, highly shareable entertainment experience for the general public. 

The ultimate goal of this open-source project is to empower local entrepreneurs, event organizers, and cafe owners to build and monetize their own interactive photobooths with minimal capital, while creating a viral, aesthetic physical takeaway for the end-users.

## 2. Target Audience & Commercial Model
* **The End-User (Public):** Cafe-goers, event attendees, and teenagers looking for quick, aesthetic, and shareable experiences. They interact with a locked-down, idiot-proof interface and pay a micro-transaction fee for a personalized physical receipt.
* **The Operator (B2B):** Local business owners or hardware hobbyists who download this open-source software, install it on spare computers, attach a standard webcam and thermal printer, and place the kiosk in their venue to generate automated passive income.

## 3. End-to-End User Journey (The Kiosk Flow)
1. **The Hook (Idle State):** The screen displays a looping, visually appealing video/image prompting passersby to "Discover Your Aura" or "Check Your Vibe."
2. **The Trigger & Payment:** The user touches the screen. A dynamic QR code (for local payment gateways) appears. The system waits for an asynchronous payment confirmation.
3. **The Pose (Capture State):** Upon payment, a 3-second visual and audio countdown begins. A live camera feed acts as a mirror. The system captures the image.
4. **The Magic (Processing State):** The UI transitions to an engaging loading screen (e.g., "Reading the stars...", "Analyzing aesthetic frequencies..."). In the background, the image is securely transmitted to an AI Vision model.
5. **The Reveal & Print:** The screen displays the generated "Vibe Reading" (a witty, personalized text analysis). Simultaneously, the attached thermal printer dispenses a physical receipt containing the user's dithered photo and the AI-generated text.
6. **The Reset:** After a configurable delay (e.g., 10 seconds) or a "Finish" button press, the system strictly clears all session data (images and text) to ensure privacy and returns to the Idle State.

## 4. Comprehensive Feature Breakdown & Architecture
To ensure commercial viability and operational security, the application architecture is strictly divided into two distinct interfaces: The Public Kiosk Mode and the Operator Admin Dashboard.

### 4.1. Public-Facing UI (Kiosk Mode)
* **What it does:** The frontend interface designed exclusively for the end-user. It runs strictly in a borderless, full-screen kiosk mode. It blocks all OS-level shortcuts (e.g., Alt+Tab, Windows key, swipe gestures) to prevent the public from minimizing the app or accessing the underlying operating system.
* **Purpose:** Ensures system security, prevents vandalism, and maintains a seamless, immersive, appliance-like experience.

### 4.2. Operator Interface (Admin Dashboard & Configuration)
* **What it does:** A secure, password-or-PIN-protected backend interface accessible only to the machine operator (e.g., accessed via a hidden gesture on the idle screen or a separate local web route). 
* **Key Capabilities:**
  * **Hardware Setup:** Select active webcams and bind the connected thermal printer.
  * **API & Business Logic:** Input AI provider API keys, configure payment gateway webhooks, and set pricing.
  * **Analytics:** View session logs, total successful prints, hardware errors, and estimated revenue.
* **Purpose:** Separates the business and hardware configuration from the public view, allowing non-technical operators to manage their business efficiently.

### 4.3. Universal Camera Handler
* **What it does:** Interfaces with any standard connected camera. It handles video stream buffering to display a smooth live preview on the Kiosk UI and captures a high-quality still frame when triggered.
* **Purpose:** To be hardware-agnostic. The operator should not need specialized camera drivers; plug-and-play functionality across different operating systems is critical.

### 4.4. The AI Logic Engine & Customization Hooks
* **What it does:** Takes the captured image, compresses it to optimize bandwidth, and sends it to the configured AI Vision provider alongside a predefined system prompt. 
* **Open-Source Flexibility:** Through the Admin Dashboard, the operator can change the system prompt. This allows the machine to be easily repurposed (e.g., changing it from a "Vibe Reader" to an "AI Roasting Machine" or "Daily Horoscope") without altering the source code.
* **Purpose:** Provides the core entertainment value while ensuring the open-source project remains highly flexible and attractive to other developers and operators.

### 4.5. Thermal Print Engine & Template Builder
* **What it does:** Translates the digital result into raw hardware commands. It converts the captured color photo into a high-contrast, black-and-white dithered format suitable for thermal paper. It dynamically aligns the AI-generated text, applies typography rules, and sends the raw byte instructions to the printer.
* **Purpose:** Eliminates the need for operators to rely on clunky OS printer queues or complex drivers. Direct communication with standard receipt printers ensures instantaneous and reliable output.

### 4.6. Failsafe & Error Handling Mechanisms
* **What it does:** Continuously monitors internet connectivity, camera status, and API timeouts. If the AI processing fails or takes too long, the system intercepts the error and automatically prints a beautifully designed fallback template (e.g., a generic positive fortune or aesthetic graphic) instead of crashing.
* **Purpose:** A public kiosk must never show a system error dialog. Graceful degradation ensures the customer still receives a physical product after paying, maintaining business reputation and operational stability.