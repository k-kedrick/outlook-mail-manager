# 安全说明

本项目会处理 Outlook/MSA 账号密码、RefreshToken、2FA 密钥、卡密和邮箱验证码。公开仓库发布前必须脱敏。

## 禁止提交到 GitHub 的内容

- `.env`、`.env.local`
- `prisma/dev.db`、`*.db`、`*.db-journal`
- `prisma/dev.db.bak`、`*.bak`
- 日志文件 `*.log`
- 真实账号导出文件
- 未脱敏截图
- RefreshToken、账号密码、2FA 密钥、卡密明文

## APP_SECRET

`APP_SECRET` 用于解密已存储的密码、RefreshToken 和 2FA 密钥。修改它会导致旧密文无法解密。生产环境必须使用强随机值，但已有真实数据迁移时必须保持原值一致。

## 公开兑换页

`/redeem` 和 `/api/redeem*` 是公开入口，只应返回邮箱、邮箱验证码、验证码时间和 TOTP 动态码。不要在公开接口返回密码、ClientId、RefreshToken、卡密明文或 2FA 密钥明文。

`/api/redeem/code` 只能走邮箱验证码读取路径，不能调用 `checkAccount`、keep-alive 或 `forceRefresh`。

## 发布前检查

发布前至少执行：

```bash
npx tsc --noEmit
git status --short
```

并确认 staging 中没有数据库、环境变量、日志、真实截图和真实导出文件。

