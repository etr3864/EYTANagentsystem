from datetime import datetime

from sqlalchemy import String, DateTime, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from backend.core.database import Base


class SystemSecret(Base):
    __tablename__ = "system_secrets"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    value_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
