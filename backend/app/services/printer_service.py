"""Thermal printer service — ESC/POS USB direct communication."""

# Responsibilities:
# - Discover and connect to ESC/POS USB printer
# - Convert color image to dithered black-and-white
# - Format AI response text for thermal paper width
# - Send ESC/POS byte commands to printer
# - Handle paper-cut and print status
