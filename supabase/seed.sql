-- Bà Ngoại AI: dữ liệu khởi tạo. Chạy SAU schema.sql.
-- Kịch bản: các chiêu phổ biến ở VN (mô tả tự viết).
-- Lượt báo + IOC bên dưới đều là MÔ PHỎNG (is_simulated = true, real_count = 0):
--   STK dùng đầu 9999…, SĐT dùng đầu 0123… (đầu số không còn cấp), link dùng đuôi .example
--   → không trùng người thật. Muốn thêm mẫu thật thì lấy từ cảnh báo chính thống và ghi nguồn.

insert into scenarios (name, description) values
  ('Mạo danh công an', 'Xưng công an, báo nạn nhân dính đường dây rửa tiền/ma túy, bắt chuyển tiền vào "tài khoản tạm giữ" để xác minh và cấm kể với người nhà.'),
  ('Việc nhẹ lương cao', 'Tuyển cộng tác viên làm nhiệm vụ online (thả tim, đánh giá, đặt đơn ảo), trả hoa hồng nhỏ lúc đầu rồi bắt nạp tiền lớn để được rút.'),
  ('Đầu tư siêu lợi nhuận', 'Kéo vào nhóm "chuyên gia" hô kèo tiền ảo, vàng, chứng khoán trên sàn giả; cho rút lãi ít để tạo niềm tin rồi khóa tài khoản.'),
  ('Giả mạo ngân hàng', 'Nhắn tin hoặc gọi báo khóa tài khoản, nâng hạng thẻ, cập nhật sinh trắc học; dụ bấm link giả để lấy OTP và mật khẩu.'),
  ('Người thân gặp nạn', 'Mượn tài khoản hoặc giả giọng người thân, báo tai nạn, cấp cứu, bị bắt; hối thúc chuyển tiền gấp và dặn đừng gọi lại.'),
  ('Cài app giả dịch vụ công', 'Giả cán bộ hướng dẫn cập nhật định danh điện tử, thuế, bảo hiểm qua app hoặc link lạ để chiếm quyền điều khiển điện thoại.'),
  ('Giả điện lực báo cắt điện', 'Báo nợ tiền điện, sắp cắt điện trong ngày, yêu cầu chuyển khoản hoặc cài app để "thanh toán".'),
  ('Đơn hàng và shipper ảo', 'Giả shipper đòi phí giao hàng cho đơn không đặt, hoặc gửi link "xác nhận giao hàng" để lấy thông tin thẻ.'),
  ('Vay online thu phí trước', 'Quảng cáo vay nhanh không thẩm định, giải ngân trong ngày nhưng bắt đóng phí bảo hiểm, xác minh hoặc "mở khóa khoản vay" trước.'),
  ('Hỗ trợ lấy lại tiền bị lừa', 'Giả luật sư, công an hoặc "hacker mũ trắng" nhận thu hồi tiền đã bị lừa, đòi phí dịch vụ trước.'),
  ('Trúng thưởng tri ân', 'Báo trúng quà hoặc tri ân khách hàng, yêu cầu đóng phí vận chuyển, thuế để nhận thưởng.'),
  ('Hack tài khoản người quen', 'Chiếm Facebook/Zalo của người quen rồi nhắn mượn tiền, có khi gọi video vài giây bằng deepfake để tạo tin tưởng.')
on conflict (name) do nothing;

insert into reports (source, verdict, risk, scenario_id, impersonated_entity, tactics, key_phrases, summary, is_simulated, created_at)
select 'seed', v.verdict, v.risk, s.id, v.imp, v.tactics, v.phrases, v.summary, true, now() - make_interval(days => v.days, hours => v.hours)
from (values
  ('Mạo danh công an', 'lua_dao', 95, 'Công an', array['mao_danh_uy_quyen','so_hai','khan_cap','co_lap'], array['Yêu cầu chuyển toàn bộ số dư vào tài khoản tạm giữ để xác minh'], 'Xưng công an đòi chuyển tiền vào tài khoản tạm giữ.', 40, 2),
  ('Mạo danh công an', 'lua_dao', 96, 'Công an', array['mao_danh_uy_quyen','so_hai','co_lap'], array['Tuyệt đối không được nói với người nhà, nếu không sẽ bị khởi tố'], 'Đe dọa khởi tố, cấm kể với người thân.', 21, 5),
  ('Mạo danh công an', 'lua_dao', 92, 'Công an', array['mao_danh_uy_quyen','khan_cap'], array['Ông/bà có liên quan đến đường dây rửa tiền'], 'Gọi báo liên quan đường dây rửa tiền.', 3, 9),
  ('Mạo danh công an', 'lua_dao', 94, 'Công an', array['mao_danh_uy_quyen','so_hai'], array['Cài ứng dụng này để làm việc trực tuyến với cơ quan điều tra'], 'Bắt cài app để "làm việc trực tuyến".', 1, 4),
  ('Việc nhẹ lương cao', 'lua_dao', 90, 'Nhà tuyển dụng', array['long_tham','tao_niem_tin'], array['Mỗi nhiệm vụ 50k, ngày kiếm 500k–1tr'], 'Tuyển CTV thả tim video nhận hoa hồng.', 33, 1),
  ('Việc nhẹ lương cao', 'lua_dao', 93, 'Nhà tuyển dụng', array['long_tham','khan_cap'], array['Hoàn thành combo 3 đơn mới được rút cả gốc lẫn lãi'], 'Bắt nạp thêm để rút tiền nhiệm vụ.', 12, 6),
  ('Việc nhẹ lương cao', 'nghi_ngo', 70, 'Nhà tuyển dụng', array['long_tham'], array['Không cần kinh nghiệm, làm tại nhà, nhận lương ngày'], 'Quảng cáo việc làm online mập mờ.', 2, 3),
  ('Đầu tư siêu lợi nhuận', 'lua_dao', 91, 'Chuyên gia tài chính', array['long_tham','tao_niem_tin'], array['Lợi nhuận cam kết 30%/tháng, rút bất cứ lúc nào'], 'Mời đầu tư vàng lãi khủng.', 28, 7),
  ('Đầu tư siêu lợi nhuận', 'lua_dao', 89, 'Chuyên gia tài chính', array['long_tham','khan_cap'], array['Kèo cuối hôm nay, anh chị vào lệnh ngay kẻo lỡ'], 'Hô kèo tiền ảo trong nhóm kín.', 6, 2),
  ('Giả mạo ngân hàng', 'lua_dao', 94, 'Ngân hàng', array['mao_danh_uy_quyen','khan_cap','so_hai'], array['Tài khoản sẽ bị tạm khóa do chưa cập nhật sinh trắc học'], 'Tin nhắn giả ngân hàng kèm link.', 25, 0),
  ('Giả mạo ngân hàng', 'lua_dao', 92, 'Ngân hàng', array['mao_danh_uy_quyen','long_tham'], array['Quý khách được nâng hạng thẻ miễn phí, vui lòng cung cấp mã OTP'], 'Gọi mời nâng hạng thẻ, xin OTP.', 9, 8),
  ('Giả mạo ngân hàng', 'lua_dao', 95, 'Ngân hàng', array['mao_danh_uy_quyen','khan_cap'], array['Truy cập đường link để cập nhật trước 17h hôm nay'], 'Link giả cập nhật thông tin.', 2, 11),
  ('Người thân gặp nạn', 'lua_dao', 90, 'Người thân', array['tinh_cam','khan_cap','co_lap'], array['Mẹ chuyển gấp tiền mổ giúp con, đừng gọi lại'], 'Giả con bị tai nạn cần tiền mổ.', 19, 3),
  ('Người thân gặp nạn', 'lua_dao', 88, 'Người thân', array['tinh_cam','khan_cap'], array['Con đổi số mới, đang kẹt chuyện gấp'], 'Giả cháu đổi số mượn tiền.', 4, 6),
  ('Cài app giả dịch vụ công', 'lua_dao', 93, 'Cán bộ phường', array['mao_danh_uy_quyen','khan_cap'], array['Cập nhật định danh mức 2 qua ứng dụng này để không bị khóa'], 'Dụ cài app giả để chiếm điện thoại.', 15, 1),
  ('Cài app giả dịch vụ công', 'lua_dao', 92, 'Cơ quan thuế', array['mao_danh_uy_quyen','so_hai'], array['Hồ sơ thuế của ông/bà chưa quyết toán, tải ứng dụng để kê khai'], 'Giả cơ quan thuế bắt cài app.', 5, 10),
  ('Giả điện lực báo cắt điện', 'lua_dao', 87, 'Điện lực', array['mao_danh_uy_quyen','khan_cap'], array['17h hôm nay sẽ cắt điện nếu chưa thanh toán'], 'Đe dọa cắt điện đòi chuyển tiền.', 11, 4),
  ('Đơn hàng và shipper ảo', 'lua_dao', 80, 'Shipper', array['khan_cap','tao_niem_tin'], array['Anh/chị chuyển trước phí ship 35k để em giao đơn'], 'Đòi phí ship cho đơn không đặt.', 14, 2),
  ('Đơn hàng và shipper ảo', 'nghi_ngo', 72, 'Sàn thương mại điện tử', array['khan_cap'], array['Đơn hàng giao thất bại, xác nhận lại địa chỉ tại link'], 'Link xác nhận giao hàng giả.', 4, 7),
  ('Vay online thu phí trước', 'lua_dao', 89, 'Công ty tài chính', array['long_tham','khan_cap'], array['Hồ sơ đã duyệt, đóng phí bảo hiểm khoản vay để giải ngân'], 'Bắt đóng phí trước khi giải ngân.', 18, 5),
  ('Hỗ trợ lấy lại tiền bị lừa', 'lua_dao', 90, 'Luật sư', array['mao_danh_uy_quyen','tinh_cam','long_tham'], array['Bên em đã truy được dòng tiền, chị đóng phí hồ sơ để thu hồi'], 'Giả luật sư thu hồi tiền bị lừa.', 9, 3),
  ('Trúng thưởng tri ân', 'lua_dao', 84, 'Thương hiệu', array['long_tham','khan_cap'], array['Chúc mừng quý khách trúng xe máy, vui lòng đóng thuế để nhận'], 'Báo trúng thưởng đòi đóng thuế.', 26, 6),
  ('Hack tài khoản người quen', 'lua_dao', 91, 'Bạn bè', array['tinh_cam','khan_cap','tao_niem_tin'], array['Cho mình mượn tạm 5 triệu, tối mình trả liền nha'], 'Acc Facebook người quen bị chiếm, nhắn mượn tiền.', 2, 3),
  ('Hack tài khoản người quen', 'lua_dao', 93, 'Bạn bè', array['tinh_cam','tao_niem_tin'], array['Mạng yếu quá, gọi video vài giây thôi rồi chuyển giúp mình'], 'Gọi video deepfake vài giây để lấy lòng tin.', 0, 20)
) as v(scenario, verdict, risk, imp, tactics, phrases, summary, days, hours)
join scenarios s on s.name = v.scenario;

insert into iocs (type, value_normalized, value_display, bank, scenario_id, report_count, real_count, first_seen, last_seen)
select v.type, v.norm, v.display, v.bank, s.id, v.cnt, 0, now() - make_interval(days => v.days), now() - make_interval(days => 1)
from (values
  ('bank_account', '99990012345678', '9999 0012 3456 78', 'Ngân hàng mô phỏng', 'Mạo danh công an', 7, 30),
  ('bank_account', '99990098765432', '9999 0098 7654 32', 'Ngân hàng mô phỏng', 'Người thân gặp nạn', 4, 15),
  ('bank_account', '99990055501234', '9999 0055 5012 34', 'Ngân hàng mô phỏng', 'Việc nhẹ lương cao', 5, 20),
  ('bank_account', '99990077788899', '9999 0077 7888 99', 'Ngân hàng mô phỏng', 'Vay online thu phí trước', 3, 12),
  ('phone', '0123456789', '0123 456 789', null, 'Việc nhẹ lương cao', 6, 25),
  ('phone', '0123000111', '0123 000 111', null, 'Mạo danh công an', 3, 8),
  ('phone', '0123999888', '0123 999 888', null, 'Hỗ trợ lấy lại tiền bị lừa', 2, 6),
  ('url', 'xacthuc-nganhang.example', 'https://xacthuc-nganhang.example', null, 'Giả mạo ngân hàng', 5, 18),
  ('url', 'dinhdanh-dientu.example/tai-app', 'http://dinhdanh-dientu.example/tai-app', null, 'Cài app giả dịch vụ công', 3, 10),
  ('url', 'giaohang-xacnhan.example', 'giaohang-xacnhan.example', null, 'Đơn hàng và shipper ảo', 2, 5)
) as v(type, norm, display, bank, scenario, cnt, days)
join scenarios s on s.name = v.scenario
on conflict (type, value_normalized) do nothing;
