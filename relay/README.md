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

## Lưu ý bảo mật / Security notes

- Trạm là **công khai**: ai mở được trang web đều có thể gửi mẻ giặt (tốn giờ GPU Kaggle của bạn). `ALLOWED_ORIGINS` chỉ chặn *trang web khác* dùng trình duyệt của người dùng, **không** chặn người gọi trực tiếp bằng script.
  Hãy giữ `MAX_JOBS_PER_HOUR` thấp; nếu cần chặt hơn, đặt Cloudflare Access / WAF rate-limiting phía trước Worker.
- Token chỉ cần quyền tối thiểu ở bước 1; không bao giờ để token trong `docs/` hay `wrangler.toml`.
- Bộ nhớ giới hạn tần suất nằm trong từng isolate (đủ chặn lạm dụng thông thường). Cần chính xác tuyệt đối thì dùng KV / Durable Objects.

## Kiểm thử / Test

```bash
node --test relay/worker.test.mjs
```
