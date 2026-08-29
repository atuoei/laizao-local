import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class ListingStatus(str, enum.Enum):
    active = "active"
    archived = "archived"


class OrderStatus(str, enum.Enum):
    created = "created"
    payment_submitted = "payment_submitted"
    payment_failed = "payment_failed"
    paid = "paid"
    delivered = "delivered"
    refunded = "refunded"
    cancelled = "cancelled"


class ReviewStatus(str, enum.Enum):
    draft = "draft"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(30), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(80))
    is_admin: Mapped[bool] = mapped_column(default=False)
    payment_qr_url: Mapped[str] = mapped_column(String(2048), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Work(Base):
    __tablename__ = "works"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(500), default="")
    cover_url: Mapped[str] = mapped_column(String(2048), default="")
    # 购买前可公开打开的演示地址；交付包/正式源文件仍由版本和权益控制。
    trial_url: Mapped[str] = mapped_column(String(2048), default="")
    deployment_status: Mapped[str] = mapped_column(String(24), default="not_deployed")
    deployment_error: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[ReviewStatus] = mapped_column(Enum(ReviewStatus), default=ReviewStatus.draft, index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkVersion(Base):
    __tablename__ = "work_versions"
    __table_args__ = (UniqueConstraint("work_id", "version_number", name="uq_work_version_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id: Mapped[str] = mapped_column(ForeignKey("works.id"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    source_url: Mapped[str] = mapped_column(String(2048))
    changelog: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id: Mapped[str] = mapped_column(ForeignKey("works.id"), unique=True, index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("work_versions.id"))
    price_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="CNY")
    status: Mapped[ListingStatus] = mapped_column(Enum(ListingStatus), default=ListingStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.created)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_proof_url: Mapped[str] = mapped_column(String(2048), default="")
    payment_note: Mapped[str] = mapped_column(Text, default="")
    payment_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Entitlement(Base):
    __tablename__ = "entitlements"
    __table_args__ = (UniqueConstraint("user_id", "work_id", name="uq_user_work_entitlement"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    work_id: Mapped[str] = mapped_column(ForeignKey("works.id"), index=True)
    source_order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("work_versions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_name: Mapped[str] = mapped_column(String(80), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    work_id: Mapped[str | None] = mapped_column(ForeignKey("works.id"), index=True, nullable=True)
    listing_id: Mapped[str | None] = mapped_column(ForeignKey("listings.id"), index=True, nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id"), index=True, nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    properties_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(512), unique=True)
    content_type: Mapped[str] = mapped_column(String(120), default="application/zip")
    kind: Mapped[str] = mapped_column(String(30), default="work_package", index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
