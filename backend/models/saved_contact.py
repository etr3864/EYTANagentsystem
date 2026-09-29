from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class SavedContact(Base):
    """Address-book row for one Wasender line.

    excluded stays through the next full pull, so "החזר לסוכן" is not undone
    when the phone syncs the same name again.
    """

    __tablename__ = "saved_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(
        ForeignKey("agent_channels.id", ondelete="CASCADE"), nullable=False
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("channel_id", "phone", name="uq_saved_contact_channel_phone"),
    )
