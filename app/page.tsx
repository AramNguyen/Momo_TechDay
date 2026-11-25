'use client';

import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import ResultCard from '@/components/ResultCard';
import { fileToJpegBase64 } from '@/lib/image-client';
import type { AnalyzeResponse } from '@/lib/types';

// Tin mẫu tự viết cho giám khảo bấm thử (số/link đều là giả, trùng với dữ liệu seed)
const SAMPLES = [
  {
    label: 'Mạo danh công an',
    text: 'Công an Quận 1 thông báo: Ông/bà có liên quan đến đường dây rửa tiền. Yêu cầu chuyển toàn bộ số dư vào tài khoản tạm giữ 9999 0012 3456 78 (Ngân hàng mô phỏng) để xác minh trong 2 giờ, nếu không sẽ bị khởi tố. Tuyệt đối không được nói với người nhà.',
  },
  {
    label: 'Việc nhẹ lương cao',
    text: 'Chào bạn, bên mình đang tuyển CTV làm online tại nhà, chỉ cần thả tim video TikTok, mỗi nhiệm vụ 50k, ngày kiếm 500k–1tr. Kết bạn Zalo 0123 456 789 để nhận việc ngay nhé, số lượng có hạn!',
  },
  {
    label: 'Con cấp cứu',
    text: 'Mẹ ơi con bị tai nạn xe đang ở bệnh viện, điện thoại con hư phải mượn máy bạn nhắn. Mẹ chuyển gấp 15 triệu vào STK 9999 0098 7654 32 của bác sĩ giúp con, đang chờ đóng tiền mổ, đừng gọi lại nha mẹ.',
  },
  {
    label: 'Tin bình thường',
    text: 'Bà ơi chiều nay con ghé nhà bà ăn cơm nha, con mua bánh flan cho bà rồi.',
  },
];

export default function Home() {
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ data: string; preview: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const botUser = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Con gửi ảnh chụp màn hình thôi nha.');
      return;
    }
    try {
      setImage(await fileToJpegBase64(file));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi đọc ảnh');
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      void handleFile(item.getAsFile());
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void handleFile(e.dataTransfer.files?.[0]);
  }

  async function submit() {
    if (!text.trim() && !image) {
      setError('Con dán tin nhắn hoặc gửi ảnh cho bà xem với.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, image: image ? { data: image.data, mediaType: 'image/jpeg' } : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
      setResult(data as AnalyzeResponse);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Gặp lừa đảo? Gọi Bà!</h1>
        <p>
          Dán tin nhắn hoặc gửi <b>ảnh chụp màn hình</b> Zalo, Messenger, SMS khả nghi. Bà vạch mặt chiêu lừa, chỉ con việc cần
          làm, rồi soạn sẵn câu để con <b>troll câu giờ</b> tụi nó.
        </p>
      </section>

      <section className="card" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder="Dán nội dung tin nhắn vào đây (hoặc dán thẳng ảnh chụp màn hình bằng Ctrl+V)…"
          rows={5}
          maxLength={6000}
        />

        {image && (
          <div className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.preview} alt="Ảnh chụp màn hình đã chọn" />
            <button type="button" className="btn-small" onClick={() => setImage(null)}>
              Bỏ ảnh
            </button>
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            📷 {image ? 'Đổi ảnh' : 'Gửi ảnh chụp màn hình'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Bà đang đọc…' : 'Hỏi Bà'}
          </button>
        </div>

        <div className="samples">
          <span className="muted">Thử tin mẫu:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="chip-btn"
              onClick={() => {
                setText(s.text);
                setImage(null);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      <div ref={resultRef}>{result && <ResultCard r={result} />}</div>

      {botUser && (
        <section className="card tg">
          <b>Bà có mặt trên Telegram:</b> chuyển tiếp tin nhắn hoặc gửi ảnh cho{' '}
          <a href={`https://t.me/${botUser}`} target="_blank" rel="noreferrer">
            @{botUser}
          </a>
          .
        </section>
      )}
    </>
  );
}
