'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Gọi Bà' },
  { href: '/canh-bao', label: 'Bản tin' },
  { href: '/kiem-tra-stk', label: 'Kiểm tra STK' },
  { href: '/thu-lua-ba', label: 'Thử lừa Bà' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          {/* Logo tạm, thay file public/logo.svg là xong */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} className="brand-logo" />
          Bà Ngoại AI
        </Link>
        <nav aria-label="Điều hướng chính">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? 'active' : ''}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
