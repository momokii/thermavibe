"""AI provider dispatch service — provider-agnostic image analysis."""

# Responsibilities:
# - Dispatch to configured AI provider (OpenAI, Anthropic, Google, Ollama)
# - Compress image for optimal bandwidth
# - Send image + system prompt to provider
# - Parse and return text response
# - Handle timeouts and provider errors
