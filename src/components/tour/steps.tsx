import type { TourStep } from './Tour';

const has = (t: string) => !!document.querySelector(`[data-tour="${t}"]`);

/** Ask the Log tool to open the demo logs and wait until the toolbar is on screen. */
function loadSample(): Promise<void> {
  dispatchEvent(new Event('wpt:load-sample'));
  return new Promise((resolve) => {
    const t0 = Date.now();
    const i = setInterval(() => {
      if ((has('search') && has('log-table')) || Date.now() - t0 > 10000) {
        clearInterval(i);
        setTimeout(resolve, 300);
      }
    }, 100);
  });
}

export const LOG_STEPS: TourStep[] = [
  {
    title: 'Chào mừng đến William Tool 👋',
    body: (
      <>
        Công cụ đọc log ngay trên trình duyệt: tìm nhanh, lọc dòng lỗi, ghép request theo trace id giữa nhiều hệ thống. File chỉ được đọc trên máy bạn, không
        gửi đi đâu.
        <br />
        <br />
        Hướng dẫn này chỉ bạn từng chỗ cần bấm — mất khoảng 1 phút. Dùng <kbd>←</kbd> <kbd>→</kbd> để chuyển bước, <kbd>Esc</kbd> để thoát.
      </>
    ),
  },
  {
    target: 'tool-tabs',
    title: 'Các công cụ',
    body: (
      <>
        <b>Log</b> để đọc và tìm log. <b>Giải mã Watane</b> để giải mã / mã hoá code bằng secret key. <b>Kho lệnh</b> lưu lệnh server / SQL dùng chung của team. <b>Tài khoản</b> gom link, mật khẩu và mã OTP của tài khoản dùng chung. Mỗi tab có hướng dẫn riêng.
      </>
    ),
  },
  {
    target: 'dropzone',
    title: 'Mở file log',
    body: (
      <>
        Kéo thả file vào đây (hoặc bấm để chọn). Mở được nhiều file của nhiều hệ thống cùng lúc: Laravel, .NET, Serilog, JSON lines, CSV…
        <br />
        File được nhớ lại — tải lại trang không mất.
      </>
    ),
  },
  {
    target: 'folder-connect',
    title: 'Theo dõi một thư mục',
    body: <>Chọn thư mục log trên máy (Chrome/Edge): file mới được copy vào sẽ tự mở, file đang ghi thêm sẽ tự cập nhật.</>,
  },
  {
    title: 'Xem thử với log mẫu',
    show: () => !has('search'),
    body: <>Chưa có file trong tay? Mở bộ log mẫu (gateway + core, có lỗi timeout, sai chữ ký, stacktrace) để xem hướng dẫn với dữ liệu thật.</>,
    action: { label: 'Mở log mẫu', run: loadSample },
  },
  {
    target: 'file-bar',
    title: 'Các file đang mở',
    body: (
      <>
        Mỗi file một màu. Bấm biểu tượng 👁 để ẩn / hiện file khỏi kết quả, <b>×</b> để bỏ file. Rê chuột vào tên file để xem định dạng nhận được.
      </>
    ),
  },
  {
    target: 'search',
    title: 'Tìm kiếm',
    placement: 'bottom',
    body: (
      <>
        Gõ từ khoá, kết quả lọc ngay. Phím tắt <kbd>/</kbd> để nhảy vào ô tìm.
        <ul>
          <li>
            <code>export timeout</code> — có cả hai từ
          </li>
          <li>
            <code>timeout|refused</code> — một trong các từ
          </li>
          <li>
            <code>"timed out"</code> — đúng cụm, <code>-healthcheck</code> — loại trừ
          </li>
          <li>
            <code>level:error</code> · <code>trace:3e4fb6b3</code> · <code>file:gw</code>
          </li>
        </ul>
      </>
    ),
  },
  {
    target: 'regex',
    title: 'Tìm bằng regex',
    body: (
      <>
        Bật nút <code>.*</code> để mỗi từ khoá là một biểu thức chính quy, ví dụ <code>HTTP [45]\d\d</code> bắt mọi lỗi 4xx/5xx.
      </>
    ),
  },
  {
    target: 'syntax-help',
    title: 'Quên cú pháp?',
    body: <>Bấm dấu <b>?</b> để xem bảng cú pháp và ví dụ — bấm vào ví dụ là điền sẵn vào ô tìm.</>,
  },
  {
    target: 'journey',
    title: 'Tra cứu hành trình',
    body: (
      <>
        Dán SĐT, email, mã merchant, mã đơn… để xem khách đó đã làm gì: từng request theo thời gian, xuyên gateway / core, bước nào lỗi và lỗi gì. Có nút copy tóm
        tắt để trả lời khách hoặc dán vào ticket. Phím tắt <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>.
      </>
    ),
  },
  {
    target: 'suspicious',
    title: 'Chỉ xem dòng khả nghi',
    body: <>Bật để ẩn log bình thường, chỉ giữ dòng có dấu hiệu lỗi: level ERROR/WARN, exception, timeout, success:false, HTTP 4xx/5xx…</>,
  },
  {
    target: 'sort',
    title: 'Thứ tự',
    body: (
      <>
        Mặc định <b>Mới → cũ</b>: log mới nhất ở trên cùng. Chọn <b>Khả nghi nhất</b> để đưa lỗi nặng lên đầu.
      </>
    ),
  },
  {
    target: 'display',
    title: 'Điều chỉnh hiển thị',
    body: <>Ẩn / hiện cột (thời gian, level, nguồn, trace), ẩn panel nhóm lỗi hay biểu đồ, và đổi cỡ chữ cho dễ đọc.</>,
  },
  {
    target: 'export',
    title: 'Tải kết quả',
    body: <>Lưu các dòng đang hiển thị (sau khi tìm / lọc) thành một file .log để gửi cho người khác.</>,
  },
  {
    target: 'filters',
    title: 'Lọc theo level',
    body: <>Bấm ERROR / WARN / INFO để lọc nhanh. Bên phải là số dòng đang hiện và số dòng khả nghi.</>,
  },
  {
    target: 'histogram',
    title: 'Biểu đồ theo thời gian',
    body: (
      <>
        Mỗi cột là một khoảng thời gian, phần đỏ là dòng khả nghi. <b>Bấm vào một cột</b> để chỉ xem khoảng thời gian đó (bấm nhiều lần để zoom sâu hơn).
      </>
    ),
  },
  {
    target: 'groups',
    title: 'Nhóm lỗi',
    placement: 'right',
    body: <>Các lỗi giống nhau được gom lại, kèm số lần xuất hiện và khoảng thời gian. Bấm một nhóm để xem tất cả dòng của nhóm đó.</>,
  },
  {
    target: 'log-table',
    title: 'Danh sách log',
    placement: 'right',
    body: (
      <>
        Bấm một dòng để xem chi tiết. Dùng <kbd>j</kbd> <kbd>k</kbd> hoặc <kbd>↑</kbd> <kbd>↓</kbd> để chuyển dòng, <kbd>Home</kbd> <kbd>End</kbd> để lên đầu / xuống cuối.
        Vạch màu bên trái: đỏ là lỗi, vàng là cảnh báo.
      </>
    ),
  },
  {
    target: 'scroll-rail',
    title: 'Thanh cuộn bản đồ',
    placement: 'left',
    body: (
      <>
        Vạch <span className="font-semibold text-error">đỏ</span> / <span className="font-semibold text-warn">vàng</span> cho biết lỗi nằm ở đâu trong cả danh sách.{' '}
        <b>Bấm vào đâu nhảy tới đó</b>, kéo để cuộn nhanh, rê chuột để xem thời gian tại vị trí đó.
      </>
    ),
  },
  {
    target: 'detail-tabs',
    title: 'Chi tiết một dòng',
    placement: 'left',
    body: (
      <>
        <b>Chi tiết</b>: nội dung đầy đủ và lý do bị coi là khả nghi. <b>Ngữ cảnh</b>: các dòng ngay trước / sau trong cùng file. <b>Trace</b>: toàn bộ một request
        xuyên nhiều file. Nút ⤢ để phóng to toàn màn hình.
      </>
    ),
  },
  {
    target: 'view-modes',
    title: 'Cách xem nội dung',
    placement: 'left',
    body: (
      <>
        <b>Văn bản</b> (đã giải mã tiếng Việt), <b>JSON</b> dạng cây, hoặc <b>Raw</b>. <b>Gọn stack</b> ẩn các dòng framework trong stacktrace, <b>Thu gọn</b> rút ngắn chuỗi
        quá dài.
      </>
    ),
  },
  {
    target: 'panel-resize',
    title: 'Đổi độ rộng panel',
    placement: 'left',
    body: <>Kéo mép này để panel chi tiết rộng / hẹp hơn, nhấp đúp để về mặc định.</>,
  },
  {
    target: 'folder',
    title: 'Thư mục & thêm file',
    body: <>Kết nối thư mục để tự theo dõi log mới, hoặc thêm file bất cứ lúc nào. “Xoá tất cả” bỏ mọi file khỏi trang và bộ nhớ trình duyệt.</>,
  },
  {
    target: 'help',
    title: 'Xem lại hướng dẫn',
    body: <>Bấm nút này bất cứ khi nào cần xem lại. Chúc bạn tìm lỗi nhanh! 🚀</>,
  },
];

export const WATANE_STEPS: TourStep[] = [
  {
    title: 'Giải mã Watane',
    body: <>Giải mã / mã hoá code Watane bằng AES-ECB với secret key — giống script Python, chạy ngay trên trình duyệt, không gửi key hay dữ liệu đi đâu.</>,
  },
  {
    target: 'w-keys',
    title: 'Quản lý secret key',
    body: (
      <>
        Lưu nhiều key, mỗi key một label (ví dụ <code>Watane Prod</code>, <code>Watane UAT</code>). Bấm 👁 để xem key, ✎ để sửa, 🗑 để xoá. Key 16 / 24 / 32 ký tự tương
        ứng AES-128 / 192 / 256.
      </>
    ),
  },
  {
    target: 'w-add-key',
    title: 'Thêm key',
    body: <>Nhập label và secret key rồi bấm Thêm. Key được lưu trong trình duyệt này — chỉ nên lưu trên máy cá nhân.</>,
  },
  {
    target: 'w-source',
    title: 'Dán mã hay mở file',
    body: (
      <>
        <b>Dán mã</b>: dán một hoặc nhiều mã, mỗi dòng một mã, kết quả hiện ngay. <b>File CSV / Excel</b>: chọn file, chọn sheet và cột cần giải mã, rồi tải về file
        có thêm cột kết quả.
      </>
    ),
  },
  {
    target: 'w-direction',
    title: 'Giải mã hay mã hoá',
    body: <>Chọn chiều xử lý. Mã hoá hữu ích khi cần tạo mã để test.</>,
  },
  {
    target: 'w-key-select',
    title: 'Chọn key để dùng',
    placement: 'left',
    body: <>Đổi nhanh key đang dùng — kết quả được tính lại ngay. Viền đỏ nghĩa là chưa có key hợp lệ.</>,
  },
  {
    target: 'w-paste',
    title: 'Dán mã vào đây',
    placement: 'top',
    body: <>Mỗi dòng một mã. Bên phải là kết quả; dòng lỗi ghi rõ lý do (sai key, sai Base64…). Bấm biểu tượng copy để lấy kết quả.</>,
  },
  {
    target: 'w-file',
    title: 'Giải mã cả file',
    placement: 'top',
    body: <>Chọn sheet, dòng header và cột cần xử lý, đặt tên cột kết quả rồi bấm “Tải … kết quả”.</>,
  },
  {
    target: 'help',
    title: 'Xem lại hướng dẫn',
    body: <>Bấm nút này bất cứ khi nào cần xem lại.</>,
  },
];

export const COMMAND_STEPS: TourStep[] = [
  {
    title: 'Kho lệnh dùng chung',
    body: (
      <>
        Nơi team lưu <b>lệnh server</b> (tail, grep, systemctl…), <b>câu SQL</b> và <b>ghi chú</b> (link, tài khoản test, thông tin môi trường). Mọi thành viên thấy cùng một
        danh sách và đều thêm được; mỗi người chỉ sửa / xoá được mục do mình tạo.
      </>
    ),
  },
  {
    target: 'c-search',
    title: 'Tìm nhanh',
    body: (
      <>
        Gõ vài chữ trong tên, nội dung hoặc <code>#tag</code> — không cần gõ dấu. Nhấn <kbd>/</kbd> ở bất kỳ đâu để nhảy vào ô tìm.
      </>
    ),
  },
  {
    target: 'c-kind',
    title: 'Lọc theo loại và nhóm',
    body: <>Chọn Server, SQL hoặc Ghi chú. Hàng bên dưới lọc theo nhóm; “Của tôi” chỉ hiện mục bạn tạo, “Riêng tư” chỉ hiện mục chỉ mình bạn thấy.</>,
  },
  {
    target: 'c-list',
    title: 'Chọn một mục',
    placement: 'right',
    body: (
      <>
        Bấm vào một dòng để xem chi tiết bên phải. Dùng <kbd>↑</kbd> <kbd>↓</kbd> để chuyển nhanh, <kbd>Enter</kbd> để copy — kể cả khi đang gõ trong ô tìm. Rê chuột vào dòng
        để copy luôn mà không cần mở. Dấu ⚠ là lệnh thay đổi dữ liệu / hệ thống. Nhiều mục cùng tên được gộp thành một dòng “N bản” — chọn bản ở khung bên phải hoặc bằng <kbd>←</kbd> <kbd>→</kbd>.
      </>
    ),
  },
  {
    title: 'Lệnh có ô để điền?',
    body: (
      <>
        Một số lệnh có phần viết dạng <code>{'{{tên}}'}</code> — ví dụ <code>{'{{service}}'}</code> hay <code>{'{{dir:/var/log}}'}</code>. Đó là <b>biến</b>: khi mở lệnh sẽ có ô
        để điền ngay phía trên, lệnh tự cập nhật trước khi copy. Phần sau dấu <code>:</code> là giá trị mặc định, để trống cũng chạy được.
        <br />
        <br />
        Lệnh không có biến thì không có ô nào — chỉ cần bấm Copy.
      </>
    ),
  },
  {
    title: 'Ghi chú',
    body: (
      <>
        Mỗi dòng dạng <code>Tên: giá trị</code> hiện thành một hàng có nút copy riêng; link bấm mở được; dòng có chữ <i>mật khẩu / password / token</i> được che, bấm 👁 để
        xem. Chỉ lưu tài khoản test / UAT.
      </>
    ),
  },
  {
    target: 'c-add',
    title: 'Thêm lệnh hoặc ghi chú',
    placement: 'left',
    body: (
      <>
        Bấm <b>Thêm mới</b>, chọn loại Server / SQL / Ghi chú, và chọn <b>Cả team</b> hay <b>Chỉ mình tôi</b> (riêng tư — người khác, kể cả admin, không thấy). Muốn sửa lệnh của người khác cho hợp với mình? Bấm <b>Nhân bản</b> trên lệnh đó để có bản sao của riêng bạn. Nút <b>Nhập / Xuất</b> bên cạnh để tải toàn bộ kho về file JSON (sao lưu) hoặc nhập hàng loạt từ file.
      </>
    ),
  },
  {
    target: 'help',
    title: 'Xem lại hướng dẫn',
    body: <>Bấm nút này bất cứ khi nào cần xem lại.</>,
  },
];

export const ACCOUNT_STEPS: TourStep[] = [
  {
    title: 'Tài khoản dùng chung',
    body: (
      <>
        Tài khoản gom theo <b>hệ thống</b> và <b>môi trường</b> (SBB, SBA, SBD, RL, Live…): link đăng nhập, tên đăng nhập, mật khẩu và mã OTP ở cùng một chỗ. Không phải xin ai quét QR
        hay gửi mật khẩu qua chat.
      </>
    ),
  },
  {
    target: 'a-search',
    title: 'Tìm nhanh',
    placement: 'right',
    body: (
      <>
        Bấm <b>/</b> rồi gõ tên hệ thống, tên đăng nhập hoặc chữ trong ghi chú — không cần gõ dấu. Nhiều từ thì thu hẹp dần, vd <code>sme live</code>, <code>sbb otp</code>. Mũi tên lên / xuống để
        chọn, Enter để mở.
      </>
    ),
  },
  {
    target: 'a-list',
    title: 'Dùng tài khoản',
    placement: 'top',
    show: () => !!document.querySelector('[data-tour="a-list"] [data-acc]'),
    body: (
      <>
        Mỗi môi trường có link riêng ở đầu khung; Live viền đỏ. <b>Mã OTP tự hiện và tự đổi</b> — bấm vào mã để copy. Mật khẩu bị che, bấm 👁 để xem hoặc copy. Mọi lần xem / copy
        đều được ghi vào nhật ký.
      </>
    ),
  },
  {
    target: 'a-drop',
    title: 'Thêm vào đúng hệ thống',
    placement: 'top',
    show: () => !!document.querySelector('[data-tour="a-drop"]'),
    body: (
      <>
        Đang mở hệ thống nào thì thêm vào hệ thống đó, môi trường đã điền sẵn. Có ảnh QR thì chỉ cần <b>Ctrl V</b> hoặc kéo thả vào trang; <b>Quét QR</b> để quét tab / cửa sổ
        đang hiện mã (cả QR “Chuyển tài khoản” của Google Authenticator).
      </>
    ),
  },
  {
    target: 'a-add',
    title: 'Thêm tài khoản',
    placement: 'left',
    body: (
      <>
        Hệ thống mới thì thêm ở đây. Chọn chia cho <b>Cả team</b>, <b>Người được chọn</b>, hay <b>Chỉ mình tôi</b>. Ai cũng thêm được; người tạo sửa / xoá được tài khoản của mình.
      </>
    ),
  },
  {
    target: 'help',
    title: 'Xem lại hướng dẫn',
    body: <>Bấm nút này bất cứ khi nào cần xem lại.</>,
  },
];
