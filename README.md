# 🛡️ Satek & Universal Frontend Architecture Linter CLI

> **Công cụ kiểm soát tĩnh chất lượng kiến trúc, Design Tokens SSOT, RTK Query, Thin Route TanStack và quy chuẩn React Clean Code hàng đầu cho các dự án Frontend hiện đại.**
> **Tốc độ siêu nhanh, 100% Zero-Dependency (Node.js Native), tương thích hoàn hảo với AI Coding Agents & CI/CD Pipeline.**

---

## 📦 1. CÀI ĐẶT & THIẾT LẬP TOÀN CỤC (INSTALLATION)

### Cách 1: Thiết lập Global qua `npm link` (Khuyến nghị khi phát triển)
Từ thư mục `satek-linter-cli`, chạy:
```powershell
cd E:\stondy\satek-linter-cli
npm link
```

### Cách 2: Cài đặt Toàn Cục qua `npm install -g`
```powershell
npm install -g .
```

Sau khi cài đặt xong, bạn có thể chạy lệnh `satek-lint` hoặc `fe-lint` ở bất kỳ thư mục dự án nào trên máy tính.

---

## 🚀 2. HƯỚNG DẪN SỬ DỤNG NHANH (QUICK START)

### A. Quét Toàn Bộ Dự Án
```powershell
# Quét toàn bộ codebase từ thư mục hiện tại:
satek-lint
# hoặc:
fe-lint
```

### B. Quét Theo Từng Nhóm Quy Tắc (Rule Groups)
Giúp AI Agent & Developer dễ dàng phân loại và sửa lỗi dứt điểm theo từng đợt:

```powershell
# 1. Quét riêng lỗi chuỗi Tiếng Việt hardcoded trong JSX (RULE-I18N-001):
satek-lint --group=i18n       # (hoặc viết tắt: satek-lint --i18n)

# 2. Quét riêng lỗi bo góc arbitrary / legacy Tailwind (RULE-RADIUS-001):
satek-lint --group=radius     # (hoặc viết tắt: satek-lint --radius)

# 3. Quét riêng lỗi Kiến trúc (RTK Query mutation tags, Thin Route, Barrel, Folder):
satek-lint --group=arch       # (hoặc viết tắt: satek-lint --arch)

# 4. Quét riêng lỗi Mock Data & Fallback số liệu giả:
satek-lint --group=mock       # (hoặc viết tắt: satek-lint --mock)

# 5. Quét riêng lỗi mã màu arbitrary hex [#...]:
satek-lint --group=color      # (hoặc viết tắt: satek-lint --color)

# 6. Quét riêng lỗi TypeScript any & Barrel imports:
satek-lint --group=types      # (hoặc viết tắt: satek-lint --types)
```

### C. Quét Chính Xác 1 Quy Tắc Cụ Thể (`--rule=<CODE>`)
```powershell
# Quét duy nhất lỗi RTK Query mutation thiếu invalidatesTags:
satek-lint --rule=RULE-RTK-001

# Quét duy nhất lỗi bo góc:
satek-lint --rule=RULE-RADIUS-001

# Quét duy nhất lỗi Self Circular Barrel Import:
satek-lint --rule=RULE-IMPORT-001
```

### D. Giới Hạn Phạm Vi Đường Dẫn (`--path=<FOLDER|FILE>`)
```powershell
# Quét riêng thư mục module giỏ hàng:
satek-lint --path=src/components/cart

# Kết hợp quét riêng 1 nhóm lỗi trong 1 thư mục:
satek-lint --path=src/components/cart --radius
satek-lint --path=src/components/ai --i18n
satek-lint --path=src/store/api --rule=RULE-RTK-001
```

### E. Tra Cứu Danh Mục Quy Chuẩn (`--rules`)
```powershell
# In toàn bộ danh mục 41 quy tắc tiêu chuẩn:
satek-lint --rules
# hoặc:
fe-lint -l

# Tra cứu chi tiết 1 quy tắc cụ thể:
satek-lint --rules=RULE-RADIUS-001
satek-lint --rules=RULE-UI-001
satek-lint -r i18n
```

### F. Chế Độ Bàn Phím Tương Tác (Interactive Terminal UI Dashboard)
```powershell
# Mở giao diện Dashboard Master-Detail tương tác bằng phím:
satek-lint --tui
# hoặc:
satek-lint -i
```
- Phím `↑` / `↓`: Duyệt qua các tệp tin (Chi tiết lỗi hiển thị tự động tức thì).
- Phím `Tab` hoặc `1..5`: Chuyển đổi tab phân loại lỗi.
- Phím `PageUp` / `PageDown`: Cuộn chi tiết lỗi.
- Phím `q` / `Esc`: Thoát.

---

## 🤖 3. TÍCH HỢP AI AGENT & CI/CD PIPELINE

CLI được thiết kế chuẩn mực phục vụ tự động hóa và tích hợp với các AI Agent (Antigravity, Claude, Copilot, Cursor...):
- **Định dạng Clickable chuẩn IDE:** `#XX [RULE-CODE] src/path/file.tsx:line - Rule Name` (Cho phép click trực tiếp để nhảy vào file).
- **Mã thoát (Exit Code):** Trả về `0` khi toàn bộ tệp tin hợp lệ, `1` khi có vi phạm cần sửa.
- **Xuất dữ liệu cấu trúc JSON:**
  ```powershell
  # Xuất JSON trực tiếp ra stdout:
  satek-lint --format=json

  # Xuất báo cáo ra file JSON:
  satek-lint --report=audit-summary.json
  ```
- **Chế độ chặn CI nghiêm ngặt (`--ci` / `--strict`):**
  ```powershell
  satek-lint --ci
  ```

---

## 📑 4. TỔNG QUAN 8 NHÓM QUY TẮC KIẾN TRÚC TIÊU CHUẨN

1. **Zero Arbitrary Colors & Tokens (`RULE-COLOR-*`):** Cấm 100% việc viết mã màu tùy tiện `text-[#...]`, `bg-[#...]`. Bắt buộc dùng Design Tokens từ `@theme`.
2. **Semantic Border Radius (`RULE-RADIUS-001`):** Sử dụng 4 tokens chuẩn (`rounded-card`, `rounded-field`, `rounded-tile`, `rounded-pill`/`rounded-full`). Cho phép `// -- CUSTOM_RADIUS` cho các góc bo vi mô lồng nhau đặc thù.
3. **HTML & Table Accessibility (`RULE-UI-001`, `RULE-HTML-*`):** Cấm dùng `display: contents` trên cấu trúc Bảng (`<table>`, `<Table>`, `<TableRow>`...) và Data Grid phức tạp để bảo vệ Accessibility Tree.
4. **Thin Route & TanStack Router (`RULE-ROUTE-*`, `RULE-PARAM-*`):** File trong `routes/` chỉ làm nhiệm vụ parse query params và delegate cho Page component (file < 25 dòng). Dynamic param chuẩn hóa là `$id.tsx`.
5. **Barrel Export & Module Hygiene (`RULE-BARREL-*`, `RULE-IMPORT-*`):** Bắt buộc import qua barrel export `@/components/{module}`, cấm import ngược tầng kiến trúc và cấm import từ `./index` gây vòng lặp.
6. **RTK Query Tags Standard (`RULE-RTK-*`):** Mọi mutation phải có `invalidatesTags` và query phải có `providesTags` để tự động đồng bộ cache.
7. **Folder Co-location (`RULE-FOLDER-*`):** Co-locate component phục vụ 1 tab/step vào đúng thư mục tương ứng, xóa bỏ thư mục phẳng legacy cũ.
8. **TypeScript Strict & Clean Code (`RULE-TYPE-*`, `RULE-MOCK-*`, `RULE-I18N-*`):** Cấm `any`, cấm import mock data trong code production, cấm fake count `|| 7`, tách chuỗi Tiếng Việt vào file ngôn ngữ.

---

## 📄 Giấy phép (License)
Phát triển và duy trì bởi **Satek Architecture Team**. Giấy phép MIT.
