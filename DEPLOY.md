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

## 7. Chay app bang PM2

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

## 8. Cau hinh Nginx reverse proxy

Tao file `/etc/nginx/sites-available/oa-td88`:

```nginx
server {
    listen 80;
    server_name chamcong.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
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

## 10. Quy trinh update phien ban

```bash
cd /www/wwwroot/oa_td88
git pull
npm ci
npm run db:push
npm run build
pm2 restart oa-td88
```

Neu update co thay doi lon ve schema va ban muon reset data mau:

```bash
npm run db:setup
pm2 restart oa-td88
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
