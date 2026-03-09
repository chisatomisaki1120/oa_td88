# Manual Test Checklist — oa_td88

_Last updated: 2026-03-09_

Mục tiêu của checklist này là kiểm tra các flow quan trọng sau các thay đổi gần đây về:
- RBAC / security boundaries
- attendance lifecycle
- xử lý ca treo
- import / export / backup
- overnight shift edge cases

---

## 0. Chuẩn bị môi trường test

## Dataset / tài khoản khuyên dùng
Dùng ít nhất các tài khoản sau:
- `superadmin`
- `admin`
- `employee`

Nên tạo thêm dữ liệu test:
- 1 nhân viên ca thường: `08:00 -> 17:00`
- 1 nhân viên ca qua đêm: `22:00 -> 06:00`
- 1 nhân viên không có shift assignment rõ ràng (nếu muốn test fallback)

## Môi trường
- chạy `npm run lint`
- chạy `npm run build`
- chạy app local bằng `npm run dev`
- DB mặc định: `file:./prisma/dev.db`

## Nguyên tắc test
- test bằng cả `ADMIN` và `SUPER_ADMIN` ở các flow nhạy cảm
- với các thay đổi liên quan chấm công, luôn kiểm tra:
  - UI phản hồi
  - trạng thái cuối cùng trong màn admin attendance
  - warning/status có hợp logic không

---

## 1. Smoke test baseline

### T1. App boot
**Bước**
1. Chạy `npm run dev`
2. Mở app
3. Đăng nhập bằng `superadmin`, `admin`, `employee`

**Kỳ vọng**
- app mở bình thường
- login thành công với tài khoản hợp lệ
- không crash page chính

### T2. Build baseline
**Bước**
1. Chạy `npm run lint`
2. Chạy `npm run build`

**Kỳ vọng**
- lint pass
- build pass

---

## 2. Role boundaries / RBAC

### T3. Admin không được dùng DB import JSON
**Bước**
1. Đăng nhập bằng `admin`
2. Gọi flow/endpoint DB import JSON

**Kỳ vọng**
- bị từ chối quyền
- không có thay đổi DB

### T4. Admin không được restore DB
**Bước**
1. Đăng nhập bằng `admin`
2. Gọi flow/endpoint DB backup restore

**Kỳ vọng**
- bị từ chối quyền
- DB không bị overwrite

### T5. Admin không được export raw DB JSON
**Bước**
1. Đăng nhập bằng `admin`
2. Gọi endpoint DB export JSON

**Kỳ vọng**
- bị từ chối quyền

### T6. SuperAdmin được dùng DB import/export/restore
**Bước**
1. Đăng nhập bằng `superadmin`
2. test backup/export/import/restore trên dữ liệu an toàn

**Kỳ vọng**
- thao tác được phép
- phản hồi thành công hợp lý

### T7. Admin không được sửa security settings hệ thống
**Bước**
1. Đăng nhập bằng `admin`
2. thử PATCH security settings

**Kỳ vọng**
- bị từ chối quyền

### T8. SuperAdmin được sửa security settings
**Bước**
1. Đăng nhập bằng `superadmin`
2. đổi từng flag bảo mật

**Kỳ vọng**
- lưu được
- reload màn hình vẫn thấy giá trị mới

### T9. Admin không nhìn thấy session của SuperAdmin
**Bước**
1. đồng thời đăng nhập `superadmin` và `admin`
2. vào màn admin sessions bằng `admin`

**Kỳ vọng**
- admin không thấy session của superadmin

### T10. SuperAdmin vẫn nhìn thấy đầy đủ session
**Bước**
1. vào màn sessions bằng `superadmin`

**Kỳ vọng**
- superadmin thấy đủ session còn hiệu lực

### T11. Admin không được sửa gián tiếp tài khoản SuperAdmin qua import users
**Bước**
1. tạo file import có dòng trùng username của `superadmin`
2. đăng nhập bằng `admin`
3. chạy preview import users
4. chạy commit import users

**Kỳ vọng**
- preview báo lỗi quyền
- commit không sửa được tài khoản superadmin

### T12. SuperAdmin được import/cập nhật tài khoản cấp cao
**Bước**
1. dùng `superadmin`
2. import file có dòng role cao hợp lệ

**Kỳ vọng**
- xử lý theo đúng quyền superadmin

---

## 3. Admin import / export / backup

### T13. Export users Excel bằng Admin
**Bước**
1. đăng nhập `admin`
2. export danh sách nhân viên Excel

**Kỳ vọng**
- export thành công
- không có dòng `SUPER_ADMIN` trong file export của admin

### T14. Export users Excel bằng SuperAdmin
**Bước**
1. đăng nhập `superadmin`
2. export danh sách nhân viên Excel

**Kỳ vọng**
- export thành công
- có thể thấy đầy đủ user theo quyền superadmin

### T15. Export attendance Excel
**Bước**
1. đăng nhập `admin`
2. export attendance theo tháng

**Kỳ vọng**
- file tải về thành công
- số liệu tổng hợp khớp dữ liệu trên màn admin attendance

### T16. Backup DB
**Bước**
1. đăng nhập bằng tài khoản được phép
2. tạo backup DB
3. mở danh sách backup

**Kỳ vọng**
- backup được tạo
- xuất hiện trong danh sách
- số lượng file backup không vượt giới hạn giữ lại sau nhiều lần test

### T17. Import users preview
**Bước**
1. chuẩn bị file import hợp lệ gồm: user mới, user cập nhật, ca làm hợp lệ
2. chạy preview

**Kỳ vọng**
- preview phân loại đúng tạo mới/cập nhật
- các lỗi hiển thị rõ nếu có

### T18. Import users commit
**Bước**
1. commit file import hợp lệ
2. kiểm tra user mới / user cập nhật / shift assignment

**Kỳ vọng**
- dữ liệu được tạo/cập nhật đúng
- không bị partial state trong case file hợp lệ

### T19. Import users với shift không tồn tại
**Bước**
1. file có tên ca không tồn tại
2. preview và commit

**Kỳ vọng**
- preview báo lỗi đúng dòng
- commit không tạo sai dữ liệu

### T20. Attendance import file hợp lệ
**Bước**
1. chuẩn bị file attendance có username, ngày, giờ vào, giờ ra
2. import bằng admin
3. kiểm tra màn admin attendance

**Kỳ vọng**
- import thành công
- status / workedMinutes / warnings được tính theo recalculate logic hiện tại, không chỉ set cứng

### T21. Attendance import với tháng đã khóa
**Bước**
1. khóa tháng test
2. import attendance vào tháng đó

**Kỳ vọng**
- các dòng thuộc tháng khóa bị bỏ qua hoặc báo lỗi đúng
- không ghi đè dữ liệu tháng khóa

---

## 4. Attendance lifecycle — ca thường

### T22. Check-in bình thường
**Bước**
1. đăng nhập employee ca thường
2. check-in trong giờ chuẩn

**Kỳ vọng**
- check-in thành công
- status hợp lý (`PRESENT` hoặc `LATE` theo giờ thực)

### T23. Check-in muộn
**Bước**
1. chỉnh thời gian test hoặc dữ liệu để check-in muộn hơn grace
2. check-in

**Kỳ vọng**
- status là `LATE`
- warning có `LATE` nếu applicable

### T24. Start / end break bình thường
**Bước**
1. employee đã check-in
2. bắt đầu nghỉ
3. kết thúc nghỉ

**Kỳ vọng**
- break mở/đóng đúng
- không sinh lỗi khi chưa có trạng thái bất thường

### T25. Không cho mở nhiều break cùng lúc
**Bước**
1. employee đã start break
2. thử start break lần nữa

**Kỳ vọng**
- bị chặn
- message rõ ràng

### T26. Check-out bình thường
**Bước**
1. employee đã check-in
2. không có break mở
3. check-out

**Kỳ vọng**
- check-out thành công
- workedMinutes hợp lý
- status cuối được recalculate đúng

### T27. Không cho check-out khi đang mở break
**Bước**
1. employee start break
2. thử check-out luôn

**Kỳ vọng**
- bị chặn
- message rõ ràng

### T28. Off-day flow
**Bước**
1. chọn ngày off
2. submit báo nghỉ

**Kỳ vọng**
- bản ghi chuyển thành `OFF`
- quota nghỉ được áp dụng đúng

### T29. Không cho báo off khi đã có check-in/check-out
**Bước**
1. check-in trước
2. thử báo off cùng ngày

**Kỳ vọng**
- bị chặn

---

## 5. Ca treo / unresolved previous shift

### T30. Nhân viên còn ca hôm trước chưa xuống thì bị popup + chặn
**Bước**
1. tạo bản ghi ngày hôm trước có `checkInAt` nhưng `checkOutAt = null`
2. đăng nhập nhân viên hôm sau
3. mở màn employee today

**Kỳ vọng**
- hiện popup cảnh báo
- employee không thể tiếp tục check-in ca mới

### T31. Nhân viên bị chặn ở các thao tác attendance chính
**Bước**
1. giữ ca hôm trước đang treo
2. thử:
   - check-in
   - start break
   - check-out
   - end break

**Kỳ vọng**
- đều bị chặn với message rõ

### T32. Admin nhìn thấy danh sách ca treo
**Bước**
1. tạo 1–2 ca treo của ngày trước
2. vào màn `admin/attendance`

**Kỳ vọng**
- block “Ca treo cần xử lý” hiển thị đúng
- chỉ liệt kê ca treo từ ngày làm việc trước, không phải ca đang mở hợp lệ trong ngày hiện tại

### T33. Admin xử lý ca treo bằng cách nhập giờ xuống ca
**Bước**
1. trong block ca treo, bấm “Xử lý ca treo”
2. nhập `checkOutAt`
3. bấm Lưu

**Kỳ vọng**
- lưu thành công
- bản ghi không còn là ca treo
- nhân viên có thể thao tác lại bình thường

### T34. Admin nhập giờ xuống ca không hợp lệ
**Bước**
1. chọn ca treo
2. nhập `checkOutAt <= checkInAt`
3. lưu

**Kỳ vọng**
- bị chặn
- message lỗi hợp lý

---

## 6. Attendance admin editing

### T35. Admin sửa giờ vào/ra và hệ thống recalculate
**Bước**
1. mở 1 bản ghi attendance thường
2. chỉnh `checkInAt` hoặc `checkOutAt`
3. lưu

**Kỳ vọng**
- update thành công
- status / warnings / workedMinutes được recalculate

### T36. Attendance PATCH không còn cho sửa trực tiếp status/warnings
**Bước**
1. gửi request thủ công tới endpoint PATCH attendance với `status` hoặc `warningFlagsJson`

**Kỳ vọng**
- payload không còn được hỗ trợ theo contract hiện tại
- trạng thái cuối vẫn do recalculate quyết định

### T37. Không sửa attendance trong tháng đã khóa
**Bước**
1. khóa tháng chứa bản ghi
2. thử sửa attendance qua admin

**Kỳ vọng**
- bị chặn với lỗi rõ ràng

---

## 7. Overnight shift edge cases

### T38. Check-in ca qua đêm
**Bước**
1. gán shift `22:00 -> 06:00`
2. employee check-in khoảng 22:xx

**Kỳ vọng**
- attendance gắn đúng workDate đầu ca

### T39. Check-out sáng hôm sau cho ca qua đêm
**Bước**
1. employee ca đêm check-in tối hôm trước
2. check-out sáng hôm sau

**Kỳ vọng**
- cùng attendance record được hoàn tất đúng
- workedMinutes hợp lý
- không tạo record sai ngày

### T40. Break trong ca qua đêm
**Bước**
1. start break trong đêm
2. end break trước/sau nửa đêm

**Kỳ vọng**
- break gắn đúng attendanceDay
- recalculate không lệch ca

### T41. Không được coi ca đêm đang diễn ra là “ca treo” sai
**Bước**
1. employee đang trong ca đêm hợp lệ chưa checkout
2. mở app trước giờ kết thúc ca

**Kỳ vọng**
- không bị popup “ca trước chưa xuống” sai
- vẫn thao tác tiếp trong cùng ca được

### T42. Ca đêm hôm trước thật sự treo thì bị chặn hôm sau
**Bước**
1. để ca qua đêm hết giờ nhưng vẫn không checkout
2. sang ngày/ca mới mở app

**Kỳ vọng**
- bị nhận diện là ca treo
- popup xuất hiện
- cần admin xử lý

---

## 8. Shift assignment / scheduling

### T43. Tạo assignment không overlap
**Bước**
1. tạo 1 assignment hợp lệ cho user
2. tạo assignment thứ 2 không chồng thời gian

**Kỳ vọng**
- đều tạo được

### T44. Tạo assignment overlap
**Bước**
1. tạo assignment thứ 2 chồng thời gian assignment cũ

**Kỳ vọng**
- bị chặn với `409`
- message báo chồng chéo

---

## 9. Regression checks sau thay đổi gần đây

### T45. Security regression quick pass
**Bước**
- re-check T3–T12 sau mọi thay đổi lớn

**Kỳ vọng**
- không bị hở lại quyền admin

### T46. Employee flow regression quick pass
**Bước**
- chạy lại T22–T29 sau mọi thay đổi attendance

**Kỳ vọng**
- check-in/check-out/break/off-day vẫn ổn

### T47. Stuck shift regression quick pass
**Bước**
- chạy lại T30–T34 sau mọi thay đổi ở `lib/attendance.ts`

**Kỳ vọng**
- không quay lại cơ chế auto-close
- popup + admin resolution vẫn hoạt động

### T48. Build regression
**Bước**
1. `npm run lint`
2. `npm run build`

**Kỳ vọng**
- vẫn pass

---

## 10. Gợi ý cách ghi kết quả test

Mỗi test case nên ghi:
- **Result:** Pass / Fail / Blocked
- **Tester:** tên người test
- **Date:** ngày test
- **Notes:** lỗi gặp phải / ảnh chụp / request mẫu nếu cần

Mẫu:

```md
### T30. Nhân viên còn ca hôm trước chưa xuống thì bị popup + chặn
- Result: Pass
- Tester: ...
- Date: ...
- Notes: popup xuất hiện đúng, check-in trả 409 như mong đợi
```

---

## 11. Ưu tiên chạy nếu thời gian ít

Nếu không đủ thời gian chạy full suite, ưu tiên:
1. T3–T12 (RBAC/security)
2. T22–T29 (attendance lifecycle cơ bản)
3. T30–T34 (stuck shift flow)
4. T38–T42 (overnight edge cases)
5. T48 (lint/build)
