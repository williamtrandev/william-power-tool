/** Turn Supabase / PostgREST errors into something a support agent can act on. */
export function friendly(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message ?? 'Lỗi không xác định';
  if (/signups? not allowed|signup is disabled/i.test(m)) return new Error('Supabase đang tắt đăng ký người dùng mới — admin cần bật “Allow new users to sign up”');
  if (/provider is not enabled|unsupported provider/i.test(m)) return new Error('Đăng nhập Google chưa được bật — admin cần cấu hình Google trong Supabase');
  if (/invalid base32 secret/i.test(m)) return new Error('Secret OTP không hợp lệ');
  if (/no password stored/i.test(m)) return new Error('Tài khoản này chưa lưu mật khẩu');
  if (/only the owner can make an account private/i.test(m)) return new Error('Chỉ người tạo mới đặt tài khoản thành riêng tư được');
  if (/no otp stored/i.test(m)) return new Error('Tài khoản này chưa có OTP');
  if (/acct_|team_account/i.test(m) && /not find|does not exist/i.test(m)) return new Error('Database chưa có phần Tài khoản — admin cần chạy lại supabase/setup.sql');
  if (/ot_entries_person_day_key/i.test(m)) return new Error('Người này đã có OT ngày đó — mở ô đó để sửa');
  if (/ot_people_email_key/i.test(m)) return new Error('Email này đã gắn với một người khác trong danh sách OT');
  if (/ot_entries_person_id_fkey/i.test(m)) return new Error('Người này còn giờ OT đã ghi — tắt “Đang làm” để ẩn thay vì xoá');
  if (/ot_entries|ot_days|ot_people/i.test(m) && /not find|does not exist/i.test(m)) return new Error('Database chưa có phần OT — admin cần chạy lại supabase/setup.sql');
  if (/rate limit/i.test(m)) return new Error('Thao tác quá nhiều lần, thử lại sau ít phút');
  if (/is_private|could not find the .* column/i.test(m)) return new Error('Database chưa cập nhật — admin cần chạy lại supabase/setup.sql');
  if (/only the owner can make a command private/i.test(m)) return new Error('Chỉ người tạo mới đặt lệnh thành riêng tư được');
  if (/relation .* does not exist|could not find the (table|function)|schema cache/i.test(m)) return new Error('Database chưa được cài — admin cần chạy supabase/setup.sql');
  if (/row-level security|permission denied|not allowed/i.test(m) || e?.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này');
  if (/cannot change your own account/i.test(m)) return new Error('Không thể tự đổi quyền của chính mình');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error('Không kết nối được máy chủ — kiểm tra mạng');
  return new Error(m);
}
