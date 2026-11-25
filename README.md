# 👵 Bà Ngoại AI: Gặp lừa đảo? Gọi Bà!

MoMo Techday 2026 · Chủ đề: **Chống lừa đảo + Trợ lý AI**

Người dân gửi tin nhắn hoặc ảnh chụp màn hình khả nghi cho Bà, Bà sẽ:
1. Phán có phải lừa đảo không, thuộc kịch bản nào, mức nguy hiểm.
2. Chỉ việc cần làm ngay.
3. Soạn sẵn **câu troll để câu giờ** kẻ lừa (copy dán lại).
4. Bóc STK/SĐT/link của kẻ lừa vào **sổ đen chung**, gom vào **kho kịch bản**, phát hiện **kịch bản MỚI**.
5. Ví điện tử gọi **API kiểm tra STK** để chặn trước khi người dùng chuyển tiền.

> Daisy ở Anh có 1 bà. Bọn mình có 100 triệu đứa cháu.

## Tính năng (MVP)

| Trang / API | Mô tả |
|---|---|
| `/` **Gọi Bà** | Dán text, upload hoặc Ctrl+V ảnh → cảnh báo + câu troll + "X người đã gặp" |
| `/thu-lua-ba` **Thử lừa Bà** | Giám khảo đóng vai scammer, bà Tư tự câu giờ; bấm Kết thúc để xem báo cáo |
| `/canh-bao` **Bản tin** | Kịch bản theo cộng đồng, tag MỚI (< 7 ngày), STK/SĐT đã che |
| `/kiem-tra-stk` | Tra STK/SĐT/link + màn **Ví Demo** mô phỏng chặn chuyển tiền |
| Bot Telegram | Forward tin hoặc gửi ảnh → kết quả rút gọn + câu troll (chạm để copy) |
| `GET /api/check-account?q=` | API công khai (CORS mở) cho ví/ngân hàng |

## Stack

Next.js (App Router, Vercel) · Supabase Postgres · Claude API (có vision) · Telegram Bot API

```
app/
  page.tsx               Gọi Bà
  thu-lua-ba/page.tsx    Thử lừa Bà
  canh-bao/page.tsx      Bản tin (server component)
  kiem-tra-stk/page.tsx  Kiểm tra STK + Ví Demo
  api/analyze            Phân tích tin/ảnh (lõi)
  api/bait               Bà Tư trả lời 1 lượt chat
  api/bait/report        Báo cáo cuối màn
  api/check-account      Tra sổ đen
  api/telegram           Webhook bot
  api/cron/keepalive     Giữ Supabase free không bị tạm dừng
lib/
  prompts.ts             ★ Toàn bộ prompt của Bà, chỉnh giọng văn ở đây
  analyze.ts             Lõi: Claude → kịch bản → lưu report + IOC → thống kê
  claude.ts              Gọi Claude Messages API (fetch)
  ratelimit.ts           Giới hạn lượt theo IP + trần lượt Claude/ngày
  ioc.ts                 Chuẩn hóa và che STK/SĐT/link
supabase/
  schema.sql             Bảng, view scenario_stats, hàm RPC
  seed.sql               12 kịch bản + lượt báo/IOC MÔ PHỎNG
```

## Setup

### 1. Supabase
1. Tạo project trên supabase.com.
2. Vào **SQL Editor** → chạy `supabase/schema.sql` → chạy tiếp `supabase/seed.sql`.
3. **Project Settings → API**: lấy `Project URL` và `service_role` key.

### 2. Claude API
Tạo key ở console.anthropic.com. **Đặt spend limit** trong console (chốt chặn chi phí cuối cùng).

### 3. Telegram bot
Chat với @BotFather → `/newbot` → lấy token. Tự đặt một chuỗi bí mật cho `TELEGRAM_WEBHOOK_SECRET` (chỉ chữ, số, `_`, `-`).

### 4. Chạy local
```bash
npm install
cp .env.example .env.local   # điền các biến
npm run dev                  # http://localhost:3000
```

### 5. Deploy Vercel
1. Import repo trên vercel.com.
2. Khai báo toàn bộ biến trong `.env.example` ở **Settings → Environment Variables** (nhớ `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`).
3. Deploy xong thì đăng ký webhook Telegram (thay `<TOKEN>`, `<DOMAIN>`, `<SECRET>`):
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/api/telegram&secret_token=<SECRET>&allowed_updates=%5B%22message%22%5D"
```
Kiểm tra: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Dữ liệu và quyền riêng tư
- **Không lưu ảnh gốc, không lưu nguyên văn tin nhắn**: chỉ lưu trường đã bóc (kịch bản, chiêu tâm lý, câu đặc trưng, IOC của kẻ lừa).
- Mọi bảng bật RLS, không có policy → chỉ server (service_role) truy cập.
- Dữ liệu seed có `is_simulated = true` (IOC: `real_count = 0`), UI hiện riêng "(+N mẫu mô phỏng)". **Không báo số mô phỏng như số thật** trên slide.
- STK seed dùng đầu `9999…`, SĐT đầu `0123…` (không còn cấp), link đuôi `.example` để không trùng người thật.
- Lượt "Thử lừa Bà" lưu ở `bait_sessions`, không tính vào thống kê kịch bản.

## Guardrail của Bà
Không hướng dẫn chuyển tiền, không tạo biên lai giả, không đưa thông tin thật, không chửi bới khiêu khích, giữ vai trước prompt injection. Xem `lib/prompts.ts`.

## Giới hạn lượt mặc định
| Endpoint | Giới hạn |
|---|---|
| `/api/analyze` | 30 lượt/giờ/IP |
| `/api/bait` | 120 lượt/giờ/IP |
| `/api/bait/report` | 20 lượt/giờ/IP |
| Bot Telegram | 20 lượt/giờ/chat |
| `/api/check-account` | 300 lượt/giờ/IP |
| Toàn hệ thống | `DAILY_CLAUDE_CAP` lượt gọi Claude/ngày |
