# Deploy OA TD88 Tren VPS Ubuntu (Production)

Tai lieu nay huong dan deploy du an Next.js + Prisma(SQLite) len VPS Ubuntu, reverse proxy bang Nginx, process manager bang PM2.

## 1. Yeu cau

- VPS Ubuntu 22.04/24.04
- Domain da tro DNS ve IP VPS (vi du `chamcong.example.com`)
- Tai khoan co quyen `sudo`
- Duong dan source code: `/www/wwwroot/oa_td88`

Luu y: du an dang dung SQLite (`prisma/dev.db`), phu hop 1 server, khong phu hop scale nhieu instance.

## 2. Cai package he thong

```bash
sudo apt update
sudo apt install -y nginx git curl
```

## 3. Cai Node.js LTS (khuyen nghi Node 20)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Lay source code va cai dependencies

```bash
cd /www/wwwroot
git clone <repo-url> oa_td88
cd /www/wwwroot/oa_td88
npm ci
```

Neu da co source san, chi can:

```bash
cd /www/wwwroot/oa_td88
git pull
npm ci
```

## 5. Tao file moi truong production

Tao `.env` trong thu muc project:

```bash
cd /www/wwwroot/oa_td88
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL="file:./prisma/dev.db"
DB_AUTO_BACKUP_ENABLED=true
DB_AUTO_BACKUP_INTERVAL_MINUTES=15
DB_BACKUP_DIR=backups/auto
DB_BACKUP_MAX_FILES=96
SINGLE_DEVICE_ACTIVE_WINDOW_MINUTES=30
EOF
```

## 6. Khoi tao database va build

```bash
cd /www/wwwroot/oa_td88
npm run db:setup
npm run build
```

Neu da co du lieu that, KHONG dung `db:setup` vi se reset schema va seed lai. Luc do dung:

```bash
npm run db:push
```

## 7. Chay app bang PM2 (lan dau)

```bash
sudo npm install -g pm2
cd /www/wwwroot/oa_td88
pm2 start npm --name oa-td88 -- start
pm2 save
pm2 startup
```

Kiem tra:

```bash
pm2 status
pm2 logs oa-td88
curl http://127.0.0.1:3001
```

## 8. Cau hinh Nginx reverse proxy (upstream)

Tao file `/etc/nginx/sites-available/oa-td88`:

```nginx
upstream oa_td88_upstream {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name chamcong.example.com;

    location / {
        proxy_pass http://oa_td88_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site va reload:

```bash
sudo ln -s /etc/nginx/sites-available/oa-td88 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Bat HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d chamcong.example.com
```

Kiem tra auto renew:

```bash
sudo systemctl status certbot.timer
```

## 10. Quy trinh update KHONG gian doan (Blue-Green)

Muc tieu: app cu van phuc vu tren `3001`, app moi chay tren `3002`, test OK roi moi chuyen Nginx qua `3002`.

### Buoc 1: Backup truoc deploy

```bash
cd /www/wwwroot/oa_td88
mkdir -p backups/pre-deploy
npm run db:export:json -- backups/pre-deploy/db-$(date +%F-%H%M%S).json
```

### Buoc 2: Cap nhat code + build

```bash
cd /www/wwwroot/oa_td88
git pull
npm ci
npm run db:push
npm run build
```

Khong dung `db:setup` tren production vi co the mat du lieu.

### Buoc 3: Start ban moi tren port 3002

```bash
cd /www/wwwroot/oa_td88
PORT=3002 pm2 start npm --name oa-td88-next -- start
curl -I http://127.0.0.1:3002
```

### Buoc 4: Chuyen traffic Nginx sang port 3002

Sua file `/etc/nginx/sites-available/oa-td88`:

- Doi `server 127.0.0.1:3001;` thanh `server 127.0.0.1:3002;`

Sau do apply:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Buoc 5: Theo doi va dung ban cu

```bash
pm2 logs oa-td88-next --lines 200
pm2 delete oa-td88
pm2 rename oa-td88-next oa-td88
pm2 save
```

### Rollback nhanh (neu can)

Neu co loi sau khi switch:

1. Sua Nginx upstream lai `127.0.0.1:3001`, reload Nginx.
2. Chay lai ban cu:

```bash
PORT=3001 pm2 start npm --name oa-td88 -- start
```

## 11. Lenh debug nhanh

```bash
pm2 logs oa-td88 --lines 200
pm2 describe oa-td88
sudo journalctl -u nginx -n 200 --no-pager
sudo nginx -t
```

## 12. Xuat/Nhap DB JSON

Xuat DB:

```bash
cd /www/wwwroot/oa_td88
npm run db:export:json -- backups/json/manual-export.json
```

Nhap DB (co tao backup `.db` truoc khi import):

```bash
cd /www/wwwroot/oa_td88
npm run db:import:json -- backups/json/manual-export.json
pm2 restart oa-td88
```

## 13. Bao mat toi thieu khuyen nghi

- Tat SSH password, dung SSH key
- Bat firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

- Dat quyen file toi thieu cho `.env`:

```bash
chmod 600 /www/wwwroot/oa_td88/.env
```
