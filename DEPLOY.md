# 部署说明

本项目是 Next.js + Prisma + SQLite 的服务端应用，包含 API Routes、SQLite 数据库、后台定时器和公开兑换页。GitHub 适合存放源码；完整功能需要部署到支持 Node.js 的服务器。

## 不适合的部署方式

- **GitHub Pages**：只能托管静态文件，不能运行 Next API、Prisma、SQLite 或后台定时任务。
- **当前架构直接上 Vercel**：SQLite 不适合 serverless 文件系统持久写入；如需 Vercel，建议先迁移到 PostgreSQL/MySQL 等外部数据库。

## Linux / VPS 推荐部署

```bash
git clone <your-repo-url> outlook
cd outlook
npm ci
cp .env.example .env
```

编辑 `.env`：

```env
DATABASE_URL="file:./dev.db"
APP_SECRET="replace-with-a-long-random-secret"
ADMIN_PASSWORD="change-me"
```

初始化数据库并构建：

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

默认监听 `http://localhost:3005`。生产环境建议使用 Nginx、Caddy 或面板反代到 `localhost:3005`，并开启 HTTPS。

## Windows 服务器部署

```bat
git clone <your-repo-url> outlook
cd outlook
npm ci
copy .env.example .env
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

长期运行可以使用 PM2、NSSM、Windows 服务或任务计划守护 `npm start`。

独立低频保活任务可使用：

```bat
scripts\keep-alive.bat
```

## Docker Compose 部署（推荐用于当前服务器）

你的服务器已有 `/opt + Docker Compose + Nginx + Let's Encrypt` 架构，建议使用独立目录和独立子域名：

- 项目目录：`/opt/outlook-mail-manager`
- 访问域名：你的域名，例如 `https://mail.example.com`
- 本机端口：`127.0.0.1:3005`
- SQLite 数据目录：`/opt/outlook-mail-manager/data`

部署命令：

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
cp docker-compose.example.yml docker-compose.yml
```

生成 `.env`。脚本会自动写好 Docker 所需的固定配置，只需要输入公网地址、`APP_SECRET` 和后台密码；`APP_SECRET` 留空时会自动生成：

```bash
sh deploy/scripts/setup-env.sh
```

生成后的 `.env` 结构如下：

```env
DATABASE_URL="file:/app/data/dev.db"
APP_SECRET="replace-with-a-long-random-secret"
ADMIN_PASSWORD="change-me"
NEXT_PUBLIC_APP_URL="https://mail.example.com"
KEEP_ALIVE_ENABLED="1"
KEEP_ALIVE_INTERVAL_HOURS="168"
NEXT_PUBLIC_KEEP_ALIVE_INTERVAL_HOURS="168"
```

启动。第一次构建会比较慢，`Building 13/19`、`exporting layers`、`docker:default` 都是正常进度，不是错误；看到 `Container outlook-mail-manager Started` 才算启动完成。

```bash
docker compose up -d --build
docker compose ps
docker logs outlook-mail-manager --tail=100
```

如果误按 `Ctrl+C` 中断构建，后面可能没有容器，`docker compose ps` 会是空的；重新执行 `docker compose up -d --build` 并等待完成即可。

需要排查的典型字样是：`ERROR`、`failed`、`CANCELED`、`Restarting`。其中 `Restarting` 通常需要看日志：

```bash
docker logs outlook-mail-manager --tail=100
```

本机测试：

```bash
curl -I http://127.0.0.1:3005/login
curl -I http://127.0.0.1:3005/redeem
```

也可以使用内置检查脚本。脚本不会打印 `.env` 中的密钥值，只检查是否仍是默认值：

```bash
bash deploy/scripts/check-deploy.sh
```

Nginx 反代示例已放在 `deploy/nginx/app.example.conf`，可复制到 `/etc/nginx/sites-available/<your-domain>`，并把 `server_name` 改成你的域名：

```nginx
server {
    server_name mail.example.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

首次部署后再用 Certbot 或面板为你的域名申请 Let's Encrypt 证书。

更新：

```bash
cd /opt/outlook-mail-manager
git pull
docker compose up -d --build
```

数据备份：

```bash
cd /opt/outlook-mail-manager
bash deploy/scripts/backup-sqlite.sh
```

## `.env` 安全提醒

- 不要把 `.env`、`APP_SECRET`、`ADMIN_PASSWORD`、RefreshToken、2FA 密钥、卡密或真实账号截图贴到公开聊天、GitHub issue 或 README。
- 空库部署时，如果 `APP_SECRET` 或后台密码泄露，可以直接重新生成并修改 `.env`，然后 `docker compose restart`。
- 已经导入真实账号后，不要随便改 `APP_SECRET`；它用于解密密码、RefreshToken 和 2FA 密钥，改掉会让已有密文不可读。
- 如果只是后台密码泄露，可以只改 `ADMIN_PASSWORD`，或登录后台后在设置中修改管理员密码。

## 迁移和数据

- 公开仓库不包含真实 `prisma/dev.db`。
- 生产服务器第一次部署用 `npx prisma migrate deploy` 创建结构。
- 已有真实数据库迁移到服务器时，手动安全传输 `prisma/dev.db`，不要通过 GitHub 上传。
