# 🛡️ Satek Linter v3 — Universal Frontend Architecture & AST Advisory Engine

> **Hệ thống phân tích tĩnh kiến trúc Frontend, Design Tokens SSOT, RTK Query, Thin Route TanStack và quy chuẩn React Clean Code chuyên sâu cho các dự án Frontend hiện đại.**  
> **Sử dụng TypeScript Compiler API & PostCSS, vận hành theo mô hình Full Advisory Engine tối ưu cho AI Coding Agents.**

---

## 📦 1. CÀI ĐẶT & THIẾT LẬP (INSTALLATION)

### Thiết lập Toàn Cục qua `npm link`
Từ thư mục `satek-linter-cli`:
```powershell
npm link
```

Sau khi thiết lập, bạn có thể chạy lệnh `satek-lint` hoặc `fe-lint` tại bất kỳ thư mục dự án nào.

---

## 🚀 2. HƯỚNG DẪN SỬ DỤNG (USAGE)

### A. Quét Toàn Bộ Dự Án
```powershell
# Quét toàn bộ mã nguồn từ thư mục hiện tại:
satek-lint

# Hoặc quét thư mục/tệp cụ thể:
satek-lint --path=src/components/cart
```

### B. Xuất Báo Cáo Cho AI Agent (JSON Schema v3)
```powershell
# In trực tiếp payload JSON ra terminal:
satek-lint --format=json

# Hoặc lưu ra file JSON để agent phân tích:
satek-lint --report=audit-report.json
```

### C. Xem Ma Trận Truy Vết Quy Chuẩn (Traceability Matrix)
```powershell
satek-lint --coverage
```
In toàn bộ danh mục các yêu cầu chuẩn hóa từ 6 tài liệu quy chuẩn (`rules.md`, `api.md`, `list_page_table_rules.md`, `quy_chuan_code_cong_ty.md`, `query_guides.md`, `feature_development_guide.md`) cùng trạng thái tự động hóa tương ứng.

### D. Xem Danh Mục Quy Tắc
```powershell
# Xem toàn bộ danh mục quy tắc:
satek-lint --rules

# Tra cứu quy tắc theo từ khóa:
satek-lint --rules=query
```

---

## 🧭 3. NGUYÊN LÝ HOẠT ĐỘNG (ADVISORY ENGINE)

1. **Không dừng sớm, luôn quét hết**: Linter duyệt qua toàn bộ codebase và phân tích sâu cấu trúc AST, Module Graph, Query Grammar và Git metadata.
2. **Finding mang tính chất tư vấn (Advisory)**: Cảnh báo vi phạm giúp AI Agent và lập trình viên nhận diện chính xác vị trí và ngữ cảnh cần khắc phục. Phiên quét hoàn tất **luôn trả exit code `0`**.
3. **Mã thoát (Exit Codes)**:
   - `0`: Phiên quét hoàn thành thành công (dù có hoặc không có cảnh báo vi phạm).
   - `2`: Lỗi tham số dòng lệnh, đường dẫn quét không tồn tại, hoặc cú pháp file cấu hình bị hỏng.
   - `3`: Lỗi nội bộ không thể phục hồi (Engine Crash).

---

## 🏗️ 4. KIẾN TRÚC 6 RULE PACKS

- **`source-ast`**: Phân tích cú pháp AST qua TypeScript Compiler API (import `../../`, static JSX boolean, Radix Trigger `asChild`, Thin Route, React hooks guard, `any` keyword, semantic tokens).
- **`module-graph`**: Phân tích đồ thị phụ thuộc và kiến trúc barrel (public barrel entrypoint, cấm external deep import, self-circular imports, workflow steps colocation, PascalCase naming).
- **`query-contract`**: Kiểm tra hợp đồng API & RTK Query (`baseApi.injectEndpoints`, query parameters isolation, 10 toán tử `searchFields`, delimiter `;` và `:`, cache tag integrity, natural ID).
- **`list-page`**: Chuẩn hóa cấu trúc trang danh sách (1 object state `filters`, 1 `updateFilter` bọc useCallback xử lý reset page, `useDebounce(..., 300)`, hằng số `DEFAULT_LIMIT`).
- **`repository`**: Kiểm tra cấu hình và metadata local (Prettier 2 spaces, EditorConfig, branch naming `dev_<name>_<feature>`, Conventional Commits 8 types, Husky wiring).
- **`heuristic-and-manual`**: Cảnh báo kiến trúc gợi ý (utils vs domain helpers, prop drilling API, duplicate dispatch) và danh mục kiểm tra thủ công (manual checklist).

---

## 🧪 5. KIỂM THỬ (TESTING)

Chạy bộ kiểm thử tự động sử dụng test runner built-in `node:test`:
```powershell
npm test
```
Bao gồm đầy đủ Unit Tests, Rule Fixture & Regression Tests, và CLI Integration Tests.
