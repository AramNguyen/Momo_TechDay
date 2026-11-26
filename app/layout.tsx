import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow_Condensed, Be_Vietnam_Pro } from 'next/font/google';
import Nav from '@/components/Nav';
import './globals.css';

// Be Vietnam Pro: thiết kế riêng cho tiếng Việt, dấu đẹp ở mọi cỡ chữ.
const body = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

// Barlow Condensed: chỉ dùng cho con dấu kết luận và số liệu lớn.
const stamp = Barlow_Condensed({
  subsets: ['vietnamese', 'latin'],
  weight: ['600', '700'],
  variable: '--font-stamp',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bà Ngoại AI: Gặp lừa đảo? Gọi Bà',
  description:
    'Gửi tin nhắn hoặc ảnh chụp màn hình khả nghi cho Bà: Bà cho biết có phải lừa đảo không, chỉ việc cần làm và soạn sẵn câu để câu giờ kẻ lừa.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4a2c8f',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${stamp.variable}`}>
      <body>
        <Nav />
        <main className="container">{children}</main>
        <footer className="footer">
          <p>Bà Ngoại AI, dự án dự thi MoMo Techday 2026.</p>
          <p>
            Bà không lưu ảnh và nguyên văn tin nhắn của con, chỉ ghi lại thủ đoạn và STK, SĐT, link của kẻ lừa. Nội dung được
            xử lý bằng Google Gemini bản miễn phí, nên con che tên và số điện thoại của mình trước khi gửi.
          </p>
        </footer>
      </body>
    </html>
  );
}
