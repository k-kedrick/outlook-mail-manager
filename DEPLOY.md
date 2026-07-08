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
- 访问域名：`https://outlook.2963wang.shop`
- 本机端口：`127.0.0.1:3005`
- SQLite 数据目录：`/opt/outlook-mail-manager/data`

部署命令：

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
mkdir -p data
```

编辑 `.env`，生产环境建议：

```env
DATABASE_URL="file:/app/data/dev.db"
APP_SECRET="replace-with-a-long-random-secret"
ADMIN_PASSWORD="change-me"
NEXT_PUBLIC_APP_URL="https://outlook.2963wang.shop"
KEEP_ALIVE_ENABLED="1"
KEEP_ALIVE_INTERVAL_HOURS="168"
NEXT_PUBLIC_KEEP_ALIVE_INTERVAL_HOURS="168"
```

启动：

```bash
docker compose up -d --build
docker compose ps
docker logs outlook-mail-manager --tail=100
```

本机测试：

```bash
curl -I http://127.0.0.1:3005/login
curl -I http://127.0.0.1:3005/redeem
```

Nginx 反代示例：

```nginx
server {
    server_name outlook.2963wang.shop;

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

首次部署后再用 Certbot 或面板为 `outlook.2963wang.shop` 申请 Let's Encrypt 证书。

更新：

```bash
cd /opt/outlook-mail-manager
git pull
docker compose up -d --build
```

数据备份：

```bash
cd /opt/outlook-mail-manager
cp data/dev.db data/dev.db.bak.$(date +%F-%H%M%S)
```

## 迁移和数据

- 公开仓库不包含真实 `prisma/dev.db`。
- 生产服务器第一次部署用 `npx prisma migrate deploy` 创建结构。
- 已有真实数据库迁移到服务器时，手动安全传输 `prisma/dev.db`，不要通过 GitHub 上传。
