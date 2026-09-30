from __future__ import annotations

import math


def estimate_tokens(text: str) -> int:
    """Cheap conservative estimator that works without tokenizer/model coupling."""
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 3.5))


def trim_text_to_tokens(text: str, budget: int, *, keep_tail: bool = False) -> str:
    if budget <= 0:
        return ""
    if estimate_tokens(text) <= budget:
        return text
    char_budget = max(64, int(budget * 3.5))
    marker = "\n\n...[context compacted]...\n\n"
    if keep_tail:
        return marker + text[-max(1, char_budget - len(marker)):]
    if char_budget < 512:
        return text[:char_budget]
    half = max(1, (char_budget - len(marker)) // 2)
    return text[:half] + marker + text[-half:]
