# Model 3D tuỳ chỉnh (không bắt buộc)

Mặc định cảnh 3D (máy giặt, Bọt, chai nước giặt, giỏ đồ) được dựng bằng code trong `docs/scene.js`.
Muốn dùng model của designer, chỉ cần thả file `.glb` vào thư mục này — trang tự thay thế, không cần sửa code.

| File | Thay thế | Tên node (trong file glb) |
|---|---|---|
| `machine.glb` | Máy giặt | `Door` (cửa — gốc xoay đặt ở bản lề), `Drum` (lồng giặt, sẽ quay), `Knob` (núm xoay chọn màn LED), `Screen` (mesh phẳng, có UV — sẽ hiện màn LCD trạng thái) |
| `bot.glb` | Bọt | `Face` (mesh phẳng có UV — sẽ hiện biểu cảm pixel). Cả model nhảy/nghiêng theo trạng thái |

- Node nào thiếu thì phần đó đơn giản không hoạt động (vd. không có `Door` thì cửa không mở), trang vẫn chạy.
- Model được tự co giãn: máy giặt cao ~2.4 đơn vị, Bọt cao ~0.6, đặt chạm sàn ở giữa.
- Nên xuất glTF 2.0, dưới ~5 MB, texture ≤ 2048px.
- `Door`, `Knob` bấm được (mở chọn file / đổi chương trình), `Bot` bấm thì Bọt nhảy.
- Chạy thử cục bộ cần máy chủ web (module ES không chạy từ `file://`): `python3 -m http.server -d docs`.
