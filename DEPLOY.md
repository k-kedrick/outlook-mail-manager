# Outlook Mail Manager V2 部署

## 1. 前置条件

- Ubuntu 24.04、Docker、Docker Compose、Nginx、HTTPS。
- `/opt/outlook-mail-manager` 独占一个 PostgreSQL 数据卷，不复用其他项目数据库。
- DNS/Cloudflare 已把 `outlook.2963wang.shop` 指向服务器。
- Microsoft 应用允许个人账号与组织账号，回调地址为 `https://outlook.2963wang.shop/api/v2/oauth/microsoft/callback`。
- 应用证书已上传 Microsoft，PEM 私钥与证书只读放在 `secrets/`。

## 2. 首次安装

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env
mkdir -p secrets backups
chmod 700 secrets backups
```

编辑 `.env`：设置独立 `POSTGRES_PASSWORD`、匹配的 `DATABASE_URL`、公网 `NEXT_PUBLIC_APP_URL`、Microsoft Client ID 和证书 thumbprint。生产应用密钥写入只读文件：

```bash
openssl rand -hex 32 > secrets/session_signing_key
printf 'v1:' > secrets/data_encryption_keys && openssl rand -hex 32 >> secrets/data_encryption_keys
openssl rand -hex 32 > secrets/card_key_hmac_key
openssl rand -hex 24 > secrets/admin_bootstrap_password
openssl rand -hex 32 > secrets/metrics_bearer_token
chmod 600 secrets/*
```

将证书放为 `secrets/microsoft_certificate` 和 `secrets/microsoft_private_key`。随后：

```bash
docker compose build --no-cache
docker compose up -d postgres
docker compose run --rm migration
docker compose up -d web worker
docker compose ps
curl -fsS http://127.0.0.1:3005/api/health/live
curl -fsS http://127.0.0.1:3005/api/health/ready
```

`migration` 成功后才允许启动新 Web/Worker；它们自身不会执行迁移。首次打开后台完成强密码、TOTP 和恢复码绑定。

## 3. Nginx 与 Cloudflare

复制 `deploy/nginx/app.example.conf`，将域名替换为 `outlook.2963wang.shop`。Cloudflare real-IP 配置必须只信任 Cloudflare 官方网段；站点反代覆盖：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Cloudflare 建议规则：登录 5 次/分钟、卡密校验 20 次/分钟、验证码任务 6 次/分钟、TOTP 10 次/分钟。应用还有 PostgreSQL 限流桶作为第二层。源站 80/443 仅允许 Cloudflare 网段，22 仅保留管理来源；修改防火墙时保持现有 SSH 会话，并用第二个会话验证。

## 4. OAuth 验收

先用一个 Outlook.com 个人账号完成 Graph 授权，再对同一账号完成 IMAP 授权；再用一个 Microsoft 365 账号重复。确认：

- Graph/IMAP 是两个独立 Grant 和 Access Token Profile。
- 收件箱与垃圾邮件分别分页，正文可读且不下载附件。
- M365 租户禁用 IMAP 时记录为能力不可用，Graph 仍正常。
- legacy REST 只对已导入且探测成功的旧 Grant 出现。

## 5. 更新、备份与回滚

发布前：

```bash
cd /opt/outlook-mail-manager
cp .env "backups/env-$(date +%F-%H%M%S).bak"
sh deploy/scripts/backup-postgres.sh
git pull --ff-only
docker compose build --no-cache
docker compose run --rm migration
docker compose up -d web worker
docker compose ps
docker compose logs --tail=200 web worker
```

观察 readiness、队列、数据库连接和 JSON 日志至少 30 分钟。每日 `pg_dump` 保留 7 日备、4 周备、6 月备；把备份复制到另一台主机或对象存储。

代码回滚：切回上一个已验证提交并重新构建。数据库只有在迁移确实写入且旧代码不兼容时才恢复：

```bash
docker compose stop web worker
docker compose exec -T postgres dropdb -U outlook outlook_manager
docker compose exec -T postgres createdb -U outlook outlook_manager
docker compose exec -T postgres pg_restore -U outlook -d outlook_manager --clean --if-exists < backups/<backup>.dump
docker compose up -d web worker
```

不要在未确认目标数据库和备份完整性时执行恢复。

## 6. 运维

```bash
docker compose ps
docker compose logs --since=15m web worker
curl -fsS https://outlook.2963wang.shop/api/health/ready
docker compose exec postgres pg_isready -U outlook -d outlook_manager
```

Prometheus 指标只通过内网/Nginx allowlist 访问 `/internal/metrics`，并携带 Bearer Token。日志轮转为 10 MB × 5。Worker 心跳超过 45 秒时 readiness 返回 503。

如需链路追踪，在 `.env` 设置 `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`。Web 与 Worker 会通过 OTLP/HTTP 的 `/v1/traces` 导出；不配置时不会连接任何第三方监控。
