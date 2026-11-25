"""SQLAlchemy models for multi-customer split dispatch batches."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


class DispatchBatch(Base):
    __tablename__ = "dispatch_batches"
    __table_args__ = (
        UniqueConstraint(
            "inward_id", "batch_no", name="uq_dispatch_batches_inward_batch"
        ),
    )

    dispatch_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True, index=True
    )
    inward_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inward.inward_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dispatched_to_customer_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("customers.customer_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    batch_no: Mapped[int] = mapped_column(Integer, nullable=False)
    dispatch_dc_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT", server_default=text("'DRAFT'")
    )  # DRAFT, READY, DISPATCHED, CANCELLED
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    items: Mapped[List["DispatchBatchItem"]] = relationship(
        "DispatchBatchItem",
        back_populates="dispatch_batch",
        cascade="all, delete-orphan",
    )
    final_inspection = relationship(
        "FinalInspection",
        back_populates="dispatch_batch",
        uselist=False,
    )
    wcc = relationship(
        "WorkCompletionCertificate",
        back_populates="dispatch_batch",
        uselist=False,
    )
    # Unidirectional relationships so inward.py / customer.py need no edits
    inward = relationship("Inward")
    dispatched_to_customer = relationship("Customer")

    def __repr__(self) -> str:
        return (
            f"<DispatchBatch(dispatch_id={self.dispatch_id}, "
            f"inward_id={self.inward_id}, batch_no={self.batch_no}, "
            f"dispatched_to_customer_id={self.dispatched_to_customer_id})>"
        )


class DispatchBatchItem(Base):
    __tablename__ = "dispatch_batch_items"
    __table_args__ = (
        Index(
            "uq_dispatch_batch_items_active_eqp",
            "inward_eqp_id",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dispatch_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("dispatch_batches.dispatch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inward_eqp_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    dispatch_batch: Mapped["DispatchBatch"] = relationship(
        "DispatchBatch", back_populates="items"
    )
    inward_equipment = relationship("InwardEquipment")