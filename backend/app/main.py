from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import json
import time
import uuid
import shutil
import zipfile
from pathlib import Path, PurePosixPath

import httpx
import bcrypt
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, engine, get_db
from .models import Entitlement, Event, Listing, ListingStatus, Order, OrderStatus, ReviewStatus, StoredFile, User, Work, WorkVersion
from .schemas import (
    AgentSummaryIn,
    AgentSummaryOut,
    AuthSessionOut,
    CreatorDashboardOut,
    CreatorSaleItem,
    DevLoginIn,
    EntitlementOut,
    FunnelOut,
    ListingCreate,
    ListingOut,
    MarketplaceItem,
    MyOrderItem,
    MyWorkItem,
    OrderCreate,
    OrderOut,
    OwnedWorkItem,
    ReviewItem,
    ReviewRejectIn,
    SmsSendIn,
    SmsVerifyIn,
    StaticDeploymentOut,
    PasswordLoginIn,
    PasswordRegisterIn,
    OfflinePaymentInfo,
    PaymentProofIn,
    PaymentQrIn,
    UserOut,
    UploadOut,
    WorkUpdate,
    VersionCreate,
    VersionHistoryItem,
    VersionOut,
    WorkViewIn,
    WorkCreate,
    WorkOut,
)
from .services import summarize_work

settings = get_settings()

app = FastAPI(
    title="Vibe Market API",
    version="0.1.0",
    description="AI 作品交易平台的 MVP 后端。",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 这里只挂载经过安全检查后解压出的静态文件；原始 ZIP 仍需要作品权益才能下载。
trial_root = Path(settings.upload_dir) / "trials"
trial_root.mkdir(parents=True, exist_ok=True)
app.mount("/v1/trials", StaticFiles(directory=trial_root, html=True), name="work-trials")


@app.on_event("startup")
def create_tables() -> None:
    """MVP 阶段自动建表；正式上线前会替换为迁移脚本。"""
    if settings.is_production and settings.auth_secret == "change-this-before-production":
        raise RuntimeError("生产环境必须设置强 AUTH_SECRET")
    if settings.is_production and settings.sms_mode == "local":
        raise RuntimeError("生产环境不能使用本地固定验证码；请先接入真实短信服务")
    if settings.is_production and not settings.admin_initial_password:
        raise RuntimeError("生产环境必须设置 ADMIN_INITIAL_PASSWORD 后再初始化管理员")
    Base.metadata.create_all(bind=engine)
    # MVP 数据库小迁移：让已创建的本地 users 表也拥有手机号字段。
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        if "phone" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20)"))
        if "password_hash" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))
        if "username" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(30)"))
        if "is_admin" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
        if "payment_qr_url" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN payment_qr_url VARCHAR(2048) NOT NULL DEFAULT ''"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone_unique ON users (phone) WHERE phone IS NOT NULL"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_unique ON users (username) WHERE username IS NOT NULL"))
        work_columns = {column["name"] for column in inspect(connection).get_columns("works")}
        if "review_status" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN review_status VARCHAR(16) NOT NULL DEFAULT 'approved'"))
        connection.execute(text("ALTER TABLE works ALTER COLUMN review_status SET DEFAULT 'draft'"))
        if "reviewer_id" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN reviewer_id VARCHAR(36)"))
        if "review_note" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN review_note TEXT NOT NULL DEFAULT ''"))
        if "reviewed_at" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN reviewed_at TIMESTAMPTZ"))
        if "cover_url" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN cover_url VARCHAR(2048) NOT NULL DEFAULT ''"))
        if "trial_url" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN trial_url VARCHAR(2048) NOT NULL DEFAULT ''"))
        if "deployment_status" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN deployment_status VARCHAR(24) NOT NULL DEFAULT 'not_deployed'"))
        if "deployment_error" not in work_columns:
            connection.execute(text("ALTER TABLE works ADD COLUMN deployment_error TEXT NOT NULL DEFAULT ''"))
        # 旧的网页作品可直接把原访问地址作为体验地址；ZIP 作品单独补一个站内演示。
        connection.execute(text("""
            UPDATE works AS work SET trial_url = version.source_url
            FROM listings AS listing JOIN work_versions AS version ON version.id = listing.version_id
            WHERE work.id = listing.work_id AND work.trial_url = ''
              AND version.source_url NOT LIKE '%/v1/files/%'
        """))
        connection.execute(text("""
            UPDATE works SET trial_url = '/?view=squishy-trial'
            WHERE title = '解压捏捏乐' AND trial_url = ''
        """))
        file_columns = {column["name"] for column in inspect(connection).get_columns("stored_files")}
        if "kind" not in file_columns:
            connection.execute(text("ALTER TABLE stored_files ADD COLUMN kind VARCHAR(30) NOT NULL DEFAULT 'work_package'"))
        order_columns = {column["name"] for column in inspect(connection).get_columns("orders")}
        if "refunded_at" not in order_columns:
            connection.execute(text("ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMPTZ"))
        if "payment_proof_url" not in order_columns:
            connection.execute(text("ALTER TABLE orders ADD COLUMN payment_proof_url VARCHAR(2048) NOT NULL DEFAULT ''"))
        if "payment_note" not in order_columns:
            connection.execute(text("ALTER TABLE orders ADD COLUMN payment_note TEXT NOT NULL DEFAULT ''"))
        if "payment_verified_at" not in order_columns:
            connection.execute(text("ALTER TABLE orders ADD COLUMN payment_verified_at TIMESTAMPTZ"))
        if "payment_verified_by" not in order_columns:
            connection.execute(text("ALTER TABLE orders ADD COLUMN payment_verified_by VARCHAR(36)"))
        connection.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'payment_submitted'"))
        connection.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'payment_failed'"))
        connection.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'refunded'"))

    # 本地 MVP 的管理员初始化：管理员同样通过账号和密码登录，不再依赖手机号。
    with Session(engine) as db:
        username = settings.admin_username.lower()
        admin = db.scalar(select(User).where(User.username == username))
        if not admin:
            admin = User(
                username=username,
                email=f"account-{username}@local.lai-zao.test",
                display_name="平台管理员",
                password_hash=hash_password(settings.admin_initial_password),
                is_admin=True,
            )
            db.add(admin)
        else:
            admin.is_admin = True
            # 开发环境从 .env 固定同步，便于本地测试；生产环境只在首次初始化时写入。
            if not admin.password_hash or not settings.is_production:
                admin.password_hash = hash_password(settings.admin_initial_password)
        db.commit()


def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + settings.auth_token_ttl_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(settings.auth_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def password_matches(password: str, stored_hash: str | None) -> bool:
    return bool(stored_hash) and bcrypt.checkpw(password.encode(), stored_hash.encode())


def require_auth_enabled() -> None:
    if not settings.auth_enabled:
        raise HTTPException(status_code=503, detail="账号功能将在 HTTPS 上线后开放")


def token_user_id(token: str) -> str:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(settings.auth_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("签名无效")
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not isinstance(payload.get("sub"), str) or int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("令牌已过期")
        return payload["sub"]
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效，请重新登录") from error


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    user = db.get(User, token_user_id(authorization.removeprefix("Bearer ")))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user


def get_owned_work(work_id: str, user: User, db: Session) -> Work:
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")
    if work.creator_id != user.id:
        raise HTTPException(status_code=403, detail="只有作品创建者可以操作")
    return work


def require_admin(user: User) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


def log_event(db: Session, event_name: str, *, user_id: str | None = None, work_id: str | None = None, listing_id: str | None = None, order_id: str | None = None, properties: dict[str, object] | None = None) -> None:
    db.add(Event(event_name=event_name, user_id=user_id, work_id=work_id, listing_id=listing_id, order_id=order_id, properties_json=json.dumps(properties or {}, ensure_ascii=False)))


def stored_file_url(file_id: str) -> str:
    return f"{settings.public_api_base_url.rstrip('/')}/v1/files/{file_id}"


STATIC_WORK_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".map", ".txt", ".webmanifest",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif",
    ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".ogg", ".mp4", ".webm",
}


def deploy_static_zip(work: Work, version: WorkVersion, db: Session) -> str:
    """安全解压纯前端 ZIP，返回公开体验地址。绝不执行 ZIP 中的脚本。"""
    file_id = version.source_url.rstrip("/").rsplit("/v1/files/", 1)[-1]
    stored_file = db.get(StoredFile, file_id)
    if not stored_file or stored_file.kind != "work_package":
        raise ValueError("当前版本不是可自动部署的 ZIP 作品包")
    source = Path(settings.upload_dir) / stored_file.storage_key
    if not source.is_file():
        raise ValueError("原始 ZIP 文件不存在")
    target = trial_root / work.id / f"v{version.version_number}"
    temporary = trial_root / work.id / f".deploying-{uuid.uuid4().hex}"
    file_count = 0
    unpacked_size = 0
    try:
        with zipfile.ZipFile(source) as archive:
            infos = archive.infolist()
            if len(infos) > 500:
                raise ValueError("ZIP 文件数量不能超过 500 个")
            for info in infos:
                name = PurePosixPath(info.filename)
                if name.is_absolute() or ".." in name.parts or not info.filename:
                    raise ValueError("ZIP 包含不安全路径")
                # Unix 软链接可能把文件写到部署目录外，静态部署一律拒绝。
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("ZIP 不允许包含软链接")
                if info.is_dir():
                    continue
                file_count += 1
                unpacked_size += info.file_size
                if file_count > 500 or unpacked_size > 50 * 1024 * 1024:
                    raise ValueError("解压后的作品不能超过 50MB 或 500 个文件")
                if name.suffix.lower() not in STATIC_WORK_EXTENSIONS:
                    raise ValueError(f"不支持部署文件类型：{name.suffix or name.name}")
            if not any(PurePosixPath(info.filename).as_posix() == "index.html" for info in infos):
                raise ValueError("纯前端 ZIP 根目录必须包含 index.html")
            temporary.mkdir(parents=True, exist_ok=False)
            for info in infos:
                if info.is_dir():
                    continue
                destination = temporary.joinpath(*PurePosixPath(info.filename).parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as input_file, destination.open("wb") as output_file:
                    shutil.copyfileobj(input_file, output_file)
        if target.exists():
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary.replace(target)
    except (zipfile.BadZipFile, OSError, ValueError) as error:
        shutil.rmtree(temporary, ignore_errors=True)
        raise ValueError(str(error)) from error
    return f"{settings.public_api_base_url.rstrip('/')}/v1/trials/{work.id}/v{version.version_number}/"


def can_access_file(stored_file: StoredFile, user: User, db: Session) -> bool:
    if user.is_admin:
        return True
    if stored_file.owner_id == user.id:
        return True
    return bool(
        db.scalar(
            select(Entitlement.id)
            .join(WorkVersion, Entitlement.version_id == WorkVersion.id)
            .where(Entitlement.user_id == user.id, WorkVersion.source_url == stored_file_url(stored_file.id))
        )
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/auth/dev-login", response_model=UserOut, tags=["开发登录"])
def dev_login(payload: DevLoginIn, db: Session = Depends(get_db)) -> User:
    """仅供本地演示。生产环境将替换为短信、OAuth 或微信登录。"""
    if settings.is_production:
        raise HTTPException(status_code=404, detail="该接口仅限开发环境")
    user = db.scalar(select(User).where(User.email == str(payload.email)))
    if user:
        user.display_name = payload.display_name
    else:
        user = User(email=str(payload.email), display_name=payload.display_name)
        db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/v1/auth/register", response_model=AuthSessionOut, tags=["账号密码登录"])
def register_with_password(payload: PasswordRegisterIn, db: Session = Depends(get_db)) -> AuthSessionOut:
    require_auth_enabled()
    username = payload.username.lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(status_code=409, detail="该账号已被使用，请换一个")
    user = User(email=f"account-{username}@local.lai-zao.test", username=username, display_name=payload.display_name, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthSessionOut(access_token=make_token(user.id), user=user)


@app.post("/v1/auth/login", response_model=AuthSessionOut, tags=["账号密码登录"])
def login_with_password(payload: PasswordLoginIn, db: Session = Depends(get_db)) -> AuthSessionOut:
    require_auth_enabled()
    user = db.scalar(select(User).where(User.username == payload.username.lower()))
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在，请先注册账号")
    if not password_matches(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="密码不正确，请重新输入")
    return AuthSessionOut(access_token=make_token(user.id), user=user)


@app.post("/v1/auth/sms/send", tags=["手机号登录"])
def send_sms_code(payload: SmsSendIn) -> dict[str, str]:
    """本地阶段固定验证码；上线时替换为腾讯云短信调用和 Redis 限流。"""
    if settings.sms_mode != "local":
        raise HTTPException(status_code=503, detail="短信服务尚未配置")
    return {"message": "验证码已发送（本地测试）", "debug_code": settings.local_sms_code}


@app.post("/v1/auth/sms/verify", response_model=AuthSessionOut, tags=["手机号登录"])
def verify_sms_code(payload: SmsVerifyIn, db: Session = Depends(get_db)) -> AuthSessionOut:
    if settings.sms_mode != "local" or payload.code != settings.local_sms_code:
        raise HTTPException(status_code=400, detail="验证码不正确或已过期")
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user:
        user = User(
            phone=payload.phone,
            email=f"phone-{payload.phone}@example.com",
            display_name=payload.display_name,
        )
        db.add(user)
    else:
        # 兼容早期本地测试数据；真实手机号账号不依赖该内部占位邮箱。
        if user.email.endswith("@local.lai-zao.test"):
            user.email = f"phone-{payload.phone}@example.com"
        if user.display_name == "来造用户" and payload.display_name != "来造用户":
            user.display_name = payload.display_name
    user.is_admin = False
    db.commit()
    db.refresh(user)
    return AuthSessionOut(access_token=make_token(user.id), user=user)


@app.get("/v1/auth/me", response_model=UserOut, tags=["手机号登录"])
def auth_me(user: User = Depends(current_user)) -> User:
    return user


@app.post("/v1/uploads/work-package", response_model=UploadOut, tags=["文件上传"])
async def upload_work_package(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> UploadOut:
    """本地磁盘 ZIP 上传：只保存文件，不解压、更不执行其中内容。"""
    original_name = file.filename or "work.zip"
    if not original_name.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="目前只接受 .zip 作品包")
    file_id = str(uuid.uuid4())
    destination = Path(settings.upload_dir) / "works" / f"{file_id}.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    first_chunk = b""
    try:
        with destination.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                if not first_chunk:
                    first_chunk = chunk
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="文件不能超过 100MB")
                target.write(chunk)
        if not first_chunk.startswith(b"PK"):
            raise HTTPException(status_code=400, detail="文件内容不是有效的 ZIP 格式")
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    stored_file = StoredFile(
        id=file_id,
        owner_id=user.id,
        original_name=original_name[:255],
        storage_key=str(destination.relative_to(Path(settings.upload_dir))),
        content_type="application/zip",
        kind="work_package",
        size_bytes=total,
    )
    db.add(stored_file)
    log_event(db, "work_file_uploaded", user_id=user.id, properties={"size_bytes": total})
    db.commit()
    return UploadOut(file_id=file_id, original_name=stored_file.original_name, size_bytes=total, source_url=stored_file_url(file_id))


@app.post("/v1/uploads/cover-image", response_model=UploadOut, tags=["文件上传"])
async def upload_cover_image(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> UploadOut:
    original_name = file.filename or "cover-image"
    extension = Path(original_name).suffix.lower()
    allowed = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    if extension not in allowed:
        raise HTTPException(status_code=400, detail="封面只接受 PNG、JPG 或 WebP 图片")
    file_id = str(uuid.uuid4())
    destination = Path(settings.upload_dir) / "covers" / f"{file_id}{extension}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    try:
        with destination.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_cover_bytes:
                    raise HTTPException(status_code=413, detail="封面图片不能超过 5MB")
                target.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    stored_file = StoredFile(id=file_id, owner_id=user.id, original_name=original_name[:255], storage_key=str(destination.relative_to(Path(settings.upload_dir))), content_type=allowed[extension], kind="cover_image", size_bytes=total)
    db.add(stored_file)
    log_event(db, "cover_uploaded", user_id=user.id, properties={"size_bytes": total})
    db.commit()
    source_url = f"{settings.public_api_base_url.rstrip('/')}/v1/public/files/{file_id}"
    return UploadOut(file_id=file_id, original_name=stored_file.original_name, size_bytes=total, source_url=source_url)


@app.get("/v1/public/files/{file_id}", tags=["文件上传"])
def public_cover_file(file_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stored_file = db.get(StoredFile, file_id)
    if not stored_file or stored_file.kind != "cover_image":
        raise HTTPException(status_code=404, detail="封面图片不存在")
    path = Path(settings.upload_dir) / stored_file.storage_key
    if not path.is_file():
        raise HTTPException(status_code=404, detail="封面图片存储不存在")
    return FileResponse(path, media_type=stored_file.content_type)


@app.get("/v1/files/{file_id}", tags=["文件上传"])
def download_work_file(
    file_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    stored_file = db.get(StoredFile, file_id)
    if not stored_file or not can_access_file(stored_file, user, db):
        raise HTTPException(status_code=404, detail="文件不存在或你无权访问")
    path = Path(settings.upload_dir) / stored_file.storage_key
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件存储不存在")
    return FileResponse(path, media_type=stored_file.content_type, filename=stored_file.original_name)


@app.post("/v1/works", response_model=WorkOut, tags=["作品"])
def create_work(
    payload: WorkCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    work = Work(
        creator_id=user.id,
        title=payload.title,
        description=payload.description,
        tags=",".join(tag.strip() for tag in payload.tags if tag.strip()),
        cover_url=payload.cover_url.strip(),
        trial_url=payload.trial_url.strip(),
        review_status=ReviewStatus.draft,
    )
    db.add(work)
    db.flush()
    log_event(db, "publish_started", user_id=user.id, work_id=work.id)
    db.commit()
    db.refresh(work)
    return work


@app.get("/v1/works", response_model=list[WorkOut], tags=["作品"])
def list_works(db: Session = Depends(get_db)) -> list[Work]:
    return list(db.scalars(select(Work).order_by(Work.created_at.desc())))


@app.get("/v1/works/{work_id}", response_model=WorkOut, tags=["作品"])
def get_work(work_id: str, db: Session = Depends(get_db)) -> Work:
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")
    return work


@app.patch("/v1/works/{work_id}", response_model=WorkOut, tags=["作品"])
def update_work(
    work_id: str,
    payload: WorkUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work_id))
    work.title = payload.title
    work.description = payload.description
    work.tags = ",".join(tag.strip() for tag in payload.tags if tag.strip())
    work.cover_url = payload.cover_url.strip()
    work.trial_url = payload.trial_url.strip()
    work.review_status = ReviewStatus.pending
    work.review_note = "作品信息已修改，等待重新审核"
    work.reviewer_id = None
    work.reviewed_at = None
    if listing:
        listing.price_cents = payload.price_cents
        listing.status = ListingStatus.active
    log_event(db, "work_updated", user_id=user.id, work_id=work.id)
    log_event(db, "work_submitted", user_id=user.id, work_id=work.id, properties={"reason": "updated"})
    db.commit()
    db.refresh(work)
    return work


@app.post("/v1/works/{work_id}/deploy-static", response_model=StaticDeploymentOut, tags=["部署"])
def deploy_work_static(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StaticDeploymentOut:
    """MVP 自动部署：只接收作品所有者的纯前端 ZIP，生成购买前体验地址。"""
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    version = db.get(WorkVersion, listing.version_id) if listing else db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id).order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=400, detail="请先上传作品版本")
    work.deployment_status = "deploying"
    work.deployment_error = ""
    db.commit()
    try:
        trial_url = deploy_static_zip(work, version, db)
    except ValueError as error:
        work.deployment_status = "failed"
        work.deployment_error = str(error)
        db.commit()
        raise HTTPException(status_code=400, detail=f"静态部署失败：{error}") from error
    work.trial_url = trial_url
    work.deployment_status = "ready"
    work.deployment_error = ""
    log_event(db, "work_deployed", user_id=user.id, work_id=work.id, listing_id=listing.id if listing else None, properties={"version_number": version.version_number, "type": "static_zip"})
    db.commit()
    return StaticDeploymentOut(work_id=work.id, status=work.deployment_status, trial_url=trial_url, message="静态作品已部署，可在审核前进行体验")


@app.post("/v1/works/{work_id}/archive", response_model=WorkOut, tags=["作品"])
def archive_work(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work_id))
    if listing:
        listing.status = ListingStatus.archived
    log_event(db, "work_archived", user_id=user.id, work_id=work.id)
    db.commit()
    db.refresh(work)
    return work


@app.post("/v1/works/{work_id}/versions", response_model=VersionOut, tags=["作品"])
def create_version(
    work_id: str,
    payload: VersionCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> WorkVersion:
    get_owned_work(work_id, user, db)
    latest = db.scalar(
        select(WorkVersion.version_number)
        .where(WorkVersion.work_id == work_id)
        .order_by(WorkVersion.version_number.desc())
        .limit(1)
    )
    version = WorkVersion(
        work_id=work_id,
        version_number=(latest or 0) + 1,
        source_url=str(payload.source_url),
        changelog=payload.changelog,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@app.post("/v1/works/{work_id}/versions/release", response_model=VersionOut, tags=["作品"])
def release_work_version(
    work_id: str,
    payload: VersionCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> WorkVersion:
    """创建新版，并让新版进入审核；已购买用户仍保留原有可下载版本。"""
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work_id))
    if not listing:
        raise HTTPException(status_code=400, detail="请先完成首次发布后再更新版本")
    latest = db.scalar(
        select(WorkVersion.version_number)
        .where(WorkVersion.work_id == work_id)
        .order_by(WorkVersion.version_number.desc())
        .limit(1)
    )
    version = WorkVersion(
        work_id=work_id,
        version_number=(latest or 0) + 1,
        source_url=str(payload.source_url),
        changelog=payload.changelog,
    )
    db.add(version)
    db.flush()
    listing.version_id = version.id
    work.review_status = ReviewStatus.pending
    work.review_note = f"版本 v{version.version_number} 已提交，等待重新审核"
    work.reviewer_id = None
    work.reviewed_at = None
    log_event(db, "work_version_submitted", user_id=user.id, work_id=work.id, listing_id=listing.id, properties={"version_number": version.version_number})
    log_event(db, "work_submitted", user_id=user.id, work_id=work.id, listing_id=listing.id, properties={"reason": "version_update"})
    db.commit()
    db.refresh(version)
    return version


@app.post("/v1/listings", response_model=ListingOut, tags=["上架"])
def create_listing(
    payload: ListingCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Listing:
    get_owned_work(payload.work_id, user, db)
    version = db.get(WorkVersion, payload.version_id)
    if not version or version.work_id != payload.work_id:
        raise HTTPException(status_code=400, detail="版本不属于该作品")
    existing = db.scalar(select(Listing).where(Listing.work_id == payload.work_id))
    if existing:
        raise HTTPException(status_code=409, detail="该作品已上架")
    listing = Listing(work_id=payload.work_id, version_id=payload.version_id, price_cents=payload.price_cents)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@app.post("/v1/works/{work_id}/submit-review", response_model=WorkOut, tags=["审核"])
def submit_review(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    work = get_owned_work(work_id, user, db)
    if work.review_status == ReviewStatus.approved:
        raise HTTPException(status_code=409, detail="作品已经审核通过")
    if not db.scalar(select(WorkVersion.id).where(WorkVersion.work_id == work_id)):
        raise HTTPException(status_code=400, detail="请先创建作品版本")
    if not db.scalar(select(Listing.id).where(Listing.work_id == work_id)):
        raise HTTPException(status_code=400, detail="请先完成价格设置")
    if not work.trial_url.strip():
        raise HTTPException(status_code=400, detail="请提供购买前可访问的体验链接")
    db.execute(
        text("UPDATE works SET review_status = 'pending', review_note = '', reviewer_id = NULL, reviewed_at = NULL WHERE id = :work_id"),
        {"work_id": work.id},
    )
    log_event(db, "work_submitted", user_id=user.id, work_id=work.id)
    db.commit()
    db.refresh(work)
    return work


@app.get("/v1/admin/reviews", response_model=list[ReviewItem], tags=["管理后台"])
def admin_reviews(
    review_status: ReviewStatus = ReviewStatus.pending,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[ReviewItem]:
    require_admin(user)
    rows = db.execute(
        select(Work, WorkVersion)
        .join(Listing, Listing.work_id == Work.id)
        .join(WorkVersion, Listing.version_id == WorkVersion.id)
        .where(Work.review_status == review_status)
        .order_by(Work.created_at.asc())
    ).all()
    return [
        ReviewItem(
            id=work.id,
            title=work.title,
            description=work.description,
            cover_url=work.cover_url,
            trial_url=work.trial_url,
            tags=work.tags,
            review_status=work.review_status,
            review_note=work.review_note,
            source_url=version.source_url,
            created_at=work.created_at,
        )
        for work, version in rows
    ]


@app.post("/v1/admin/works/{work_id}/approve", response_model=WorkOut, tags=["管理后台"])
def approve_work(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    require_admin(user)
    work = db.get(Work, work_id)
    if not work or work.review_status != ReviewStatus.pending:
        raise HTTPException(status_code=404, detail="待审核作品不存在")
    db.execute(
        text("UPDATE works SET review_status = 'approved', reviewer_id = :reviewer_id, review_note = '审核通过', reviewed_at = :reviewed_at WHERE id = :work_id"),
        {"work_id": work.id, "reviewer_id": user.id, "reviewed_at": datetime.now(timezone.utc)},
    )
    log_event(db, "work_approved", user_id=user.id, work_id=work.id, properties={"creator_id": work.creator_id})
    db.commit()
    db.refresh(work)
    return work


@app.post("/v1/admin/works/{work_id}/reject", response_model=WorkOut, tags=["管理后台"])
def reject_work(
    work_id: str,
    payload: ReviewRejectIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Work:
    require_admin(user)
    work = db.get(Work, work_id)
    if not work or work.review_status != ReviewStatus.pending:
        raise HTTPException(status_code=404, detail="待审核作品不存在")
    db.execute(
        text("UPDATE works SET review_status = 'rejected', reviewer_id = :reviewer_id, review_note = :note, reviewed_at = :reviewed_at WHERE id = :work_id"),
        {"work_id": work.id, "reviewer_id": user.id, "note": payload.note, "reviewed_at": datetime.now(timezone.utc)},
    )
    log_event(db, "work_rejected", user_id=user.id, work_id=work.id, properties={"reason": payload.note})
    db.commit()
    db.refresh(work)
    return work


@app.get("/v1/admin/analytics/funnel", response_model=FunnelOut, tags=["管理后台"])
def analytics_funnel(
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FunnelOut:
    require_admin(user)
    start = from_date or (datetime.now(timezone.utc) - timedelta(days=30))
    end = to_date or datetime.now(timezone.utc)
    rows = db.execute(
        select(Event.event_name, func.count(Event.id))
        .where(Event.created_at >= start, Event.created_at <= end)
        .group_by(Event.event_name)
    ).all()
    counts = {name: count for name, count in rows}
    viewed = counts.get("work_viewed", 0)
    orders = counts.get("order_created", 0)
    paid = counts.get("payment_succeeded", 0)
    return FunnelOut(
        from_date=start,
        to_date=end,
        counts=counts,
        view_to_order_rate=round(orders / viewed, 4) if viewed else 0,
        order_to_paid_rate=round(paid / orders, 4) if orders else 0,
    )


@app.get("/v1/listings", response_model=list[ListingOut], tags=["上架"])
def list_listings(db: Session = Depends(get_db)) -> list[Listing]:
    return list(
        db.scalars(
            select(Listing)
            .join(Work, Listing.work_id == Work.id)
            .where(Listing.status == ListingStatus.active, Work.review_status == ReviewStatus.approved)
            .order_by(Listing.created_at.desc())
        )
    )


@app.get("/v1/marketplace", response_model=list[MarketplaceItem], tags=["市场"])
def marketplace(db: Session = Depends(get_db)) -> list[MarketplaceItem]:
    """给前端市场首页的商品卡片数据，避免前端拼接多次查询。"""
    rows = db.execute(
        select(Listing, Work, User)
        .join(Work, Listing.work_id == Work.id)
        .join(User, Work.creator_id == User.id)
        .where(Listing.status == ListingStatus.active, Work.review_status == ReviewStatus.approved)
        .order_by(Listing.created_at.desc())
    ).all()
    return [
        MarketplaceItem(
            listing_id=listing.id,
            work_id=work.id,
            version_id=listing.version_id,
            title=work.title,
            description=work.description,
            cover_url=work.cover_url,
            trial_url=work.trial_url,
            tags=[tag for tag in work.tags.split(",") if tag],
            creator_name=creator.display_name,
            price_cents=listing.price_cents,
            currency=listing.currency,
        )
        for listing, work, creator in rows
    ]


@app.post("/v1/events/work-viewed", tags=["数据事件"])
def track_work_view(payload: WorkViewIn, db: Session = Depends(get_db)) -> dict[str, str]:
    """匿名可用的浏览事件；登录后可在后续版本补充用户关联。"""
    log_event(db, "work_viewed", work_id=payload.work_id, listing_id=payload.listing_id, properties={"session_id": payload.session_id} if payload.session_id else None)
    db.commit()
    return {"status": "recorded"}


@app.post("/v1/events/work-tried", tags=["数据事件"])
def track_work_trial(payload: WorkViewIn, db: Session = Depends(get_db)) -> dict[str, str]:
    """记录购买前体验，用于区分“看过”与“实际试用”的转化。"""
    log_event(db, "work_tried", work_id=payload.work_id, listing_id=payload.listing_id, properties={"session_id": payload.session_id} if payload.session_id else None)
    db.commit()
    return {"status": "recorded"}


@app.post("/v1/orders", response_model=OrderOut, tags=["订单"])
def create_order(
    payload: OrderCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Order:
    listing = db.get(Listing, payload.listing_id)
    if not listing or listing.status != ListingStatus.active:
        raise HTTPException(status_code=404, detail="上架商品不存在或已下架")
    work = db.get(Work, listing.work_id)
    if not work or work.review_status != ReviewStatus.approved:
        raise HTTPException(status_code=404, detail="作品尚未审核通过")
    if work.creator_id == user.id:
        raise HTTPException(status_code=400, detail="暂不支持购买自己的作品")
    already_owned = db.scalar(
        select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == listing.work_id)
    )
    if already_owned:
        raise HTTPException(status_code=409, detail="你已拥有此作品")
    order = Order(buyer_id=user.id, listing_id=listing.id, amount_cents=listing.price_cents)
    db.add(order)
    db.flush()
    log_event(db, "purchase_clicked", user_id=user.id, work_id=listing.work_id, listing_id=listing.id)
    log_event(db, "order_created", user_id=user.id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id)
    db.commit()
    db.refresh(order)
    return order


@app.patch("/v1/me/payment-qr", response_model=UserOut, tags=["线下付款内测"])
def save_payment_qr(payload: PaymentQrIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
    """内测期仅保存创作者的线下收款指引图片，不构成平台支付能力。"""
    user.payment_qr_url = payload.qr_url
    db.commit()
    db.refresh(user)
    return user


@app.get("/v1/orders/{order_id}/offline-payment", response_model=OfflinePaymentInfo, tags=["线下付款内测"])
def offline_payment_info(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> OfflinePaymentInfo:
    order = db.get(Order, order_id)
    if not order or order.buyer_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    listing = db.get(Listing, order.listing_id)
    work = db.get(Work, listing.work_id) if listing else None
    creator = db.get(User, work.creator_id) if work else None
    if not creator or not creator.payment_qr_url:
        raise HTTPException(status_code=409, detail="创作者暂未设置线下收款码，请联系平台")
    return OfflinePaymentInfo(order_id=order.id, amount_cents=order.amount_cents, creator_name=creator.display_name, qr_url=creator.payment_qr_url)


@app.post("/v1/orders/{order_id}/payment-proof", response_model=OrderOut, tags=["线下付款内测"])
def submit_payment_proof(order_id: str, payload: PaymentProofIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Order:
    order = db.get(Order, order_id)
    if not order or order.buyer_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status not in {OrderStatus.created, OrderStatus.payment_failed}:
        raise HTTPException(status_code=409, detail="订单当前不能提交付款凭证")
    order.payment_proof_url = payload.proof_url
    order.payment_note = payload.note
    order.status = OrderStatus.payment_submitted
    listing = db.get(Listing, order.listing_id)
    log_event(db, "payment_proof_submitted", user_id=user.id, work_id=listing.work_id if listing else None, listing_id=order.listing_id, order_id=order.id)
    db.commit()
    db.refresh(order)
    return order


@app.post("/v1/admin/orders/{order_id}/confirm-offline-payment", response_model=OrderOut, tags=["管理后台"])
def confirm_offline_payment(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Order:
    require_admin(user)
    order = db.get(Order, order_id)
    if not order or order.status != OrderStatus.payment_submitted:
        raise HTTPException(status_code=404, detail="待核验订单不存在")
    listing = db.get(Listing, order.listing_id)
    if not listing:
        raise HTTPException(status_code=409, detail="上架商品已不存在")
    db.add(Entitlement(user_id=order.buyer_id, work_id=listing.work_id, source_order_id=order.id, version_id=listing.version_id))
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    order.payment_verified_at = order.paid_at
    order.payment_verified_by = user.id
    log_event(db, "payment_succeeded", user_id=order.buyer_id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id, properties={"amount_cents": order.amount_cents, "method": "offline_manual"})
    order.status = OrderStatus.delivered
    log_event(db, "entitlement_granted", user_id=order.buyer_id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id)
    db.commit()
    db.refresh(order)
    return order


@app.get("/v1/admin/offline-payments", tags=["管理后台"])
def pending_offline_payments(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, object]]:
    require_admin(user)
    rows = db.execute(select(Order, Listing, Work, User).join(Listing, Order.listing_id == Listing.id).join(Work, Listing.work_id == Work.id).join(User, Order.buyer_id == User.id).where(Order.status == OrderStatus.payment_submitted).order_by(Order.created_at.asc())).all()
    return [{"order_id": order.id, "title": work.title, "amount_cents": order.amount_cents, "buyer_name": buyer.display_name, "proof_url": order.payment_proof_url, "note": order.payment_note, "created_at": order.created_at} for order, _listing, work, buyer in rows]


@app.post("/v1/orders/{order_id}/simulate-paid", response_model=OrderOut, tags=["订单"])
def simulate_paid(
    order_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Order:
    """评选版支付演示：验证订单后直接完成交付；不接触真实资金。"""
    order = db.get(Order, order_id)
    if not order or order.buyer_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status == OrderStatus.delivered:
        return order
    if order.status not in {OrderStatus.created, OrderStatus.payment_failed}:
        raise HTTPException(status_code=409, detail="订单当前不可支付")
    listing = db.get(Listing, order.listing_id)
    if not listing:
        raise HTTPException(status_code=409, detail="上架商品已不存在")
    entitlement = Entitlement(
        user_id=user.id,
        work_id=listing.work_id,
        source_order_id=order.id,
        version_id=listing.version_id,
    )
    # 评选版不接真实支付渠道：仍保留 paid 事件，再立即完成数字作品交付。
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    db.add(entitlement)
    log_event(db, "payment_succeeded", user_id=user.id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id, properties={"amount_cents": order.amount_cents})
    order.status = OrderStatus.delivered
    log_event(db, "entitlement_granted", user_id=user.id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id)
    db.commit()
    db.refresh(order)
    return order


@app.post("/v1/orders/{order_id}/simulate-payment-failed", response_model=OrderOut, tags=["订单"])
def simulate_payment_failed(
    order_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Order:
    """本地演示支付失败；失败后可再次模拟支付。"""
    order = db.get(Order, order_id)
    if not order or order.buyer_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != OrderStatus.created:
        raise HTTPException(status_code=409, detail="订单当前不能标记为支付失败")
    order.status = OrderStatus.payment_failed
    listing = db.get(Listing, order.listing_id)
    log_event(db, "payment_failed", user_id=user.id, work_id=listing.work_id if listing else None, listing_id=order.listing_id, order_id=order.id)
    db.commit()
    db.refresh(order)
    return order


@app.post("/v1/orders/{order_id}/simulate-refund", response_model=OrderOut, tags=["订单"])
def simulate_refund(
    order_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Order:
    """本地演示退款：撤销本订单生成的下载/访问权益。"""
    order = db.get(Order, order_id)
    if not order or order.buyer_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != OrderStatus.delivered:
        raise HTTPException(status_code=409, detail="只有已交付订单可以退款")
    entitlement = db.scalar(select(Entitlement).where(Entitlement.source_order_id == order.id))
    if entitlement:
        db.delete(entitlement)
    order.status = OrderStatus.refunded
    order.refunded_at = datetime.now(timezone.utc)
    listing = db.get(Listing, order.listing_id)
    log_event(db, "refund_succeeded", user_id=user.id, work_id=listing.work_id if listing else None, listing_id=order.listing_id, order_id=order.id, properties={"amount_cents": order.amount_cents})
    db.commit()
    db.refresh(order)
    return order


@app.get("/v1/me/orders", response_model=list[MyOrderItem], tags=["我的"])
def my_orders(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[MyOrderItem]:
    rows = db.execute(
        select(Order, Listing, Work)
        .join(Listing, Order.listing_id == Listing.id)
        .join(Work, Listing.work_id == Work.id)
        .where(Order.buyer_id == user.id)
        .order_by(Order.created_at.desc())
    ).all()
    return [
        MyOrderItem(
            order_id=order.id,
            title=work.title,
            amount_cents=order.amount_cents,
            currency=listing.currency,
            status=order.status,
            created_at=order.created_at,
            paid_at=order.paid_at,
            refunded_at=order.refunded_at,
        )
        for order, listing, work in rows
    ]


@app.get("/v1/me/creator/dashboard", response_model=CreatorDashboardOut, tags=["创作者中心"])
def creator_dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)) -> CreatorDashboardOut:
    work_rows = db.execute(
        select(Work, Listing)
        .outerjoin(Listing, Listing.work_id == Work.id)
        .where(Work.creator_id == user.id)
        .order_by(Work.created_at.desc())
    ).all()
    works = [
        MyWorkItem(
            work_id=work.id,
            title=work.title,
            description=work.description,
            tags=work.tags,
            cover_url=work.cover_url,
            trial_url=work.trial_url,
            deployment_status=work.deployment_status,
            deployment_error=work.deployment_error,
            review_status=work.review_status,
            review_note=work.review_note,
            price_cents=listing.price_cents if listing else None,
            listing_status=listing.status if listing else None,
            created_at=work.created_at,
        )
        for work, listing in work_rows
    ]
    sale_rows = db.execute(
        select(Order, Work)
        .join(Listing, Order.listing_id == Listing.id)
        .join(Work, Listing.work_id == Work.id)
        .where(Work.creator_id == user.id)
        .order_by(Order.created_at.desc())
    ).all()
    sales = [
        CreatorSaleItem(order_id=order.id, title=work.title, amount_cents=order.amount_cents, status=order.status, paid_at=order.paid_at)
        for order, work in sale_rows
    ]
    total = sum(order.amount_cents for order, _ in sale_rows if order.status == OrderStatus.delivered)
    return CreatorDashboardOut(
        total_revenue_cents=total,
        paid_order_count=sum(1 for order, _ in sale_rows if order.status == OrderStatus.delivered),
        pending_review_count=sum(1 for work, _ in work_rows if work.review_status == ReviewStatus.pending),
        works=works,
        recent_sales=sales[:20],
    )


@app.get("/v1/me/entitlements", response_model=list[OwnedWorkItem], tags=["我的"])
def my_entitlements(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[OwnedWorkItem]:
    # 管理员具有平台治理所需的全部作品使用权，不需要为每个作品创建购买订单。
    if user.is_admin:
        works = list(db.scalars(select(Work).order_by(Work.created_at.desc())))
        result: list[OwnedWorkItem] = []
        for work in works:
            version = db.scalar(
                select(WorkVersion)
                .where(WorkVersion.work_id == work.id)
                .order_by(WorkVersion.version_number.desc())
                .limit(1)
            )
            if not version:
                continue
            result.append(OwnedWorkItem(
                entitlement_id=f"admin-{work.id}", work_id=work.id, title=work.title,
                description=work.description, source_url=version.source_url,
                version_number=version.version_number, latest_version_number=version.version_number,
                granted_at=work.reviewed_at or work.created_at,
            ))
        return result
    rows = db.execute(
        select(Entitlement, Work, WorkVersion)
        .join(Work, Entitlement.work_id == Work.id)
        .join(WorkVersion, Entitlement.version_id == WorkVersion.id)
        .where(Entitlement.user_id == user.id)
        .order_by(Entitlement.created_at.desc())
    ).all()
    return [
        OwnedWorkItem(
            entitlement_id=entitlement.id,
            work_id=work.id,
            title=work.title,
            description=work.description,
            source_url=version.source_url,
            version_number=version.version_number,
            latest_version_number=db.scalar(select(func.max(WorkVersion.version_number)).where(WorkVersion.work_id == work.id)) or version.version_number,
            granted_at=entitlement.created_at,
        )
        for entitlement, work, version in rows
    ]


@app.get("/v1/me/works/{work_id}/versions", response_model=list[VersionHistoryItem], tags=["我的"])
def my_work_version_history(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[VersionHistoryItem]:
    entitlement = db.scalar(select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == work_id))
    work = db.get(Work, work_id)
    if not work or (work.creator_id != user.id and not entitlement):
        raise HTTPException(status_code=404, detail="作品不存在或你无权查看版本记录")
    versions = list(db.scalars(select(WorkVersion).where(WorkVersion.work_id == work_id).order_by(WorkVersion.version_number.desc())))
    latest_id = versions[0].id if versions else None
    return [
        VersionHistoryItem(
            id=version.id,
            version_number=version.version_number,
            changelog=version.changelog,
            created_at=version.created_at,
            is_owned_version=bool(entitlement and entitlement.version_id == version.id),
            is_latest=version.id == latest_id,
        )
        for version in versions
    ]


@app.post("/v1/me/works/{work_id}/upgrade", response_model=EntitlementOut, tags=["我的"])
def upgrade_owned_work(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Entitlement:
    """将已有权益升级到审核通过、已上架的最新版本。"""
    entitlement = db.scalar(select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == work_id))
    listing = db.scalar(select(Listing).where(Listing.work_id == work_id, Listing.status == ListingStatus.active))
    work = db.get(Work, work_id)
    if not entitlement:
        raise HTTPException(status_code=404, detail="你还没有该作品的权益")
    if not listing or not work or work.review_status != ReviewStatus.approved:
        raise HTTPException(status_code=409, detail="最新版本尚未审核通过")
    if entitlement.version_id == listing.version_id:
        return entitlement
    entitlement.version_id = listing.version_id
    log_event(db, "entitlement_upgraded", user_id=user.id, work_id=work_id, listing_id=listing.id, order_id=entitlement.source_order_id)
    db.commit()
    db.refresh(entitlement)
    return entitlement


@app.post("/v1/agent/summarize", response_model=AgentSummaryOut, tags=["AI"])
async def agent_summarize(payload: AgentSummaryIn) -> AgentSummaryOut:
    try:
        summary, provider = await summarize_work(payload.title, payload.description, settings)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="AI 服务暂时不可用") from error
    return AgentSummaryOut(summary=summary, provider=provider)
