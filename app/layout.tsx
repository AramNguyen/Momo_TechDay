import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bà Ngoại AI: Gặp lừa đảo? Gọi Bà!',
  description:
    'Gửi tin nhắn hoặc ảnh chụp màn hình khả nghi cho Bà: Bà vạch mặt chiêu lừa, chỉ việc cần làm và soạn sẵn câu troll để câu giờ kẻ lừa đảo.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#a50064',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Nav />
        <main className="container">{children}</main>
        <footer className="footer">
          Bà Ngoại AI · MoMo Techday 2026 · Bà chỉ lưu các thông tin đã bóc tách (kịch bản, STK/SĐT/link của kẻ lừa),
          không lưu ảnh gốc của con.
        </footer>
      </body>
    </html>
  );
}
