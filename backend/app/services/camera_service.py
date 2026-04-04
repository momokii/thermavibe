"""Camera handler service — live preview and still capture."""

# Responsibilities:
# - Enumerate available USB cameras
# - Start/stop MJPEG streaming for live preview
# - Capture high-quality still frame on trigger
# - Hardware-agnostic via OpenCV/V4L2
