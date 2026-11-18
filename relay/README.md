# size-washer relay — "trạm điện" / power station

**VI.** Để người dùng chỉ cần bấm **Cắm điện** (không nhập repo/token), token GitHub phải nằm ở một nơi *không phải trình duyệt*.
Đó là Worker này (Cloudflare Workers, gói miễn phí đủ dùng). Trình duyệt chỉ gọi 3 đường: `/health`, `/data/jobs|videos`, `/dispatch`.
Worker kiểm tra chặt dữ liệu job (danh sách trắng, giới hạn giá trị, không ký tự điều khiển), giới hạn số mẻ/giờ theo IP, chỉ nhận trang web trong `ALLOWED_ORIGINS`.

**EN.** So users only press **Plug in** (no repo/token typing), the GitHub token has to live somewhere that is *not the browser*. This Worker is that place.

## Triển khai / Deploy (≈ 5 phút)

1. Tạo token GitHub **fine-grained**, chỉ cho đúng repo này: *Actions: Read and write*, *Contents: Read-only*.
2. Sửa `wrangler.toml`: `GH_REPO`, `ALLOWED_ORIGINS` (địa chỉ trang web, vd `https://owner.github.io`), `MAX_JOBS_PER_HOUR`.
3. Triển khai và đặt bí mật:
   ```bash
   cd relay
   npx wrangler secret put GH_TOKEN      # dán token ở bước 1
   npx wrangler deploy                   # in ra https://size-washer-relay.<tên>.workers.dev
   ```
4. Tạo `docs/config.json` (copy từ `docs/config.example.json`) với địa chỉ vừa có, commit & push:
   ```json
   { "relay": "https://size-washer-relay.<tên>.workers.dev" }
   ```
   Xong: người dùng mở trang → bấm phích điện → dùng. Không còn ô nhập nào.

## Tải video lên (R2) / Video uploads (R2)

**VI.** Người dùng chỉ kéo video vào trang. Trình duyệt tự tải video lên **Cloudflare R2** qua Worker (cắt thành từng phần 32 MB), rồi kernel Kaggle tự tải video về — không ai phải chạy lệnh nào, không phải upload dataset Kaggle.

Thiết lập một lần:
1. Cloudflare Dashboard → **R2** → bật R2 (gói miễn phí 10 GB, tải xuống miễn phí; Cloudflare yêu cầu gắn thẻ).
2. Tạo kho và quy tắc tự xoá sau 3 ngày:
   ```bash
   cd relay
   npx wrangler r2 bucket create size-washer-videos
   npx wrangler r2 bucket lifecycle add size-washer-videos expire-3d --prefix u/ --expire-days 3
   ```
3. Tạo một khoá ngẫu nhiên dùng chung giữa Worker và GitHub (chỉ kernel mới tải được video, vì repo công khai nên input của workflow ai cũng đọc được):
   ```bash
   KEY=$(openssl rand -hex 32)
   printf %s "$KEY" | npx wrangler secret put FILES_SECRET
   gh secret set FILES_SECRET -R OWNER/REPO -b "$KEY"
   ```
4. `npx wrangler deploy`.

Giới hạn mặc định (đổi trong `wrangler.toml`): `MAX_UPLOAD_MB=1024` mỗi video, `MAX_UPLOADS_PER_HOUR=10` mỗi IP. Video tự xoá sau 3 ngày.

**EN.** Users only drop a video. The browser uploads it to **Cloudflare R2** through the Worker (32 MB parts) and the Kaggle kernel downloads it itself — no terminal commands, no Kaggle dataset upload. One-time setup: enable R2, create the bucket + 3-day lifecycle rule, set the shared `FILES_SECRET` in both the Worker and GitHub secrets (the repo is public, so the workflow input is readable by anyone; only the kernel holds the key), then `npx wrangler deploy`.

## Lưu ý bảo mật / Security notes

- Video chỉ tải về được khi có `FILES_SECRET` (nằm trong secret của Worker/GitHub và notebook Kaggle riêng tư). Địa chỉ file có chìa khoá ngẫu nhiên 128 bit nhưng **không** được coi là bí mật.

- Trạm là **công khai**: ai mở được trang web đều có thể gửi mẻ giặt (tốn giờ GPU Kaggle của bạn). `ALLOWED_ORIGINS` chỉ chặn *trang web khác* dùng trình duyệt của người dùng, **không** chặn người gọi trực tiếp bằng script.
  Hãy giữ `MAX_JOBS_PER_HOUR` thấp; nếu cần chặt hơn, đặt Cloudflare Access / WAF rate-limiting phía trước Worker.
- Token chỉ cần quyền tối thiểu ở bước 1; không bao giờ để token trong `docs/` hay `wrangler.toml`.
- Bộ nhớ giới hạn tần suất nằm trong từng isolate (đủ chặn lạm dụng thông thường). Cần chính xác tuyệt đối thì dùng KV / Durable Objects.

## Kiểm thử / Test

```bash
node --test relay/worker.test.mjs
```
