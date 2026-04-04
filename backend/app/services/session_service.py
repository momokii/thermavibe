"""Kiosk session state machine — core orchestrator."""

# Responsibilities:
# - Manage the 6-state kiosk FSM (idle -> payment -> capture -> processing -> reveal -> reset)
# - Orchestrate camera, AI, printer, and payment services
# - Enforce state transition rules and timeouts
# - Clear session data for privacy on reset
# - Record analytics events for each state transition
