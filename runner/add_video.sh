#!/usr/bin/env bash
# add_video.sh <video.mp4> [ten_khong_dau.mp4]
# Thêm video vào dataset Kaggle "led-videos" (giữ nguyên các video đã có). Chạy trên máy bạn.
set -euo pipefail
FILE="${1:?Dùng: bash add_video.sh /duong/dan/video.mp4 [ten_khong_dau.mp4]}"
[ -f "$FILE" ] || { echo "Không thấy file: $FILE"; exit 1; }
RAW="${2:-$(basename "$FILE")}"
NAME="$(python3 -c "import re,sys;print(re.sub(r'[^A-Za-z0-9._-]+','_',sys.argv[1]))" "$RAW")"
DS="${VIDEO_DATASET:-led-videos}"

command -v kaggle >/dev/null 2>&1 || pip install -q kaggle
if [ -f "$HOME/.kaggle/kaggle.json" ]; then
  KUSER="$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.kaggle/kaggle.json')))['username'])")"
else
  KUSER="${KAGGLE_USERNAME:?Đặt KAGGLE_USERNAME hoặc tạo ~/.kaggle/kaggle.json}"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if kaggle datasets status "$KUSER/$DS" >/dev/null 2>&1; then
  echo "Tải các video đã có trong dataset..."
  kaggle datasets download -d "$KUSER/$DS" -p "$TMP" --unzip >/dev/null
  cp "$FILE" "$TMP/$NAME"
  cat > "$TMP/dataset-metadata.json" <<EOF
{"title": "$DS", "id": "$KUSER/$DS", "licenses": [{"name": "CC0-1.0"}]}
EOF
  kaggle datasets version -p "$TMP" -m "thêm $NAME"
else
  cp "$FILE" "$TMP/$NAME"
  cat > "$TMP/dataset-metadata.json" <<EOF
{"title": "$DS", "id": "$KUSER/$DS", "licenses": [{"name": "CC0-1.0"}]}
EOF
  kaggle datasets create -p "$TMP"
fi
echo "Xong. Video '$NAME' đã có trong dataset $KUSER/$DS (private). Trang web sẽ thấy nó sau lần đồng bộ kế tiếp (tối đa ~15 phút)."
