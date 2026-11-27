'use client';

import { useEffect, useState } from 'react';

// Phần giới thiệu đầu trang: "BÀ NGOẠI AI" + ô màu tự lật giữa hai câu hỏi.
// Mặt cam: LÀM GÌ?  Mặt tím: HOẠT ĐỘNG RA SAO?  Đoạn chữ bên dưới đổi theo mặt đang hiện.
const SIDES = [
  {
    label: 'LÀM GÌ?',
    body:
      'Bà Ngoại AI là project hoạt động với mong muốn giải quyết được một mối lo đáng quan ngại trong xã hội về vấn đề lừa đảo qua SĐT. ' +
      'Gặp tin nhắn hay cuộc gọi khả nghi, con gửi cho Bà: Bà nói thẳng có phải lừa không, chỉ con việc cần làm ngay, ' +
      'rồi soạn sẵn câu để con câu giờ kẻ lừa thay vì mất tiền.',
  },
  {
    label: 'HOẠT ĐỘNG RA SAO?',
    body:
      'Con dán tin nhắn hoặc gửi ảnh chụp màn hình Zalo, Messenger, SMS. AI đọc nội dung, đối chiếu với kho kịch bản lừa đảo ' +
      'mà mọi người đã gửi về, rồi ghi số tài khoản, số điện thoại, đường link của kẻ lừa vào sổ đen chung. ' +
      'Mỗi người hỏi Bà là thêm một người được cảnh báo, và ví điện tử có thể tra sổ đen này ngay trước khi con bấm chuyển tiền.',
  },
];

const INTERVAL_MS = 7000;

export default function FlipIntro() {
  // Đếm số lần lật thay vì lưu mặt hiện tại, để lần nào cũng lật cùng một chiều
  const [flips, setFlips] = useState(0);
  const [paused, setPaused] = useState(false);
  const side = flips % SIDES.length;

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setFlips((f) => f + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [paused, flips]);

  return (
    <section
      className="intro"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <h1 className="intro-title">
        <span className="intro-brand">BÀ NGOẠI AI</span>{' '}
        <button
          type="button"
          className="flip"
          onClick={() => setFlips((f) => f + 1)}
          aria-label={`${SIDES[side].label} Bấm để lật`}
        >
          <span className="flip-card" style={{ transform: `rotateX(${-flips * 180}deg)` }} aria-hidden>
            <span className="flip-face front">{SIDES[0].label}</span>
            <span className="flip-face back">{SIDES[1].label}</span>
          </span>
        </button>
      </h1>

      <div className="intro-body" aria-live="polite">
        {SIDES.map((s, i) => (
          <p key={s.label} className={`intro-text${i === side ? ' is-active' : ''}`} aria-hidden={i !== side}>
            {s.body}
          </p>
        ))}
      </div>
      <p className="intro-hint">Bấm vào ô màu để lật.</p>
    </section>
  );
}
