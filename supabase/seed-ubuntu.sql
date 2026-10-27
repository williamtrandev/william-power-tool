-- 10 lệnh điều tra Ubuntu cho Kho lệnh.
-- Dán vào Supabase → SQL Editor rồi Run. Đổi email ở dòng bên dưới thành email admin của bạn:
-- lệnh sẽ đứng tên tài khoản đó (bạn sửa / xoá được trên web).

select set_config('request.jwt.claims',
  (select json_build_object('sub', user_id, 'email', email)::text
     from public.app_members where email = lower('williamtrandev@gmail.com')),
  false);

insert into public.commands (title, kind, category, tags, description, body)
select v.* from (values
  ('Liệt kê service đang chạy', 'shell', 'Ubuntu', ARRAY['service', 'systemd']::text[], 'Tất cả service systemd đang chạy trên máy.',
   $cmd$systemctl list-units --type=service --state=running --no-pager$cmd$),
  ('Tìm service theo tên', 'shell', 'Ubuntu', ARRAY['service', 'grep']::text[], 'Tìm cả service đang dừng. Có thể nhập nhiều từ, cách nhau bằng |',
   $cmd$systemctl list-units --type=service --all --no-pager | grep -iE "{{keyword:nginx|php|redis}}"$cmd$),
  ('Trạng thái chi tiết một service', 'shell', 'Ubuntu', ARRAY['service', 'systemd']::text[], 'Xem đang chạy hay chết, PID, mấy dòng log cuối.',
   $cmd$sudo systemctl status {{service}} --no-pager -l$cmd$),
  ('Log của service trong khoảng thời gian gần đây', 'shell', 'Ubuntu', ARRAY['service', 'log', 'journalctl']::text[], '',
   $cmd$sudo journalctl -u {{service}} --since "{{since:1 hour ago}}" --no-pager | tail -n {{lines:200}}$cmd$),
  ('Tìm chuỗi trong toàn bộ thư mục (grep -RInE)', 'shell', 'Ubuntu', ARRAY['grep', 'log', 'tìm kiếm']::text[], '-R đệ quy, -I bỏ qua file nhị phân, -n hiện số dòng, -E dùng regex (vd: error|timeout). Kết quả dạng file:dòng:nội dung.',
   $cmd$sudo grep -RInE "{{pattern:error|exception|fatal}}" {{dir:/var/log}} 2>/dev/null | tail -n {{lines:200}}$cmd$),
  ('Theo dõi file log realtime, lọc theo từ khoá', 'shell', 'Ubuntu', ARRAY['log', 'realtime', 'grep']::text[], 'Ctrl+C để dừng.',
   $cmd$sudo tail -f {{file:/var/log/syslog}} | grep --line-buffered -iE "{{pattern:error|fail}}"$cmd$),
  ('Tìm process theo tên', 'shell', 'Ubuntu', ARRAY['process', 'grep']::text[], '',
   $cmd$ps aux | grep -iE "{{keyword}}" | grep -v grep$cmd$),
  ('Port nào đang mở, process nào giữ', 'shell', 'Ubuntu', ARRAY['network', 'port']::text[], 'Bỏ phần | grep để xem tất cả port đang lắng nghe.',
   $cmd$sudo ss -tulpn | grep -E ":{{port:80}}\s"$cmd$),
  ('Dung lượng ổ đĩa và thư mục nặng nhất', 'shell', 'Ubuntu', ARRAY['disk']::text[], 'Dùng khi báo đầy ổ (No space left on device).',
   $cmd$df -h && sudo du -xh {{dir:/var}} --max-depth=1 2>/dev/null | sort -rh | head -n 15$cmd$),
  ('RAM, tải hệ thống và process tốn CPU nhất', 'shell', 'Ubuntu', ARRAY['cpu', 'ram']::text[], '',
   $cmd$free -h && uptime && ps aux --sort=-%cpu | head -n 10$cmd$)
) as v(title, kind, category, tags, description, body)
where not exists (select 1 from public.commands c where c.title = v.title);

select set_config('request.jwt.claims', '', false);

select title, created_by from public.commands where category = 'Ubuntu' order by created_at;
