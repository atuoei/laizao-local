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
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import engine, get_db
from .models import AdminQueryAudit, BuildTask, DataQualityCheck, Entitlement, Event, LedgerEntry, LedgerTransaction, Listing, ListingStatus, Order, OrderStatus, PaymentAttempt, Refund, ReviewStatus, StoredFile, User, Work, WorkVersion
from .schemas import (
    AgentSummaryIn,
    AgentSummaryOut,
    AuthSessionOut,
    CreatorDashboardOut,
    CreatorSaleItem,
    DevLoginIn,
    EntitlementOut,
    FunnelOut,
    OperationsOverviewOut,
    DataQualityItem,
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
    BuildInspectionOut,
    FullStackTemplateInspectionOut,
    BuildTaskOut,
    BuildWorkerCompletionIn,
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
    """只校验运行安全条件；表结构统一由 Alembic 管理。"""
    if settings.is_production and settings.auth_secret == "change-this-before-production":
        raise RuntimeError("生产环境必须设置强 AUTH_SECRET")
    if settings.is_production and settings.sms_mode == "local":
        raise RuntimeError("生产环境不能使用本地固定验证码；请先接入真实短信服务")
    if settings.is_production and not settings.admin_initial_password:
        raise RuntimeError("生产环境必须设置 ADMIN_INITIAL_PASSWORD 后再初始化管理员")
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


def require_build_worker(x_build_worker_token: str | None = Header(default=None)) -> None:
    if not settings.build_worker_token or not x_build_worker_token:
        raise HTTPException(status_code=401, detail="构建 Worker 未授权")
    if not hmac.compare_digest(x_build_worker_token, settings.build_worker_token):
        raise HTTPException(status_code=401, detail="构建 Worker 未授权")


def log_event(db: Session, event_name: str, *, user_id: str | None = None, work_id: str | None = None, listing_id: str | None = None, order_id: str | None = None, session_id: str | None = None, dedupe_key: str | None = None, properties: dict[str, object] | None = None) -> None:
    if dedupe_key and db.scalar(select(Event.id).where(Event.dedupe_key == dedupe_key)):
        return
    event = Event(event_name=event_name, user_id=user_id, work_id=work_id, listing_id=listing_id, order_id=order_id, session_id=session_id, dedupe_key=dedupe_key, properties_json=json.dumps(properties or {}, ensure_ascii=False))
    if not dedupe_key:
        db.add(event)
        return
    try:
        with db.begin_nested():
            db.add(event)
            db.flush()
    except IntegrityError:
        # 并发重复事件由数据库唯一约束吞掉，不污染主事务。
        return


def ledger_postings(amount_cents: int, creator_id: str, reference_type: str, fee_bps: int) -> list[tuple[str, str, int]]:
    fee = amount_cents * fee_bps // 10_000
    creator_net = amount_cents - fee
    if reference_type == "payment":
        entries = [("cash:clearing", "debit", amount_cents), (f"creator_payable:{creator_id}", "credit", creator_net), ("platform:commission_revenue", "credit", fee)]
    elif reference_type == "refund":
        entries = [(f"creator_payable:{creator_id}", "debit", creator_net), ("platform:commission_revenue", "debit", fee), ("cash:clearing", "credit", amount_cents)]
    else:
        raise ValueError(f"unsupported ledger reference: {reference_type}")
    return [entry for entry in entries if entry[2] > 0]


def book_ledger(db: Session, order: Order, reference_type: str, reference_id: str) -> None:
    """写入借贷相等的不可变分录；相同业务引用只入账一次。"""
    if order.amount_cents == 0 or db.scalar(select(LedgerTransaction.id).where(
        LedgerTransaction.reference_type == reference_type,
        LedgerTransaction.reference_id == reference_id,
    )):
        return
    transaction = LedgerTransaction(reference_type=reference_type, reference_id=reference_id, order_id=order.id, currency=order.currency)
    db.add(transaction)
    db.flush()
    for account_code, direction, amount in ledger_postings(order.amount_cents, order.creator_id, reference_type, settings.platform_fee_bps):
        db.add(LedgerEntry(transaction_id=transaction.id, account_code=account_code, direction=direction, amount_cents=amount))


def stored_file_url(file_id: str) -> str:
    return f"{settings.public_api_base_url.rstrip('/')}/v1/files/{file_id}"


def version_source_snapshot(source_url: str, user: User, db: Session) -> tuple[str | None, str]:
    """把可变 URL 解析为受控文件引用，并给每个版本留下内容指纹。"""
    marker = "/v1/files/"
    if marker not in source_url:
        return None, hashlib.sha256(source_url.encode()).hexdigest()
    file_id = source_url.rstrip("/").rsplit(marker, 1)[-1]
    stored = db.get(StoredFile, file_id)
    if not stored or stored.owner_id != user.id or stored.kind != "work_package" or stored.deleted_at is not None:
        raise HTTPException(status_code=400, detail="作品文件不存在或不属于当前用户")
    if stored.scan_status != "basic_passed":
        raise HTTPException(status_code=409, detail="作品文件尚未通过安全检查")
    return stored.id, stored.sha256


STATIC_WORK_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".map", ".txt", ".webmanifest",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif",
    ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".ogg", ".mp4", ".webm",
}

# 全栈作品不是“上传 Dockerfile 就能运行”。平台只接受这一种明确、可审计的
# 目录契约；运行时镜像、网络、密钥和数据库权限均由平台生成。
FULL_STACK_TEMPLATE = "fastapi-react-v1"
FULL_STACK_FORBIDDEN_FILE_NAMES = {
    ".env", ".env.local", ".env.production", ".env.development",
    "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
}
FULL_STACK_FORBIDDEN_DIRECTORIES = {"node_modules", ".git", "__pycache__", ".venv", "venv"}


def get_version_package(version: WorkVersion, db: Session) -> tuple[StoredFile, Path]:
    """取得作品版本对应的原始 ZIP，绝不根据用户输入拼接服务器路径。"""
    file_id = version.source_url.rstrip("/").rsplit("/v1/files/", 1)[-1]
    stored_file = db.get(StoredFile, file_id)
    if not stored_file or stored_file.kind != "work_package":
        raise ValueError("当前版本不是可自动部署的 ZIP 作品包")
    source = Path(settings.upload_dir) / stored_file.storage_key
    if not source.is_file():
        raise ValueError("原始 ZIP 文件不存在")
    return stored_file, source


def safe_archive_files(source: Path) -> list[zipfile.ZipInfo]:
    """返回经路径、软链接、体积检查的普通文件清单，不解压也不运行代码。"""
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 500:
            raise ValueError("ZIP 文件数量不能超过 500 个")
        file_count = 0
        unpacked_size = 0
        for info in infos:
            name = PurePosixPath(info.filename)
            if name.is_absolute() or ".." in name.parts or not info.filename:
                raise ValueError("ZIP 包含不安全路径")
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("ZIP 不允许包含软链接")
            if info.is_dir():
                continue
            file_count += 1
            unpacked_size += info.file_size
            if file_count > 500 or unpacked_size > 50 * 1024 * 1024:
                raise ValueError("解压后的作品不能超过 50MB 或 500 个文件")
        return [info for info in infos if not info.is_dir()]


def inspect_vite_project_zip(version: WorkVersion, db: Session) -> BuildInspectionOut:
    """仅识别平台 MVP 支持的 Vite + npm 项目；不会执行 package.json 中任何脚本。"""
    _, source = get_version_package(version, db)
    try:
        files = safe_archive_files(source)
        names = {PurePosixPath(info.filename).as_posix(): info for info in files}
        package_info = names.get("package.json")
        lock_info = names.get("package-lock.json")
        if not package_info:
            raise ValueError("根目录缺少 package.json；当前只能构建 Vite 前端项目")
        if not lock_info:
            raise ValueError("根目录缺少 package-lock.json；为保证构建可复现，暂不支持无锁文件项目")
        with zipfile.ZipFile(source) as archive:
            raw = archive.read(package_info)
        if len(raw) > 512 * 1024:
            raise ValueError("package.json 不能超过 512KB")
        package = json.loads(raw.decode("utf-8"))
        if not isinstance(package, dict):
            raise ValueError("package.json 格式无效")
        scripts = package.get("scripts")
        if not isinstance(scripts, dict) or not isinstance(scripts.get("build"), str):
            raise ValueError("package.json 必须提供 build 脚本")
        build_script = scripts["build"].strip()
        if build_script != "vite build":
            raise ValueError("当前只支持 build 为 vite build 的静态项目")
        blocked = {"preinstall", "install", "postinstall", "prepare"} & set(scripts)
        if blocked:
            raise ValueError(f"项目包含不允许的安装脚本：{', '.join(sorted(blocked))}")
        dependencies = {**(package.get("dependencies") or {}), **(package.get("devDependencies") or {})}
        if "vite" not in dependencies:
            raise ValueError("项目未声明 Vite 依赖")
        return BuildInspectionOut(
            work_id=version.work_id,
            accepted=True,
            project_type="vite_static",
            package_manager="npm",
            build_command="npm ci --ignore-scripts && npm run build",
            output_directory="dist",
            message="检查通过：可提交到隔离构建器。构建成功后仅发布 dist 静态文件。",
        )
    except (zipfile.BadZipFile, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        return BuildInspectionOut(
            work_id=version.work_id,
            accepted=False,
            project_type="unsupported",
            message=f"项目检查未通过：{error}",
        )


def inspect_full_stack_template_zip(version: WorkVersion, db: Session) -> FullStackTemplateInspectionOut:
    """仅做静态检查，不安装依赖、更不执行作品后端代码。"""
    _, source = get_version_package(version, db)
    try:
        files = safe_archive_files(source)
        names = {PurePosixPath(info.filename).as_posix(): info for info in files}
        for name in names:
            path = PurePosixPath(name)
            lower_name = path.name.lower()
            if lower_name in FULL_STACK_FORBIDDEN_FILE_NAMES:
                raise ValueError(f"不允许上传 {path.name}；镜像、密钥和编排文件由平台生成")
            if any(part.lower() in FULL_STACK_FORBIDDEN_DIRECTORIES for part in path.parts):
                raise ValueError(f"不允许上传 {path.parts[0]} 目录")

        manifest_info = names.get("laizao.app.json")
        package_info = names.get("frontend/package.json")
        lock_info = names.get("frontend/package-lock.json")
        requirements_info = names.get("backend/requirements.txt")
        entry_info = names.get("backend/app/main.py")
        missing = [label for label, info in {
            "laizao.app.json": manifest_info,
            "frontend/package.json": package_info,
            "frontend/package-lock.json": lock_info,
            "backend/requirements.txt": requirements_info,
            "backend/app/main.py": entry_info,
        }.items() if not info]
        if missing:
            raise ValueError(f"缺少模板必需文件：{', '.join(missing)}")

        with zipfile.ZipFile(source) as archive:
            manifest_raw = archive.read(manifest_info)
            package_raw = archive.read(package_info)
            requirements_raw = archive.read(requirements_info)
        if len(manifest_raw) > 128 * 1024 or len(package_raw) > 512 * 1024:
            raise ValueError("配置文件过大")
        manifest = json.loads(manifest_raw.decode("utf-8"))
        package = json.loads(package_raw.decode("utf-8"))
        if not isinstance(manifest, dict) or not isinstance(package, dict):
            raise ValueError("laizao.app.json 或 package.json 格式无效")
        if manifest.get("template") != FULL_STACK_TEMPLATE:
            raise ValueError(f"当前仅支持 template 为 {FULL_STACK_TEMPLATE}")
        frontend = manifest.get("frontend")
        backend = manifest.get("backend")
        if not isinstance(frontend, dict) or frontend.get("build") != "vite" or frontend.get("output") != "dist":
            raise ValueError("frontend 必须声明 build 为 vite、output 为 dist")
        if not isinstance(backend, dict) or backend.get("entry") != "backend.app.main:app":
            raise ValueError("backend.entry 必须是 backend.app.main:app")
        health_path = backend.get("health")
        if not isinstance(health_path, str) or not health_path.startswith("/") or "//" in health_path:
            raise ValueError("backend.health 必须是以 / 开头的健康检查路径")
        scripts = package.get("scripts")
        if not isinstance(scripts, dict) or scripts.get("build", "").strip() != "vite build":
            raise ValueError("frontend/package.json 的 build 必须严格为 vite build")
        blocked = {"preinstall", "install", "postinstall", "prepare"} & set(scripts)
        if blocked:
            raise ValueError(f"前端包含不允许的安装脚本：{', '.join(sorted(blocked))}")
        dependencies = {**(package.get("dependencies") or {}), **(package.get("devDependencies") or {})}
        if "vite" not in dependencies:
            raise ValueError("前端未声明 Vite 依赖")
        requirements = requirements_raw.decode("utf-8")
        forbidden_requirement = next((line.strip() for line in requirements.splitlines()
                                      if line.strip() and not line.lstrip().startswith("#") and
                                      (line.lstrip().startswith(("-e ", "git+", "http://", "https://")) or " @ git+" in line)), None)
        if forbidden_requirement:
            raise ValueError("requirements.txt 不允许可变的本地、Git 或 URL 依赖")
        return FullStackTemplateInspectionOut(
            work_id=version.work_id,
            accepted=True,
            template=FULL_STACK_TEMPLATE,
            frontend_build_command="npm ci --ignore-scripts && vite build",
            backend_entry="backend.app.main:app",
            health_path=health_path,
            deployment_policy="仅管理员可发起；平台生成非 root 容器、独立网络与运行配置。",
            message="检查通过：该 ZIP 符合全栈模板。尚未运行任何代码，也尚未部署。",
        )
    except (zipfile.BadZipFile, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        return FullStackTemplateInspectionOut(
            work_id=version.work_id,
            accepted=False,
            deployment_policy="未通过检查的 ZIP 不能进入构建或部署队列。",
            message=f"全栈模板检查未通过：{error}",
        )


def public_trial_url(work: Work, version: WorkVersion) -> str:
    """为静态作品生成公开体验地址；子域名模式不依赖数据库查找。"""
    base = settings.trial_subdomain_base.strip().lower().strip(".")
    if base:
        return f"https://{work.id}-v{version.version_number}.{base}/"
    return f"{settings.public_api_base_url.rstrip('/')}/v1/trials/{work.id}/v{version.version_number}/"


def static_archive_layout(infos: list[zipfile.ZipInfo]) -> tuple[list[zipfile.ZipInfo], tuple[str, ...]]:
    """识别静态 ZIP 的入口，兼容 macOS 元数据和一层项目外包装目录。"""
    content = []
    for info in infos:
        path = PurePosixPath(info.filename)
        if not path.parts or path.parts[0] == "__MACOSX" or path.name.startswith("._") or path.name == ".DS_Store":
            continue
        content.append(info)
    names = {PurePosixPath(info.filename).as_posix() for info in content}
    if "index.html" in names:
        return content, ()

    roots = {PurePosixPath(info.filename).parts[0] for info in content}
    if len(roots) == 1:
        wrapper = next(iter(roots))
        if f"{wrapper}/index.html" in names:
            return content, (wrapper,)
    raise ValueError("纯前端 ZIP 需要在根目录或唯一项目文件夹内包含 index.html")


def deploy_static_zip(work: Work, version: WorkVersion, db: Session) -> str:
    """安全解压纯前端 ZIP，返回公开体验地址。绝不执行 ZIP 中的脚本。"""
    _, source = get_version_package(version, db)
    target = trial_root / work.id / f"v{version.version_number}"
    temporary = trial_root / work.id / f".deploying-{uuid.uuid4().hex}"
    file_count = 0
    unpacked_size = 0
    try:
        with zipfile.ZipFile(source) as archive:
            infos, wrapper = static_archive_layout(safe_archive_files(source))
            for info in infos:
                name = PurePosixPath(info.filename)
                file_count += 1
                unpacked_size += info.file_size
                if file_count > 500 or unpacked_size > 50 * 1024 * 1024:
                    raise ValueError("解压后的作品不能超过 50MB 或 500 个文件")
                if name.suffix.lower() not in STATIC_WORK_EXTENSIONS:
                    raise ValueError(f"不支持部署文件类型：{name.suffix or name.name}")
            temporary.mkdir(parents=True, exist_ok=False)
            for info in infos:
                if info.is_dir():
                    continue
                parts = PurePosixPath(info.filename).parts[len(wrapper):]
                if not parts:
                    continue
                destination = temporary.joinpath(*parts)
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
    return public_trial_url(work, version)


def can_access_file(stored_file: StoredFile, user: User, db: Session) -> bool:
    if user.is_admin:
        return True
    if stored_file.owner_id == user.id:
        return True
    return bool(
        db.scalar(
            select(Entitlement.id)
            .join(WorkVersion, Entitlement.version_id == WorkVersion.id)
            .where(
                Entitlement.user_id == user.id,
                Entitlement.status == "active",
                (WorkVersion.stored_file_id == stored_file.id) | (WorkVersion.source_url == stored_file_url(stored_file.id)),
            )
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
    digest = hashlib.sha256()
    try:
        with destination.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                if not first_chunk:
                    first_chunk = chunk
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="文件不能超过 100MB")
                target.write(chunk)
                digest.update(chunk)
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
        sha256=digest.hexdigest(),
        scan_status="basic_passed",
    )
    db.add(stored_file)
    log_event(db, "work_file_uploaded", user_id=user.id, properties={"size_bytes": total})
    db.commit()
    return UploadOut(file_id=file_id, original_name=stored_file.original_name, size_bytes=total, source_url=stored_file_url(file_id), sha256=stored_file.sha256)


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
    first_chunk = b""
    digest = hashlib.sha256()
    try:
        with destination.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                if not first_chunk:
                    first_chunk = chunk
                total += len(chunk)
                if total > settings.max_cover_bytes:
                    raise HTTPException(status_code=413, detail="封面图片不能超过 5MB")
                target.write(chunk)
                digest.update(chunk)
        signatures = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".webp": b"RIFF"}
        if not first_chunk.startswith(signatures[extension]) or (extension == ".webp" and first_chunk[8:12] != b"WEBP"):
            raise HTTPException(status_code=400, detail="图片内容与文件扩展名不匹配")
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    stored_file = StoredFile(id=file_id, owner_id=user.id, original_name=original_name[:255], storage_key=str(destination.relative_to(Path(settings.upload_dir))), content_type=allowed[extension], kind="cover_image", size_bytes=total, sha256=digest.hexdigest(), scan_status="basic_passed")
    db.add(stored_file)
    log_event(db, "cover_uploaded", user_id=user.id, properties={"size_bytes": total})
    db.commit()
    source_url = f"{settings.public_api_base_url.rstrip('/')}/v1/public/files/{file_id}"
    return UploadOut(file_id=file_id, original_name=stored_file.original_name, size_bytes=total, source_url=source_url, sha256=stored_file.sha256)


@app.get("/v1/public/files/{file_id}", tags=["文件上传"])
def public_cover_file(file_id: str, db: Session = Depends(get_db)) -> FileResponse:
    stored_file = db.get(StoredFile, file_id)
    if not stored_file or stored_file.kind != "cover_image" or stored_file.deleted_at is not None:
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
    if not stored_file or stored_file.deleted_at is not None or not can_access_file(stored_file, user, db):
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


@app.get("/v1/me/works", response_model=list[WorkOut], tags=["我的"])
def list_my_works(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[Work]:
    return list(db.scalars(select(Work).where(Work.creator_id == user.id).order_by(Work.created_at.desc())))


@app.get("/v1/me/works/{work_id}", response_model=WorkOut, tags=["我的"])
def get_my_work(work_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Work:
    work = db.get(Work, work_id)
    if not work or (work.creator_id != user.id and not user.is_admin):
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


@app.post("/v1/works/{work_id}/inspect-vite-build", response_model=BuildInspectionOut, tags=["部署"])
def inspect_work_vite_build(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BuildInspectionOut:
    """非静态 ZIP 的准入检查。通过不代表已执行构建，构建由隔离 worker 处理。"""
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    version = db.get(WorkVersion, listing.version_id) if listing else db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id).order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=400, detail="请先上传作品版本")
    result = inspect_vite_project_zip(version, db)
    log_event(db, "vite_build_inspected", user_id=user.id, work_id=work.id, properties={"accepted": result.accepted, "project_type": result.project_type})
    db.commit()
    return result


@app.post("/v1/admin/works/{work_id}/inspect-fullstack-template", response_model=FullStackTemplateInspectionOut, tags=["管理后台", "部署"])
def inspect_fullstack_template(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FullStackTemplateInspectionOut:
    """管理员预检受控 React + FastAPI ZIP；不会构建或启动容器。"""
    require_admin(user)
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    version = db.get(WorkVersion, listing.version_id) if listing else db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id).order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=400, detail="该作品还没有上传版本")
    result = inspect_full_stack_template_zip(version, db)
    log_event(db, "fullstack_template_inspected", user_id=user.id, work_id=work.id,
              properties={"accepted": result.accepted, "template": result.template or ""})
    db.commit()
    return result


@app.post("/v1/works/{work_id}/build-vite", response_model=BuildTaskOut, tags=["部署"])
def queue_work_vite_build(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BuildTask:
    """创建隔离构建任务；API 自身不会执行来自 ZIP 的代码。"""
    work = get_owned_work(work_id, user, db)
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    version = db.get(WorkVersion, listing.version_id) if listing else db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id).order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=400, detail="请先上传作品版本")
    inspected = inspect_vite_project_zip(version, db)
    if not inspected.accepted:
        raise HTTPException(status_code=400, detail=inspected.message)
    running = db.scalar(
        select(BuildTask).where(BuildTask.work_id == work.id, BuildTask.status.in_(["queued", "building"])).limit(1)
    )
    if running:
        return running
    task = BuildTask(work_id=work.id, version_id=version.id, requested_by=user.id, status="queued")
    work.deployment_status = "queued"
    work.deployment_error = ""
    db.add(task)
    log_event(db, "vite_build_queued", user_id=user.id, work_id=work.id, properties={"version_number": version.version_number})
    db.commit()
    db.refresh(task)
    return task


@app.get("/v1/works/{work_id}/build-vite/latest", response_model=BuildTaskOut, tags=["部署"])
def latest_work_vite_build(
    work_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BuildTask:
    work = get_owned_work(work_id, user, db)
    task = db.scalar(select(BuildTask).where(BuildTask.work_id == work.id).order_by(BuildTask.created_at.desc()).limit(1))
    if not task:
        raise HTTPException(status_code=404, detail="该作品还没有构建任务")
    return task


@app.post("/v1/internal/builds/next", tags=["内部构建"])
def next_build_task(
    _: None = Depends(require_build_worker),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """仅给独立 Worker 使用：领取一个任务并返回只读源包位置。"""
    task = db.scalar(select(BuildTask).where(BuildTask.status == "queued").order_by(BuildTask.created_at).limit(1))
    if not task:
        return {"task": None}
    version = db.get(WorkVersion, task.version_id)
    work = db.get(Work, task.work_id)
    if not version or not work:
        task.status = "failed"
        task.log_text = "关联的作品或版本不存在"
        task.finished_at = datetime.now(timezone.utc)
        db.commit()
        return {"task": None}
    _, source = get_version_package(version, db)
    task.status = "building"
    task.started_at = datetime.now(timezone.utc)
    work.deployment_status = "building"
    db.commit()
    return {"task": {"id": task.id, "work_id": work.id, "version_number": version.version_number, "source_path": str(source)}}


@app.post("/v1/internal/builds/{task_id}/complete", response_model=BuildTaskOut, tags=["内部构建"])
def complete_build_task(
    task_id: str,
    payload: BuildWorkerCompletionIn,
    _: None = Depends(require_build_worker),
    db: Session = Depends(get_db),
) -> BuildTask:
    task = db.get(BuildTask, task_id)
    if not task or task.status != "building":
        raise HTTPException(status_code=404, detail="构建任务不存在或未在执行")
    work = db.get(Work, task.work_id)
    version = db.get(WorkVersion, task.version_id)
    task.status = payload.status
    task.log_text = payload.log_text[-20_000:]
    task.finished_at = datetime.now(timezone.utc)
    if payload.status == "succeeded" and work and version:
        trial_url = public_trial_url(work, version)
        task.trial_url = trial_url
        work.trial_url = trial_url
        work.deployment_status = "ready"
        work.deployment_error = ""
        log_event(db, "vite_build_succeeded", user_id=task.requested_by, work_id=work.id, properties={"version_number": version.version_number})
    elif work:
        work.deployment_status = "failed"
        work.deployment_error = "隔离构建失败，请查看构建日志"
        log_event(db, "vite_build_failed", user_id=task.requested_by, work_id=work.id)
    db.commit()
    db.refresh(task)
    return task


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
    source_url = str(payload.source_url)
    stored_file_id, snapshot_hash = version_source_snapshot(source_url, user, db)
    version = WorkVersion(
        work_id=work_id,
        version_number=(latest or 0) + 1,
        source_url=source_url,
        stored_file_id=stored_file_id,
        snapshot_hash=snapshot_hash,
        changelog=payload.changelog,
        review_status=ReviewStatus.draft,
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
    if db.scalar(select(WorkVersion.id).where(WorkVersion.work_id == work_id, WorkVersion.review_status == ReviewStatus.pending).limit(1)):
        raise HTTPException(status_code=409, detail="已有版本等待审核，请先完成审核再提交下一版")
    latest = db.scalar(
        select(WorkVersion.version_number)
        .where(WorkVersion.work_id == work_id)
        .order_by(WorkVersion.version_number.desc())
        .limit(1)
    )
    source_url = str(payload.source_url)
    stored_file_id, snapshot_hash = version_source_snapshot(source_url, user, db)
    version = WorkVersion(
        work_id=work_id,
        version_number=(latest or 0) + 1,
        source_url=source_url,
        stored_file_id=stored_file_id,
        snapshot_hash=snapshot_hash,
        changelog=payload.changelog,
        review_status=ReviewStatus.pending,
    )
    db.add(version)
    db.flush()
    # 线上 listing 继续指向最后一个审核通过的版本；只有审核通过才原子切换。
    if work.review_status != ReviewStatus.approved:
        work.review_status = ReviewStatus.pending
        work.review_note = f"版本 v{version.version_number} 已提交，等待审核"
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
    version = db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work_id).order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=400, detail="请先创建作品版本")
    if not db.scalar(select(Listing.id).where(Listing.work_id == work_id)):
        raise HTTPException(status_code=400, detail="请先完成价格设置")
    if not work.trial_url.strip():
        raise HTTPException(status_code=400, detail="请提供购买前可访问的体验链接")
    if version.review_status == ReviewStatus.approved:
        raise HTTPException(status_code=409, detail="当前版本已经审核通过")
    version.review_status = ReviewStatus.pending
    version.review_note = ""
    version.reviewer_id = None
    version.reviewed_at = None
    if work.review_status != ReviewStatus.approved:
        work.review_status = ReviewStatus.pending
        work.review_note = ""
        work.reviewer_id = None
        work.reviewed_at = None
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
        .join(WorkVersion, WorkVersion.work_id == Work.id)
        .where(WorkVersion.review_status == review_status)
        .order_by(WorkVersion.created_at.asc())
    ).all()
    return [
        ReviewItem(
            id=work.id,
            version_id=version.id,
            version_number=version.version_number,
            title=work.title,
            description=work.description,
            cover_url=work.cover_url,
            trial_url=work.trial_url,
            tags=work.tags,
            review_status=version.review_status,
            review_note=version.review_note,
            source_url=version.source_url,
            deployment_status=work.deployment_status,
            deployment_error=work.deployment_error,
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
    if not work:
        raise HTTPException(status_code=404, detail="待审核作品不存在")
    version = db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id, WorkVersion.review_status == ReviewStatus.pending)
        .order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=404, detail="待审核版本不存在")
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    if not listing:
        raise HTTPException(status_code=409, detail="作品尚未设置价格")
    now = datetime.now(timezone.utc)
    version.review_status = ReviewStatus.approved
    version.reviewer_id = user.id
    version.review_note = "审核通过"
    version.reviewed_at = now
    version.published_at = now
    listing.version_id = version.id
    work.review_status = ReviewStatus.approved
    work.reviewer_id = user.id
    work.review_note = "审核通过"
    work.reviewed_at = now
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
    if not work:
        raise HTTPException(status_code=404, detail="待审核作品不存在")
    version = db.scalar(
        select(WorkVersion).where(WorkVersion.work_id == work.id, WorkVersion.review_status == ReviewStatus.pending)
        .order_by(WorkVersion.version_number.desc()).limit(1)
    )
    if not version:
        raise HTTPException(status_code=404, detail="待审核版本不存在")
    now = datetime.now(timezone.utc)
    version.review_status = ReviewStatus.rejected
    version.reviewer_id = user.id
    version.review_note = payload.note
    version.reviewed_at = now
    listing = db.scalar(select(Listing).where(Listing.work_id == work.id))
    published = db.get(WorkVersion, listing.version_id) if listing else None
    if not published or published.review_status != ReviewStatus.approved:
        work.review_status = ReviewStatus.rejected
        work.reviewer_id = user.id
        work.review_note = payload.note
        work.reviewed_at = now
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
    rows = db.execute(select(Event.event_name, Event.user_id, Event.session_id, Event.order_id).where(Event.created_at >= start, Event.created_at <= end)).all()
    actors: dict[str, set[str]] = {}
    for name, user_id, session_id, order_id in rows:
        actor = user_id or session_id or order_id
        if actor:
            actors.setdefault(name, set()).add(actor)
    counts = {name: len(values) for name, values in actors.items()}
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


@app.get("/v1/admin/operations/overview", response_model=OperationsOverviewOut, tags=["数据运营"])
def operations_overview(user: User = Depends(current_user), db: Session = Depends(get_db)) -> OperationsOverviewOut:
    require_admin(user)
    generated_at = datetime.now(timezone.utc)
    active_users = db.scalar(text("""
        SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) FROM events
        WHERE created_at >= :start AND COALESCE(user_id, session_id) IS NOT NULL
    """), {"start": generated_at - timedelta(days=30)}) or 0
    ledger = dict(db.execute(text("""
        SELECT
          COALESCE(SUM(CASE WHEN account_code='cash:clearing' AND direction='debit' THEN amount_cents ELSE 0 END),0) gross,
          COALESCE(SUM(CASE WHEN account_code='cash:clearing' AND direction='credit' THEN amount_cents ELSE 0 END),0) refunds,
          COALESCE(SUM(CASE WHEN account_code='platform:commission_revenue' AND direction='credit' THEN amount_cents WHEN account_code='platform:commission_revenue' AND direction='debit' THEN -amount_cents ELSE 0 END),0) platform_net,
          COALESCE(SUM(CASE WHEN account_code LIKE 'creator_payable:%' AND direction='credit' THEN amount_cents WHEN account_code LIKE 'creator_payable:%' AND direction='debit' THEN -amount_cents ELSE 0 END),0) creator_payable
        FROM ledger_entries
    """)).mappings().one())
    paid_orders = db.scalar(select(func.count()).select_from(Order).where(Order.paid_at.is_not(None))) or 0
    result = OperationsOverviewOut(
        generated_at=generated_at,
        users_total=db.scalar(select(func.count()).select_from(User)) or 0,
        active_users_30d=active_users,
        approved_works=db.scalar(select(func.count()).select_from(Work).where(Work.review_status == ReviewStatus.approved)) or 0,
        active_listings=db.scalar(select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.active)) or 0,
        pending_versions=db.scalar(select(func.count()).select_from(WorkVersion).where(WorkVersion.review_status == ReviewStatus.pending)) or 0,
        paid_orders=paid_orders,
        gross_payment_cents=ledger["gross"],
        refund_cents=ledger["refunds"],
        platform_net_revenue_cents=ledger["platform_net"],
        creator_payable_cents=ledger["creator_payable"],
        refund_rate=round(ledger["refunds"] / ledger["gross"], 4) if ledger["gross"] else 0,
    )
    db.add(AdminQueryAudit(admin_id=user.id, report_name="operations_overview", filters_json='{"window":"30d"}', row_count=1))
    db.commit()
    return result


QUALITY_CHECKS = (
    ("ledger_balance", "账本存在借贷不平的交易", """SELECT COUNT(*) FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(CASE WHEN direction='debit' THEN amount_cents ELSE -amount_cents END) <> 0) q"""),
    ("paid_without_entitlement", "已交付订单缺少有效权益", """SELECT COUNT(*) FROM orders o LEFT JOIN entitlements e ON e.source_order_id=o.id AND e.status='active' WHERE o.status='delivered' AND e.id IS NULL"""),
    ("duplicate_active_entitlement", "同一用户作品存在多个有效权益", """SELECT COUNT(*) FROM (SELECT user_id,work_id FROM entitlements WHERE status='active' GROUP BY user_id,work_id HAVING COUNT(*)>1) q"""),
    ("broken_listing_version", "商品引用了其他作品的版本", """SELECT COUNT(*) FROM listings l JOIN work_versions v ON v.id=l.version_id WHERE v.work_id<>l.work_id"""),
    ("missing_stored_file", "版本引用的文件元数据不存在", """SELECT COUNT(*) FROM work_versions v LEFT JOIN stored_files f ON f.id=v.stored_file_id WHERE v.stored_file_id IS NOT NULL AND f.id IS NULL"""),
)


@app.post("/v1/admin/operations/quality/run", response_model=list[DataQualityItem], tags=["数据运营"])
def run_data_quality_checks(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[DataQualityItem]:
    require_admin(user)
    checked_at = datetime.now(timezone.utc)
    results: list[DataQualityItem] = []
    for name, message, sql in QUALITY_CHECKS:
        issue_count = int(db.scalar(text(sql)) or 0)
        status_value = "passed" if issue_count == 0 else "failed"
        db.add(DataQualityCheck(check_name=name, status=status_value, issue_count=issue_count, details_json=json.dumps({"message": message}, ensure_ascii=False), checked_at=checked_at))
        results.append(DataQualityItem(check_name=name, status=status_value, issue_count=issue_count, message=message, checked_at=checked_at))
    db.add(AdminQueryAudit(admin_id=user.id, report_name="data_quality_run", filters_json="{}", row_count=len(results)))
    db.commit()
    return results


@app.get("/v1/admin/operations/quality/latest", response_model=list[DataQualityItem], tags=["数据运营"])
def latest_data_quality_checks(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[DataQualityItem]:
    require_admin(user)
    rows = db.execute(text("""
        SELECT DISTINCT ON (check_name) check_name,status,issue_count,details_json,checked_at
        FROM data_quality_checks ORDER BY check_name,checked_at DESC
    """)).mappings().all()
    return [DataQualityItem(check_name=row["check_name"], status=row["status"], issue_count=row["issue_count"], message=json.loads(row["details_json"]).get("message", ""), checked_at=row["checked_at"]) for row in rows]


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
    listing = db.get(Listing, payload.listing_id) if payload.listing_id else None
    if not listing or listing.work_id != payload.work_id:
        raise HTTPException(status_code=400, detail="作品与上架信息不匹配")
    key = payload.event_id or (f"work_viewed:{payload.session_id}:{payload.work_id}" if payload.session_id else None)
    log_event(db, "work_viewed", work_id=payload.work_id, listing_id=payload.listing_id, session_id=payload.session_id, dedupe_key=key)
    db.commit()
    return {"status": "recorded"}


@app.post("/v1/events/work-tried", tags=["数据事件"])
def track_work_trial(payload: WorkViewIn, db: Session = Depends(get_db)) -> dict[str, str]:
    """记录购买前体验，用于区分“看过”与“实际试用”的转化。"""
    listing = db.get(Listing, payload.listing_id) if payload.listing_id else None
    if not listing or listing.work_id != payload.work_id:
        raise HTTPException(status_code=400, detail="作品与上架信息不匹配")
    key = payload.event_id or (f"work_tried:{payload.session_id}:{payload.work_id}" if payload.session_id else None)
    log_event(db, "work_tried", work_id=payload.work_id, listing_id=payload.listing_id, session_id=payload.session_id, dedupe_key=key)
    db.commit()
    return {"status": "recorded"}


@app.post("/v1/orders", response_model=OrderOut, tags=["订单"])
def create_order(
    payload: OrderCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Order:
    request_key = (idempotency_key or str(uuid.uuid4())).strip()[:100]
    existing_by_key = db.scalar(select(Order).where(Order.idempotency_key == request_key))
    if existing_by_key:
        if existing_by_key.buyer_id != user.id:
            raise HTTPException(status_code=409, detail="幂等键已被使用")
        return existing_by_key
    listing = db.get(Listing, payload.listing_id)
    if not listing or listing.status != ListingStatus.active:
        raise HTTPException(status_code=404, detail="上架商品不存在或已下架")
    work = db.get(Work, listing.work_id)
    if not work or work.review_status != ReviewStatus.approved:
        raise HTTPException(status_code=404, detail="作品尚未审核通过")
    if work.creator_id == user.id:
        raise HTTPException(status_code=400, detail="暂不支持购买自己的作品")
    already_owned = db.scalar(
        select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == listing.work_id, Entitlement.status == "active")
    )
    if already_owned:
        raise HTTPException(status_code=409, detail="你已拥有此作品")
    existing_active = db.scalar(select(Order).where(
        Order.buyer_id == user.id,
        Order.listing_id == listing.id,
        Order.status.in_([OrderStatus.created, OrderStatus.payment_submitted, OrderStatus.payment_failed, OrderStatus.paid, OrderStatus.delivered]),
    ).order_by(Order.created_at.desc()))
    if existing_active:
        return existing_active
    order = Order(
        buyer_id=user.id,
        listing_id=listing.id,
        work_id=work.id,
        version_id=listing.version_id,
        creator_id=work.creator_id,
        title_snapshot=work.title,
        license_snapshot="standard",
        amount_cents=listing.price_cents,
        currency=listing.currency,
        idempotency_key=request_key,
    )
    db.add(order)
    db.flush()
    log_event(db, "purchase_clicked", user_id=user.id, work_id=listing.work_id, listing_id=listing.id)
    log_event(db, "order_created", user_id=user.id, work_id=listing.work_id, listing_id=listing.id, order_id=order.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Order).where(Order.buyer_id == user.id, Order.listing_id == listing.id).order_by(Order.created_at.desc()))
        if existing:
            return existing
        raise
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
    if not order:
        raise HTTPException(status_code=404, detail="待核验订单不存在")
    payment_key = f"offline:{order.id}"
    existing_payment = db.scalar(select(PaymentAttempt).where(PaymentAttempt.idempotency_key == payment_key))
    if existing_payment and existing_payment.status == "succeeded" and order.status == OrderStatus.delivered:
        return order
    if order.status != OrderStatus.payment_submitted:
        raise HTTPException(status_code=404, detail="待核验订单不存在")
    listing = db.get(Listing, order.listing_id)
    if not listing:
        raise HTTPException(status_code=409, detail="上架商品已不存在")
    payment = existing_payment or PaymentAttempt(order_id=order.id, provider="offline_manual", idempotency_key=payment_key, amount_cents=order.amount_cents, currency=order.currency)
    db.add(payment)
    db.add(Entitlement(user_id=order.buyer_id, work_id=order.work_id, source_order_id=order.id, version_id=order.version_id, status="active"))
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    order.payment_verified_at = order.paid_at
    order.payment_verified_by = user.id
    payment.status = "succeeded"
    payment.completed_at = order.paid_at
    db.flush()
    book_ledger(db, order, "payment", payment.id)
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
    payment_key = f"simulate:{order.id}"
    payment = db.scalar(select(PaymentAttempt).where(PaymentAttempt.idempotency_key == payment_key))
    if payment and payment.status == "succeeded":
        return order
    if not payment:
        payment = PaymentAttempt(order_id=order.id, provider="simulation", idempotency_key=payment_key, amount_cents=order.amount_cents, currency=order.currency)
        db.add(payment)
    entitlement = Entitlement(
        user_id=user.id,
        work_id=order.work_id,
        source_order_id=order.id,
        version_id=order.version_id,
        status="active",
    )
    # 评选版不接真实支付渠道：仍保留 paid 事件，再立即完成数字作品交付。
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    payment.status = "succeeded"
    payment.completed_at = order.paid_at
    db.flush()
    book_ledger(db, order, "payment", payment.id)
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
    existing_refund = db.scalar(select(Refund).where(Refund.order_id == order.id))
    if existing_refund and existing_refund.status == "succeeded" and order.status == OrderStatus.refunded:
        return order
    if order.status != OrderStatus.delivered:
        raise HTTPException(status_code=409, detail="只有已交付订单可以退款")
    entitlement = db.scalar(select(Entitlement).where(Entitlement.source_order_id == order.id))
    now = datetime.now(timezone.utc)
    if entitlement:
        entitlement.status = "revoked"
        entitlement.revoked_at = now
        entitlement.revoked_reason = "order_refunded"
    refund = Refund(order_id=order.id, amount_cents=order.amount_cents, reason="user_requested", status="succeeded", completed_at=now)
    db.add(refund)
    db.flush()
    book_ledger(db, order, "refund", refund.id)
    order.status = OrderStatus.refunded
    order.refunded_at = now
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
    total = db.scalar(text("""
        SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE -amount_cents END), 0)
        FROM ledger_entries WHERE account_code = :account
    """), {"account": f"creator_payable:{user.id}"}) or 0
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
        .where(Entitlement.user_id == user.id, Entitlement.status == "active")
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
    entitlement = db.scalar(select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == work_id, Entitlement.status == "active"))
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
    entitlement = db.scalar(select(Entitlement).where(Entitlement.user_id == user.id, Entitlement.work_id == work_id, Entitlement.status == "active"))
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
