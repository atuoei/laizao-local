from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ORMModel):
    id: str
    # 账号体系不使用邮箱；该字段仅用于兼容早期本地测试数据的内部标识。
    email: str
    username: str | None
    phone: str | None
    display_name: str
    is_admin: bool


class SmsSendIn(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")


class SmsVerifyIn(SmsSendIn):
    code: str = Field(pattern=r"^\d{6}$")
    display_name: str = Field(default="来造用户", min_length=1, max_length=80)


class AuthSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PasswordRegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class PasswordLoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=1, max_length=128)


class DevLoginIn(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=80)


class WorkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=10_000)
    tags: list[str] = Field(default_factory=list, max_length=10)
    cover_url: str = Field(default="", max_length=2_048)


class WorkUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=10_000)
    tags: list[str] = Field(default_factory=list, max_length=10)
    cover_url: str = Field(default="", max_length=2_048)
    price_cents: int = Field(ge=0, le=10_000_000)


class WorkOut(ORMModel):
    id: str
    creator_id: str
    title: str
    description: str
    tags: str
    cover_url: str
    review_status: str
    review_note: str
    created_at: datetime


class VersionCreate(BaseModel):
    source_url: HttpUrl
    changelog: str = Field(default="", max_length=5_000)


class VersionOut(ORMModel):
    id: str
    work_id: str
    version_number: int
    source_url: str
    changelog: str
    created_at: datetime


class VersionHistoryItem(BaseModel):
    id: str
    version_number: int
    changelog: str
    created_at: datetime
    is_owned_version: bool = False
    is_latest: bool = False


class ListingCreate(BaseModel):
    work_id: str
    version_id: str
    price_cents: int = Field(ge=0, le=10_000_000)


class ListingOut(ORMModel):
    id: str
    work_id: str
    version_id: str
    price_cents: int
    currency: str
    status: str
    created_at: datetime


class MarketplaceItem(BaseModel):
    listing_id: str
    work_id: str
    version_id: str
    title: str
    description: str
    cover_url: str
    tags: list[str]
    creator_name: str
    price_cents: int
    currency: str


class OrderCreate(BaseModel):
    listing_id: str


class OrderOut(ORMModel):
    id: str
    buyer_id: str
    listing_id: str
    amount_cents: int
    status: str
    created_at: datetime
    paid_at: datetime | None
    refunded_at: datetime | None


class PaymentQrIn(BaseModel):
    qr_url: str = Field(min_length=1, max_length=2_048)


class PaymentProofIn(BaseModel):
    proof_url: str = Field(min_length=1, max_length=2_048)
    note: str = Field(default="", max_length=500)


class OfflinePaymentInfo(BaseModel):
    order_id: str
    amount_cents: int
    creator_name: str
    qr_url: str


class EntitlementOut(ORMModel):
    id: str
    user_id: str
    work_id: str
    source_order_id: str
    version_id: str
    created_at: datetime


class OwnedWorkItem(BaseModel):
    entitlement_id: str
    work_id: str
    title: str
    description: str
    source_url: str
    version_number: int
    latest_version_number: int
    granted_at: datetime


class MyOrderItem(BaseModel):
    order_id: str
    title: str
    amount_cents: int
    currency: str
    status: str
    created_at: datetime
    paid_at: datetime | None
    refunded_at: datetime | None


class MyWorkItem(BaseModel):
    work_id: str
    title: str
    description: str
    tags: str
    cover_url: str
    review_status: str
    review_note: str
    price_cents: int | None
    listing_status: str | None
    created_at: datetime


class CreatorSaleItem(BaseModel):
    order_id: str
    title: str
    amount_cents: int
    status: str
    paid_at: datetime | None


class CreatorDashboardOut(BaseModel):
    total_revenue_cents: int
    paid_order_count: int
    pending_review_count: int
    works: list[MyWorkItem]
    recent_sales: list[CreatorSaleItem]


class UploadOut(BaseModel):
    file_id: str
    original_name: str
    size_bytes: int
    source_url: str


class AgentSummaryIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=10_000)


class AgentSummaryOut(BaseModel):
    summary: str
    provider: str


class ReviewRejectIn(BaseModel):
    note: str = Field(min_length=1, max_length=2_000)


class ReviewItem(ORMModel):
    id: str
    title: str
    description: str
    cover_url: str
    tags: str
    review_status: str
    review_note: str
    source_url: str
    created_at: datetime


class FunnelOut(BaseModel):
    from_date: datetime
    to_date: datetime
    counts: dict[str, int]
    view_to_order_rate: float
    order_to_paid_rate: float


class WorkViewIn(BaseModel):
    work_id: str
    listing_id: str | None = None
    session_id: str | None = Field(default=None, max_length=100)
