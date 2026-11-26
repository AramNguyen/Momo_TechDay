'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Gọi Bà' },
  { href: '/thu-lua-ba', label: 'Thử lừa Bà' },
  { href: '/canh-bao', label: 'Bản tin' },
  { href: '/kiem-tra-stk', label: 'Kiểm tra STK' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
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
