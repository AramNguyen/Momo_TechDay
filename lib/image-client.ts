// Chạy trên trình duyệt: nén ảnh về JPEG để gửi lên API (tránh giới hạn 4.5MB body của Vercel).

export async function fileToJpegBase64(file: File, maxDim = 2000): Promise<{ data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bà không đọc được ảnh này'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const preview = canvas.toDataURL('image/jpeg', 0.85);
    return { preview, data: preview.split(',')[1] ?? '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
