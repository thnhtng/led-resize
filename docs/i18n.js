/* Đa ngôn ngữ: Tiếng Việt · English · 한국어.  t("khoá", {biến}) — mảng (lời của Bọt) lấy bằng tl("khoá"). */
export const LANGS = [
  { code: "vi", name: "Tiếng Việt" },
  { code: "en", name: "English" },
  { code: "ko", name: "한국어" }
];

const D = {
vi: {
  "meta.title": "size-washer · máy giặt resize video",
  "meta.desc": "Thả video vào máy giặt, chỉnh cài đặt ngay trên màn hình máy, AI mở rộng video cho vừa mọi màn LED.",
  "logo.alt": "size-washer",
  "lang.label": "Ngôn ngữ",
  "hist.btn": "Lịch sử", "hist.title": "Giỏ đồ đã giặt", "hist.meta.active": "(đang giặt)", "hist.empty": "Chưa có mẻ giặt nào.<br>Thả video vào máy để bắt đầu nhé.",
  "hist.sync": "Đồng bộ trạng thái Kaggle", "hist.refresh": "Làm mới", "hist.close": "Đóng",
  "sound.on": "Đang bật tiếng — bấm để tắt", "sound.off": "Đang tắt tiếng — bấm để bật",
  "power.on": "Đã cắm điện", "power.off": "Cắm điện", "power.title.on": "Máy đang có điện — bấm để rút phích", "power.title.off": "Bấm để cắm điện cho máy giặt",
  "plug.hint": "Bấm vào phích để cắm điện",
  "preset.portrait": "Dọc 9:16", "preset.square": "Vuông",
  "mode.quick": "Nhanh", "mode.normal": "Đẹp", "mode.deep": "Siêu đẹp",
  "mode.quick.desc": "Làm mờ viền, xong liền", "mode.normal.desc": "AI vẽ thêm viền · khuyên dùng", "mode.deep.desc": "AI cao cấp, chờ lâu hơn",
  "meter.speed": "Tốc độ", "meter.quality": "Độ đẹp",
  "unit.min": "phút", "unit.hour": "giờ",

  "say.idle": ["Zzz... thả video vào bụng mình đi!", "Mình đói video quá~", "Kéo video vào cửa kính nha!"],
  "say.hungry": ["Aaa~ thả đi thả đi!", "Há miệng rồi nè!"],
  "say.washing": ["Quay quay~ đừng mở cửa nha!", "Nhiều bọt ghê, hihi.", "Hơi chóng mặt xíu..."],
  "say.done": ["Ting! Xong rồi, ra phơi thôi!"],
  "say.error": ["Ối, máy kẹt rồi... xem lỗi nha."],
  "say.poke": ["Nhột quá!", "Hihi~", "Bấm màn hình máy để cài đặt nha!"],
  "say.off": ["Zzz... cắm điện cho mình đi!", "Bấm vào phích điện nhé~"],
  "say.needPower": "Cắm điện cho mình trước nha!",
  "say.powering": "Đang cắm điện…",
  "say.powered": "Có điện rồi! Thả video vào đi!",
  "say.powerFail": "Hic, ổ điện không có điện...",
  "say.noUnplug": "Đang giặt, đừng rút điện nha!",
  "say.noOpen": "Đang giặt, đừng mở cửa nha!",
  "say.pulled": "Đã lấy vải ra rồi nè.",
  "say.thinking": "Ăm ăm... để mình xem nào.",
  "say.onlyVideo": "Mình chỉ ăn video thôi nha!",
  "say.chooseLed": "Ngon! Bấm màn hình máy để chọn màn LED nha.",
  "say.fit": "Vừa khít! Mình chỉ ủi thôi.",
  "say.fill": "Mình sẽ vẽ thêm ~{p}% viền. Bấm GIẶT!",
  "say.empty": "Máy đang trống! Thả video vào trước nha.",

  "err.power.nobackend": "Máy chưa được nối nguồn tổng. Nhờ quản trị viên cấu hình (xem relay/README.md).",
  "err.power.relay": "Không liên lạc được với trạm điện (relay). Thử lại sau nhé.",
  "err.power.auth": "Nguồn không hợp lệ (token). Kiểm tra trong chế độ ?pro.",
  "err.onlyVideo": "Chỉ nhận file video (mp4, mov, webm...).",
  "err.skipped": "Đã bỏ qua {n} file không phải video.",
  "err.busy": "Máy đang giặt mẻ trước — video đã vào giỏ chờ.",
  "err.net": "Lỗi mạng: {m}",
  "err.size": "Kích thước phải trong khoảng 64–16384 px",
  "err.tooLong": "Phiếu giặt quá dài.",
  "err.401": "Token không hợp lệ hoặc hết hạn.", "err.403": "Token thiếu quyền (cần 'Actions: Read and write').",
  "err.404": "Không thấy workflow hoặc repo. Kiểm tra tên repo và file submit.yml.", "err.422": "GitHub từ chối đầu vào.", "err.429": "Gửi quá nhanh, đợi một chút rồi thử lại.",
  "err.http": "Lỗi {s} từ máy chủ.",
  "err.missing": "Chưa thấy mẻ giặt trong danh sách. Xem tab Actions trên GitHub xem phiếu có chạy không.",
  "val.noVideo": "Máy đang trống! Thả video vào cửa máy giặt trước nha.", "val.noSize": "Chưa chọn màn LED nào ở bước 2.", "val.noGpu": "Chưa chọn GPU (trong chế độ thợ giặt).",

  "lcd.ready": "SẴN SÀNG", "lcd.ready.sub": "thả video vào máy", "lcd.hungry": "HÁ MIỆNG...", "lcd.hungry.sub": "thả video đi!",
  "lcd.press": "BẤM GIẶT!", "lcd.pickLed": "CHỌN MÀN LED", "lcd.loaded.sub": "{n} video{size}{est}",
  "lcd.send": "GỬI PHIẾU", "lcd.queue": "XẾP HÀNG", "lcd.wash": "ĐANG GIẶT", "lcd.wash.sub": "⏱ {t}{est}",
  "lcd.done": "XONG RỒI!", "lcd.done.sub": "xem vải phơi",
  "lcd.err": "MÁY KẸT", "lcd.err.sub": "xem lỗi bên dưới", "lcd.err.cancel": "mẻ giặt bị huỷ",
  "lcd.boot": "KHỞI ĐỘNG…", "lcd.boot.sub": "chờ chút",
  "lcd.ph0": "GỬI", "lcd.ph1": "XẾP HÀNG", "lcd.ph2": "GIẶT", "lcd.ph3": "XONG",
  "doc.washing": "🫧 Đang giặt… · ", "doc.done": "✅ Giặt xong · ", "doc.error": "⚠ Máy kẹt · ",
  "door.hint": "THẢ VIDEO<br>VÀO ĐÂY", "door.hint.drag": "THẢ RA ĐI!", "door.hint.small": "hoặc bấm để chọn",
  "door.aria": "Thả video vào đây hoặc bấm để chọn file",

  "bar.idle": "Kéo video vào máy giặt để bắt đầu", "bar.pick": "📂 Chọn video", "bar.off": "Máy chưa có điện — cắm phích để bắt đầu", "bar.plug": "⏻ Cắm điện", "bar.settings": "⚙ Cài đặt", "bar.settings.aria": "Mở bảng cài đặt trên màn hình máy",
  "bar.none": "Chưa có video", "bar.noLed": "chưa chọn màn", "bar.leds": "{n} màn LED",
  "wash.send": "Đang gửi phiếu giặt…", "wash.queue": "Đang xếp hàng chờ máy…", "wash.run": "Đang giặt…", "wash.hist": "Xem lịch sử giặt",
  "step.send": "Gửi phiếu", "step.queue": "Xếp hàng", "step.run": "Đang giặt", "step.done": "Xong",
  "done.title": "Xong rồi! Vải đã được phơi 🎉", "done.hint": "Bấm vào tấm vải trên dây phơi để xem video đã resize.",
  "done.view": "▶ Xem video", "done.copy": "Lấy đồ ra (sao chép lệnh)", "done.kaggle": "Mở Kaggle", "done.new": "Giặt mẻ mới",
  "done.dl": "Dán lệnh vào Terminal để tải về <code>~/Downloads/led_out</code>",
  "fail.title": "Máy kẹt rồi", "fail.view": "Xem lỗi", "fail.retry": "Thử lại", "fail.log": "Log GitHub",

  "panel.title": "BẢNG ĐIỀU KHIỂN", "panel.close": "Đóng bảng điều khiển",
  "panel.lcd.ready": "SẴN SÀNG GIẶT", "panel.lcd.noVideo": "CÒN THIẾU: VIDEO", "panel.lcd.noLed": "CÒN THIẾU: MÀN LED",
  "step.video": "Video", "step.led": "Màn LED", "step.wash": "Nước giặt", "step.none": "Chưa chọn",
  "sec.video": "Video của bạn", "sec.led": "Giặt cho màn LED nào?", "sec.wash": "Chọn nước giặt",
  "video.add": "Thêm video", "video.choose": "Chọn video", "video.read": "đang đọc…", "video.rm": "Lấy ra", "tag.kaggle": "✓ trên Kaggle", "tag.nokaggle": "⚠ chưa lên Kaggle",
  "led.other": "+ Khác", "led.other.sub": "tuỳ chỉnh", "led.rm": "bỏ ✕", "led.name": "Tên (tuỳ chọn)", "led.w": "Rộng px", "led.h": "Cao px", "led.add": "Thêm",
  "pv.aria": "Xem trước video trong khung màn LED", "pv.none": "Chọn màn LED để xem trước", "pv.fit": "Vừa khít — không cần AI vẽ thêm", "pv.fill": "AI sẽ vẽ thêm ~{p}% viền quanh video", "pv.viewing": " · đang xem {n}", "pv.ai": "AI vẽ",
  "trial.title": "Giặt thử {s} đầu trước", "trial.sub": "Xem nhanh kết quả, đỡ tốn giờ GPU",
  "alert.quota": "Mẻ này vượt hạn mức GPU trong tuần.", "alert.gpu14": "Siêu đẹp cần GPU mạnh, có thể không chạy được trên tài khoản miễn phí.", "fix.lighter": "Giặt nhẹ hơn", "fix.gpu": "Dùng GPU mạnh hơn",
  "up.title": "Video cần được gửi lên Kaggle trước khi giặt.", "up.run": "Chạy lệnh này trên máy bạn:", "up.hint": "Xong thì mở 🧺 Lịch sử → \"Đồng bộ trạng thái Kaggle\". Trang thấy video sau tối đa ~15 phút.", "copy": "Sao chép",
  "sum.noVideo": "Thả video vào máy hoặc bấm ＋ Thêm video", "sum.noLed": "Chọn ít nhất một màn LED ở bước 2", "sum.fit": "Vừa khít, khỏi vẽ thêm", "sum.fill": "AI vẽ thêm ~{p}% viền",
  "run.go": "▶ GIẶT!", "run.sending": "Đang gửi…", "toast.copied": "Đã sao chép lệnh", "toast.sent": "Đã gửi phiếu! Khoảng 1–2 phút nữa mẻ giặt hiện trong lịch sử.",
  "toast.sync": "Đang đồng bộ, làm mới sau ~1 phút.", "toast.reused": "Đã nạp lại cài đặt của {id}", "toast.done": "Giặt xong mẻ {id}!", "toast.failed": "Mẻ {id} bị kẹt.",
  "toast.needPlug": "Cần cắm điện trước nhé.", "prompt.copy": "Sao chép lệnh:",

  "pull.title": "Lấy vải ra khỏi máy?", "pull.take": "Lấy ra", "pull.add": "＋ Thêm video", "pull.close": "Đóng cửa", "pull.note": "Lấy ra là bỏ video này khỏi máy.",

  "view.title": "Vải đã giặt", "view.none": "Chưa có bản xem trước cho mẻ này (bản xem thử chỉ có ở các mẻ mới). Tải kết quả về bằng lệnh bên dưới.",
  "view.copy": "Sao chép lệnh tải về", "view.kaggle": "Mở Kaggle", "view.close": "Đóng", "view.out": "Kết quả {n}", "view.size": "Kích thước", "view.dl": "Tải về bản đầy đủ",

  "job.queue": "Xếp hàng", "job.run": "Đang giặt", "job.ok": "Giặt xong", "job.bad": "Máy kẹt", "job.cancel": "Đã huỷ",
  "job.get": "Lấy đồ ra", "job.kaggle": "Kaggle", "job.log": "Log", "job.reuse": "Giặt lại", "job.view": "▶ Xem", "job.errq": "Máy báo lỗi gì?",
  "job.sent": "gửi", "job.finished": "xong", "job.test": "thử {s}s",
  "pro.hint": "Đang ở chế độ thợ giặt."
},

en: {
  "meta.title": "size-washer · video resize laundry",
  "meta.desc": "Drop a video into the washing machine, tune it right on the machine's screen, and AI extends it to fit any LED display.",
  "logo.alt": "size-washer",
  "lang.label": "Language",
  "hist.btn": "History", "hist.title": "Washed laundry", "hist.meta.active": "(washing)", "hist.empty": "No loads yet.<br>Drop a video into the machine to start.",
  "hist.sync": "Sync Kaggle status", "hist.refresh": "Refresh", "hist.close": "Close",
  "sound.on": "Sound on — click to mute", "sound.off": "Sound off — click to unmute",
  "power.on": "Plugged in", "power.off": "Plug in", "power.title.on": "The machine is powered — click to unplug", "power.title.off": "Click to plug in the washing machine",
  "plug.hint": "Click the plug to power on",
  "preset.portrait": "Portrait 9:16", "preset.square": "Square",
  "mode.quick": "Quick", "mode.normal": "Nice", "mode.deep": "Ultra",
  "mode.quick.desc": "Blurred edges, instant", "mode.normal.desc": "AI fills the edges · recommended", "mode.deep.desc": "Premium AI, takes longer",
  "meter.speed": "Speed", "meter.quality": "Quality",
  "unit.min": "min", "unit.hour": "h",

  "say.idle": ["Zzz... drop a video in my belly!", "I'm so hungry for videos~", "Drag a video onto the glass door!"],
  "say.hungry": ["Aaa~ drop it, drop it!", "I'm opening wide!"],
  "say.washing": ["Spin spin~ don't open the door!", "So many bubbles, hehe.", "A little dizzy..."],
  "say.done": ["Ding! All done — time to hang it out!"],
  "say.error": ["Oops, the machine jammed... check the error."],
  "say.poke": ["That tickles!", "Hehe~", "Tap the machine's screen to set things up!"],
  "say.off": ["Zzz... plug me in!", "Click the plug~"],
  "say.needPower": "Plug me in first!",
  "say.powering": "Plugging in…",
  "say.powered": "Power's on! Drop a video in!",
  "say.powerFail": "Aww, the socket has no power...",
  "say.noUnplug": "I'm washing — don't unplug me!",
  "say.noOpen": "I'm washing — don't open the door!",
  "say.pulled": "Pulled the cloth out.",
  "say.thinking": "Nom nom... let me take a look.",
  "say.onlyVideo": "I only eat videos!",
  "say.chooseLed": "Yum! Tap the machine's screen to pick an LED display.",
  "say.fit": "A perfect fit! I'll just iron it.",
  "say.fill": "I'll paint ~{p}% extra edge for you. Hit WASH!",
  "say.empty": "The machine is empty! Drop a video in first.",

  "err.power.nobackend": "The machine isn't connected to the main power yet. Ask an admin to set it up (see relay/README.md).",
  "err.power.relay": "Can't reach the power station (relay). Try again later.",
  "err.power.auth": "The power source is invalid (token). Check it in ?pro mode.",
  "err.onlyVideo": "Only video files are accepted (mp4, mov, webm...).",
  "err.skipped": "Skipped {n} non-video file(s).",
  "err.busy": "The machine is washing a previous load — your video is waiting in the basket.",
  "err.net": "Network error: {m}",
  "err.size": "Size must be between 64 and 16384 px",
  "err.tooLong": "The job ticket is too long.",
  "err.401": "Invalid or expired token.", "err.403": "The token lacks permission (needs 'Actions: Read and write').",
  "err.404": "Workflow or repo not found. Check the repo name and submit.yml.", "err.422": "GitHub rejected the input.", "err.429": "Too fast — wait a moment and try again.",
  "err.http": "Server error {s}.",
  "err.missing": "The load doesn't show up in the list. Check the GitHub Actions tab to see if the job ran.",
  "val.noVideo": "The machine is empty! Drop a video into the door first.", "val.noSize": "No LED display chosen in step 2.", "val.noGpu": "No GPU chosen (in pro mode).",

  "lcd.ready": "READY", "lcd.ready.sub": "drop a video in", "lcd.hungry": "OPEN WIDE...", "lcd.hungry.sub": "drop it!",
  "lcd.press": "PRESS WASH!", "lcd.pickLed": "PICK LED SIZE", "lcd.loaded.sub": "{n} video{size}{est}",
  "lcd.send": "SENDING", "lcd.queue": "IN QUEUE", "lcd.wash": "WASHING", "lcd.wash.sub": "⏱ {t}{est}",
  "lcd.done": "ALL DONE!", "lcd.done.sub": "see the clothesline",
  "lcd.err": "JAMMED", "lcd.err.sub": "see the error below", "lcd.err.cancel": "the load was cancelled",
  "lcd.boot": "BOOTING…", "lcd.boot.sub": "one moment",
  "lcd.ph0": "SEND", "lcd.ph1": "QUEUE", "lcd.ph2": "WASH", "lcd.ph3": "DONE",
  "doc.washing": "🫧 Washing… · ", "doc.done": "✅ Done · ", "doc.error": "⚠ Jammed · ",
  "door.hint": "DROP VIDEO<br>HERE", "door.hint.drag": "LET GO!", "door.hint.small": "or click to choose",
  "door.aria": "Drop a video here or click to choose a file",

  "bar.idle": "Drag a video into the machine to start", "bar.pick": "📂 Choose video", "bar.off": "No power — plug in to begin", "bar.plug": "⏻ Plug in", "bar.settings": "⚙ Settings", "bar.settings.aria": "Open the settings panel on the machine's screen",
  "bar.none": "No video", "bar.noLed": "no display chosen", "bar.leds": "{n} LED displays",
  "wash.send": "Sending the job ticket…", "wash.queue": "Waiting in the queue…", "wash.run": "Washing…", "wash.hist": "View wash history",
  "step.send": "Send", "step.queue": "Queue", "step.run": "Washing", "step.done": "Done",
  "done.title": "All done! The cloth is hung out 🎉", "done.hint": "Click the cloth on the clothesline to watch the resized video.",
  "done.view": "▶ Watch video", "done.copy": "Get the laundry (copy command)", "done.kaggle": "Open Kaggle", "done.new": "New load",
  "done.dl": "Paste the command into Terminal to download to <code>~/Downloads/led_out</code>",
  "fail.title": "The machine jammed", "fail.view": "Show error", "fail.retry": "Try again", "fail.log": "GitHub log",

  "panel.title": "CONTROL PANEL", "panel.close": "Close control panel",
  "panel.lcd.ready": "READY TO WASH", "panel.lcd.noVideo": "MISSING: VIDEO", "panel.lcd.noLed": "MISSING: LED SIZE",
  "step.video": "Video", "step.led": "LED size", "step.wash": "Detergent", "step.none": "Not set",
  "sec.video": "Your video", "sec.led": "Wash for which LED display?", "sec.wash": "Pick a detergent",
  "video.add": "Add video", "video.choose": "Choose video", "video.read": "reading…", "video.rm": "Take out", "tag.kaggle": "✓ on Kaggle", "tag.nokaggle": "⚠ not on Kaggle",
  "led.other": "+ Other", "led.other.sub": "custom", "led.rm": "remove ✕", "led.name": "Name (optional)", "led.w": "Width px", "led.h": "Height px", "led.add": "Add",
  "pv.aria": "Preview of the video inside the LED display", "pv.none": "Pick an LED display to preview", "pv.fit": "Perfect fit — no AI fill needed", "pv.fill": "AI will fill ~{p}% extra edge around the video", "pv.viewing": " · viewing {n}", "pv.ai": "AI fill",
  "trial.title": "Test the first {s} first", "trial.sub": "Preview the result quickly and save GPU hours",
  "alert.quota": "This load exceeds this week's GPU quota.", "alert.gpu14": "Ultra needs a strong GPU and may not run on a free account.", "fix.lighter": "Go lighter", "fix.gpu": "Use a stronger GPU",
  "up.title": "The video must be uploaded to Kaggle before washing.", "up.run": "Run this command on your computer:", "up.hint": "Then open 🧺 History → \"Sync Kaggle status\". The page sees the video within ~15 minutes.", "copy": "Copy",
  "sum.noVideo": "Drop a video into the machine or click ＋ Add video", "sum.noLed": "Pick at least one LED display in step 2", "sum.fit": "Perfect fit, no fill needed", "sum.fill": "AI fills ~{p}% extra edge",
  "run.go": "▶ WASH!", "run.sending": "Sending…", "toast.copied": "Command copied", "toast.sent": "Ticket sent! The load shows up in history in about 1–2 minutes.",
  "toast.sync": "Syncing, refresh in ~1 minute.", "toast.reused": "Loaded the settings of {id}", "toast.done": "Load {id} is done!", "toast.failed": "Load {id} jammed.",
  "toast.needPlug": "Plug the machine in first.", "prompt.copy": "Copy the command:",

  "pull.title": "Take the cloth out?", "pull.take": "Take out", "pull.add": "＋ Add video", "pull.close": "Close door", "pull.note": "Taking it out removes the video from the machine.",

  "view.title": "Washed cloth", "view.none": "No preview for this load (previews only exist for new loads). Download the result with the command below.",
  "view.copy": "Copy download command", "view.kaggle": "Open Kaggle", "view.close": "Close", "view.out": "Result {n}", "view.size": "Size", "view.dl": "Download the full version",

  "job.queue": "In queue", "job.run": "Washing", "job.ok": "Done", "job.bad": "Jammed", "job.cancel": "Cancelled",
  "job.get": "Get laundry", "job.kaggle": "Kaggle", "job.log": "Log", "job.reuse": "Wash again", "job.view": "▶ Watch", "job.errq": "What went wrong?",
  "job.sent": "sent", "job.finished": "finished", "job.test": "test {s}s",
  "pro.hint": "Pro mode."
},

ko: {
  "meta.title": "size-washer · 영상 리사이즈 세탁기",
  "meta.desc": "영상을 세탁기에 넣고 기계 화면에서 바로 설정하면, AI가 어떤 LED 화면에도 맞게 영상을 확장해 줍니다.",
  "logo.alt": "size-washer",
  "lang.label": "언어",
  "hist.btn": "기록", "hist.title": "세탁 완료 빨래", "hist.meta.active": "(세탁 중)", "hist.empty": "아직 세탁한 빨래가 없어요.<br>영상을 세탁기에 넣어 시작해 보세요.",
  "hist.sync": "Kaggle 상태 동기화", "hist.refresh": "새로고침", "hist.close": "닫기",
  "sound.on": "소리 켜짐 — 눌러서 끄기", "sound.off": "소리 꺼짐 — 눌러서 켜기",
  "power.on": "전원 연결됨", "power.off": "전원 연결", "power.title.on": "전원이 연결되어 있어요 — 눌러서 플러그 뽑기", "power.title.off": "눌러서 세탁기에 전원을 연결하세요",
  "plug.hint": "플러그를 눌러 전원을 켜세요",
  "preset.portrait": "세로 9:16", "preset.square": "정사각형",
  "mode.quick": "빠르게", "mode.normal": "예쁘게", "mode.deep": "초특급",
  "mode.quick.desc": "가장자리 흐림, 즉시 완료", "mode.normal.desc": "AI가 가장자리를 채움 · 추천", "mode.deep.desc": "고급 AI, 더 오래 걸림",
  "meter.speed": "속도", "meter.quality": "품질",
  "unit.min": "분", "unit.hour": "시간",

  "say.idle": ["쿨쿨... 영상을 내 배 속에 넣어줘!", "영상이 너무 먹고 싶어~", "유리문에 영상을 끌어다 놓아줘!"],
  "say.hungry": ["아~ 놓아줘 놓아줘!", "입 크게 벌렸어!"],
  "say.washing": ["빙글빙글~ 문 열지 마!", "거품이 정말 많아, 헤헤.", "조금 어지러워..."],
  "say.done": ["딩동! 다 됐어요, 널러 가요!"],
  "say.error": ["앗, 기계가 걸렸어요... 오류를 확인해 줘."],
  "say.poke": ["간지러워!", "헤헤~", "기계 화면을 눌러서 설정해 봐!"],
  "say.off": ["쿨쿨... 전원 좀 연결해 줘!", "플러그를 눌러줘~"],
  "say.needPower": "먼저 전원을 연결해 줘!",
  "say.powering": "전원 연결 중…",
  "say.powered": "전원이 들어왔어! 영상을 넣어줘!",
  "say.powerFail": "흑, 콘센트에 전기가 없어...",
  "say.noUnplug": "세탁 중이야, 플러그 뽑지 마!",
  "say.noOpen": "세탁 중이야, 문 열지 마!",
  "say.pulled": "천을 꺼냈어요.",
  "say.thinking": "냠냠... 한번 볼게.",
  "say.onlyVideo": "나는 영상만 먹어!",
  "say.chooseLed": "맛있다! 기계 화면을 눌러 LED 화면을 골라줘.",
  "say.fit": "딱 맞아! 다림질만 할게.",
  "say.fill": "가장자리를 ~{p}% 더 그려줄게. 세탁 버튼을 눌러!",
  "say.empty": "세탁기가 비어 있어요! 먼저 영상을 넣어주세요.",

  "err.power.nobackend": "아직 기계에 메인 전원이 연결되지 않았어요. 관리자에게 설정을 요청하세요 (relay/README.md 참고).",
  "err.power.relay": "전력 스테이션(릴레이)에 연결할 수 없어요. 잠시 후 다시 시도하세요.",
  "err.power.auth": "전원(토큰)이 유효하지 않아요. ?pro 모드에서 확인하세요.",
  "err.onlyVideo": "영상 파일만 받을 수 있어요 (mp4, mov, webm...).",
  "err.skipped": "영상이 아닌 파일 {n}개를 건너뛰었어요.",
  "err.busy": "이전 빨래를 세탁 중이에요 — 영상은 바구니에서 기다려요.",
  "err.net": "네트워크 오류: {m}",
  "err.size": "크기는 64–16384 px 사이여야 해요",
  "err.tooLong": "세탁 주문서가 너무 길어요.",
  "err.401": "토큰이 유효하지 않거나 만료되었어요.", "err.403": "토큰에 권한이 없어요 ('Actions: Read and write' 필요).",
  "err.404": "워크플로 또는 저장소를 찾을 수 없어요. 저장소 이름과 submit.yml을 확인하세요.", "err.422": "GitHub가 입력을 거부했어요.", "err.429": "너무 빨라요. 잠시 후 다시 시도하세요.",
  "err.http": "서버 오류 {s}.",
  "err.missing": "목록에서 빨래를 찾을 수 없어요. GitHub Actions 탭에서 작업이 실행됐는지 확인하세요.",
  "val.noVideo": "세탁기가 비어 있어요! 먼저 영상을 문에 넣어주세요.", "val.noSize": "2단계에서 LED 화면을 선택하지 않았어요.", "val.noGpu": "GPU가 선택되지 않았어요 (프로 모드).",

  "lcd.ready": "준비 완료", "lcd.ready.sub": "영상을 넣어주세요", "lcd.hungry": "아~ 벌려요...", "lcd.hungry.sub": "놓아주세요!",
  "lcd.press": "세탁을 누르세요!", "lcd.pickLed": "LED 크기 선택", "lcd.loaded.sub": "영상 {n}개{size}{est}",
  "lcd.send": "전송 중", "lcd.queue": "대기 중", "lcd.wash": "세탁 중", "lcd.wash.sub": "⏱ {t}{est}",
  "lcd.done": "완료!", "lcd.done.sub": "빨랫줄을 확인하세요",
  "lcd.err": "고장", "lcd.err.sub": "아래 오류를 확인하세요", "lcd.err.cancel": "세탁이 취소되었어요",
  "lcd.boot": "부팅 중…", "lcd.boot.sub": "잠시만요",
  "lcd.ph0": "전송", "lcd.ph1": "대기", "lcd.ph2": "세탁", "lcd.ph3": "완료",
  "doc.washing": "🫧 세탁 중… · ", "doc.done": "✅ 완료 · ", "doc.error": "⚠ 고장 · ",
  "door.hint": "여기에<br>영상 놓기", "door.hint.drag": "놓아주세요!", "door.hint.small": "또는 눌러서 선택",
  "door.aria": "여기에 영상을 놓거나 눌러서 파일을 선택하세요",

  "bar.idle": "영상을 세탁기에 끌어다 놓아 시작하세요", "bar.pick": "📂 영상 선택", "bar.off": "전원이 없어요 — 플러그를 꽂아 시작하세요", "bar.plug": "⏻ 전원 연결", "bar.settings": "⚙ 설정", "bar.settings.aria": "기계 화면의 설정 패널 열기",
  "bar.none": "영상 없음", "bar.noLed": "화면 미선택", "bar.leds": "LED 화면 {n}개",
  "wash.send": "세탁 주문서 전송 중…", "wash.queue": "대기열에서 기다리는 중…", "wash.run": "세탁 중…", "wash.hist": "세탁 기록 보기",
  "step.send": "전송", "step.queue": "대기", "step.run": "세탁 중", "step.done": "완료",
  "done.title": "완료! 천이 빨랫줄에 널렸어요 🎉", "done.hint": "빨랫줄의 천을 눌러 리사이즈된 영상을 확인하세요.",
  "done.view": "▶ 영상 보기", "done.copy": "빨래 꺼내기 (명령어 복사)", "done.kaggle": "Kaggle 열기", "done.new": "새 빨래",
  "done.dl": "터미널에 명령어를 붙여넣으면 <code>~/Downloads/led_out</code>에 다운로드돼요",
  "fail.title": "기계가 고장 났어요", "fail.view": "오류 보기", "fail.retry": "다시 시도", "fail.log": "GitHub 로그",

  "panel.title": "제어판", "panel.close": "제어판 닫기",
  "panel.lcd.ready": "세탁 준비 완료", "panel.lcd.noVideo": "필요: 영상", "panel.lcd.noLed": "필요: LED 화면",
  "step.video": "영상", "step.led": "LED 화면", "step.wash": "세제", "step.none": "미선택",
  "sec.video": "내 영상", "sec.led": "어떤 LED 화면에 맞출까요?", "sec.wash": "세제를 고르세요",
  "video.add": "영상 추가", "video.choose": "영상 선택", "video.read": "읽는 중…", "video.rm": "꺼내기", "tag.kaggle": "✓ Kaggle에 있음", "tag.nokaggle": "⚠ Kaggle에 없음",
  "led.other": "+ 기타", "led.other.sub": "직접 입력", "led.rm": "삭제 ✕", "led.name": "이름 (선택)", "led.w": "너비 px", "led.h": "높이 px", "led.add": "추가",
  "pv.aria": "LED 화면 안의 영상 미리보기", "pv.none": "LED 화면을 선택하면 미리 볼 수 있어요", "pv.fit": "딱 맞아요 — AI가 채울 필요 없음", "pv.fill": "AI가 영상 주변을 ~{p}% 더 그려요", "pv.viewing": " · {n} 보는 중", "pv.ai": "AI",
  "trial.title": "먼저 앞 {s}만 시험 세탁", "trial.sub": "결과를 빠르게 확인하고 GPU 시간을 아껴요",
  "alert.quota": "이번 세탁은 주간 GPU 한도를 초과해요.", "alert.gpu14": "초특급은 강력한 GPU가 필요해 무료 계정에서는 실행되지 않을 수 있어요.", "fix.lighter": "가볍게", "fix.gpu": "더 강한 GPU 사용",
  "up.title": "세탁 전에 영상을 Kaggle에 올려야 해요.", "up.run": "내 컴퓨터에서 이 명령어를 실행하세요:", "up.hint": "그다음 🧺 기록 → \"Kaggle 상태 동기화\"를 누르세요. 최대 ~15분 뒤 페이지에서 영상이 보여요.", "copy": "복사",
  "sum.noVideo": "영상을 세탁기에 넣거나 ＋ 영상 추가를 누르세요", "sum.noLed": "2단계에서 LED 화면을 하나 이상 선택하세요", "sum.fit": "딱 맞아요, 채울 필요 없음", "sum.fill": "AI가 ~{p}% 더 그려요",
  "run.go": "▶ 세탁!", "run.sending": "전송 중…", "toast.copied": "명령어를 복사했어요", "toast.sent": "주문서를 보냈어요! 1–2분 뒤 기록에 나타나요.",
  "toast.sync": "동기화 중이에요. 약 1분 뒤 새로고침하세요.", "toast.reused": "{id}의 설정을 불러왔어요", "toast.done": "{id} 세탁 완료!", "toast.failed": "{id} 세탁 중 고장 났어요.",
  "toast.needPlug": "먼저 전원을 연결하세요.", "prompt.copy": "명령어 복사:",

  "pull.title": "천을 꺼낼까요?", "pull.take": "꺼내기", "pull.add": "＋ 영상 추가", "pull.close": "문 닫기", "pull.note": "꺼내면 이 영상이 세탁기에서 빠져요.",

  "view.title": "세탁된 천", "view.none": "이 빨래에는 미리보기가 없어요 (미리보기는 새 빨래에만 있어요). 아래 명령어로 결과를 다운로드하세요.",
  "view.copy": "다운로드 명령어 복사", "view.kaggle": "Kaggle 열기", "view.close": "닫기", "view.out": "결과 {n}", "view.size": "크기", "view.dl": "전체 버전 다운로드",

  "job.queue": "대기 중", "job.run": "세탁 중", "job.ok": "완료", "job.bad": "고장", "job.cancel": "취소됨",
  "job.get": "빨래 꺼내기", "job.kaggle": "Kaggle", "job.log": "로그", "job.reuse": "다시 세탁", "job.view": "▶ 보기", "job.errq": "무슨 오류인가요?",
  "job.sent": "전송", "job.finished": "완료", "job.test": "시험 {s}초",
  "pro.hint": "프로 모드."
}
};

const KEY = "sw.lang";
let cur = "vi";
export function detectLang() {
  try { const s = localStorage.getItem(KEY); if (s && D[s]) return s; } catch (e) {}
  const n = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
  if (n.startsWith("vi")) return "vi";
  if (n.startsWith("ko")) return "ko";
  return "en";
}
export function getLang() { return cur; }
export function setLang(code) {
  if (!D[code]) code = "en";
  cur = code;
  try { localStorage.setItem(KEY, code); } catch (e) {}
  document.documentElement.lang = code;
  return code;
}
export function tl(key) { const v = D[cur][key]; return v !== undefined ? v : (D.en[key] !== undefined ? D.en[key] : key); }
export function t(key, vars) {
  let v = tl(key);
  if (Array.isArray(v)) v = v[0];
  if (vars) v = String(v).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return v;
}
/* áp dụng cho phần HTML tĩnh: data-i18n (text), data-i18n-html (có thẻ), data-i18n-attr="title:khoá;aria-label:khoá" */
export function applyStatic(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    el.dataset.i18nAttr.split(";").forEach(p => { const i = p.indexOf(":"); if (i > 0) el.setAttribute(p.slice(0, i).trim(), t(p.slice(i + 1).trim())); });
  });
  document.title = t("meta.title");
  const md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", t("meta.desc"));
}
export const DICT = D; /* để kiểm thử độ đầy đủ */
