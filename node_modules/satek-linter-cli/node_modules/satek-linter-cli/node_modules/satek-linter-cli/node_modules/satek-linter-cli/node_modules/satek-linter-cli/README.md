# 🛡️ Universal React & Frontend Architecture Linter CLI

> **Global CLI kiểm soát tĩnh kiến trúc, design tokens và best practices cho bất kỳ dự án React / Frontend nào.**

---

## 🚀 Cài Đặt Toàn Cục (Global Setup)

Chạy lệnh link từ thư mục này để tạo lệnh toàn cục:
```powershell
cd E:\stondy\satek-linter-cli
npm link
```

Sau khi link, bạn có thể chạy `satek-lint` hoặc `fe-lint` ở bất kỳ đâu trên máy tính.

---

## 🛠️ Hướng Dẫn Sử Dụng

```powershell
# 1. Quét dự án ở thư mục hiện tại:
satek-lint
# hoặc:
fe-lint

# 2. In danh mục toàn bộ quy tắc ra màn hình:
satek-lint --rules
# hoặc nhấp đúp file: list-rules.bat

# 3. Quét một thư mục hoặc file cụ thể:
satek-lint --path=src/routes
satek-lint --path=src/components/domain

# 4. Xuất báo cáo JSON:
satek-lint --report=audit-report.json
```
