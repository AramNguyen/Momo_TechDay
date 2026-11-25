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
      <Link href="/" className="brand">
        <span aria-hidden>👵</span> Bà Ngoại AI
      </Link>
      <nav>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
