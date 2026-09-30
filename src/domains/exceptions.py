class TranslationError(RuntimeError):
    """Base application/domain error for translation processing."""


class ContextWindowError(TranslationError):
    """Raised when a chapter cannot fit safely inside the configured LLM context."""


class SourceChapterError(TranslationError):
    """Raised when the raw chapter corpus is ambiguous or invalid."""


class MetadataValidationError(TranslationError):
    """Raised when structured metadata cannot be normalized safely."""
