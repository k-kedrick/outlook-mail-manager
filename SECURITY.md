# 安全说明

本项目处理 Microsoft Refresh Token、邮箱密码、TOTP Secret、卡密与邮件验证码。它们不得进入 GitHub、Issue、截图、日志或聊天记录。

## 密钥与凭据

- `.env`、`secrets/`、`backups/`、数据库文件、证书私钥和导出文件必须保持在 Git 之外。
- `SESSION_SIGNING_KEY`、`DATA_ENCRYPTION_KEYS`、`CARD_KEY_HMAC_KEY` 和管理员初始化口令必须相互独立。
- 生产 Compose 从 `./secrets` 只读挂载应用密钥；Microsoft 私钥路径默认位于 `/run/secrets`。
- `DATA_ENCRYPTION_KEYS` 格式为 `当前KeyID:至少32位密钥,旧KeyID:旧密钥`。轮换时把新 Key 放在第一位，完成后台重加密前不要删除旧 Key。
- 卡密明文只在创建时显示一次；数据库只保存 HMAC、前缀和尾号。

## 管理员安全

- 首次部署必须修改初始化口令，设置至少 12 位管理员密码并绑定 TOTP。
- 恢复码只显示一次且只保存 HMAC；使用后立即作废。
- Session Token 仅以独立 `SESSION_SIGNING_KEY` 做 HMAC-SHA-256 后保存，Cookie 为 HttpOnly、Secure（生产）、SameSite=Strict。
- 所有修改接口要求 CSRF Token。修改密码会递增 Session 版本、撤销全部 Session 并清除当前 Cookie。

## 公网入口

- Web 仅绑定 `127.0.0.1:3005`，PostgreSQL、Worker、指标和 Microsoft 私钥不暴露公网。
- Nginx 必须覆盖 `X-Real-IP`，不要把用户提交的 `CF-Connecting-IP` 直接传给应用。
- Cloudflare 对登录、卡密、验证码和 TOTP 配置边缘限流；源站 80/443 仅允许 Cloudflare 网段，SSH 仅允许管理来源。
- `/internal/metrics` 同时使用 Nginx allowlist 和 `METRICS_BEARER_TOKEN`。

## 日志与响应

日志只允许 request ID、任务 ID、Provider、耗时、数量与错误类别。禁止记录密码、Access/Refresh Token、完整卡密、TOTP Secret、恢复码、OAuth code/PKCE verifier 和验证码正文。公开接口只能返回固定错误分类；原始 Microsoft 响应留在脱敏日志中。

## 漏洞报告与发布检查

不要在公开 Issue 中粘贴秘密。发布前执行：

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm audit --omit=dev
git status --short
```

同时确认 Git 暂存区不包含 `.env`、`secrets/`、`backups/`、真实账号、日志和未脱敏截图。
