'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* trình duyệt chặn clipboard thì thôi */
        }
      }}
    >
      {done ? 'Đã copy' : label}
    </button>
  );
}
