import time
from typing import Dict, List, Any
from langchain_core.messages import BaseMessage
from shared.config import settings


class InMemorySessionStore:
    """In-memory session store holding LangChain conversation history per customer portal token."""

    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, Dict[str, Any]] = {}

    def get_history(self, token: str) -> List[BaseMessage]:
        """Get message history for token, updating activity timestamp and evicting expired."""
        self._evict_expired()
        if token not in self._store:
            return []
        self._store[token]["last_active"] = time.time()
        return list(self._store[token]["messages"])

    def append_messages(self, token: str, messages: List[BaseMessage]) -> None:
        """Append new messages to token history and update last active timestamp."""
        self._evict_expired()
        now = time.time()
        if token not in self._store:
            self._store[token] = {"messages": [], "last_active": now}
        self._store[token]["messages"].extend(messages)
        self._store[token]["last_active"] = now

    def clear(self, token: str) -> None:
        """Clear conversation history for a given token."""
        self._store.pop(token, None)

    def _evict_expired(self) -> None:
        """Evict tokens that have exceeded TTL since last activity."""
        now = time.time()
        expired = [
            token
            for token, data in self._store.items()
            if (now - data.get("last_active", 0.0)) > self.ttl_seconds
        ]
        for token in expired:
            self._store.pop(token, None)


session_store = InMemorySessionStore(ttl_seconds=settings.SESSION_TTL_SECONDS)
