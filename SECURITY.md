# 安全说明

本项目会处理 Outlook/MSA 账号密码、RefreshToken、2FA 密钥、卡密和邮箱验证码。公开仓库发布前必须脱敏。

## 禁止提交到 GitHub 的内容

- `.env`、`.env.local`
- `data/dev.db`、`data/backups/*`
- `prisma/dev.db`、`*.db`、`*.db-journal`
- `prisma/dev.db.bak`、`*.bak`
- 日志文件 `*.log`
- 真实账号导出文件
- 未脱敏截图
- RefreshToken、账号密码、2FA 密钥、卡密明文

## APP_SECRET

`APP_SECRET` 用于解密已存储的密码、RefreshToken 和 2FA 密钥。修改它会导致旧密文无法解密。

- 空库部署：可以让 `deploy/scripts/install.sh` 自动生成新 `APP_SECRET`。
- 已有数据部署：不要随便更换 `APP_SECRET`；更换后旧密文会无法解密。
- 已泄露但还没导入真实账号：可以删除空库重新部署，生成新的 `APP_SECRET`。
- 已泄露且已有真实账号：先备份数据库，再评估重新导入账号或轮换全部敏感凭据。
- 生产环境要求 `APP_SECRET` 至少 32 个字符，且拒绝公开开发默认值；缺失时应用会停止启动。

## 登录、会话与限流

- 登录成功后会话最长 14 天；修改管理员密码会让所有旧会话立即失效，当前浏览器也需要重新登录。
- 应用对登录、卡密校验、验证码和 TOTP 接口做单容器内存限流，容器重启后计数清零。
- 正式公网部署还应在 Cloudflare 配置相同接口的限流规则，形成两层保护。
- Nginx 必须覆盖 `X-Real-IP`，应用不会直接信任用户可伪造的 `CF-Connecting-IP`。

## 公网访问

推荐正式环境使用 HTTPS 反代，只让容器绑定 `127.0.0.1:3005`。`direct-ip` 模式会绑定 `0.0.0.0:3005` 并把后台直接暴露到公网，只建议临时测试或在防火墙白名单下使用。

## 公开兑换页

`/redeem` 和 `/api/redeem*` 是公开入口，只应返回邮箱、邮箱验证码、验证码时间和 TOTP 动态码。不要在公开接口返回密码、ClientId、RefreshToken、卡密明文或 2FA 密钥明文。

`/api/redeem/code` 只能走邮箱验证码读取路径，不能调用 `checkAccount`、keep-alive 或 `forceRefresh`。

## 发布前检查

发布前至少执行：

```bash
npm run typecheck
npm test
npm run build
git status --short
```

并确认 staging 中没有数据库、环境变量、日志、真实截图和真实导出文件。
