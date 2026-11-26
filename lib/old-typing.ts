// Làm tin nhắn của bà Tư giống người lớn tuổi miền Nam gõ điện thoại.
// Lỗi theo CÁCH ĐỌC chứ không phải lỗi máy: cả câu không dấu ("thanh pho nao vay chau"),
// lẫn dấu hỏi/ngã ("đổ" thành "đỗ"), lẫn n/ng và t/c cuối ("chiên" thành "chiêng"),
// v thành d ("vô" thành "dô"), ít viết hoa, ít dấu câu. Mức độ vừa phải để người đọc vẫn hiểu.

const RATE = {
  wholeLineNoAccent: 0.45, // cả tin gõ không dấu
  hoiNga: 0.1, // từ có dấu hỏi/ngã bị gõ lộn qua dấu kia
  finalN: 0.12, // -n thành -ng: chiên → chiêng, lên → lêng
  finalT: 0.1, // -t thành -c: mặt → mặc, biết → biếc
  initialV: 0.3, // v thành d: vô → dô, vậy → dậy
  wordNoAccent: 0.15, // từ lẻ quên bỏ dấu
  fatFinger: 0.03, // hiếm khi bấm lộn phím
  lowercaseStart: 0.7, // không viết hoa đầu tin
  dropFinalPunct: 0.75, // bỏ dấu chấm / chấm hỏi cuối tin
  dropComma: 0.5, // bỏ dấu phẩy giữa câu
};

const HOI = '̉';
const NGA = '̃';

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');

function swapHoiNga(word: string): string {
  const d = word.normalize('NFD');
  if (d.includes(HOI)) return d.replace(HOI, NGA).normalize('NFC');
  if (d.includes(NGA)) return d.replace(NGA, HOI).normalize('NFC');
  return word;
}

function fatFinger(word: string, rand: () => number): string {
  const chars = Array.from(word);
  if (chars.length < 4) return word;
  const i = 1 + Math.floor(rand() * (chars.length - 2));
  if (rand() < 0.5) chars.splice(i, 0, chars[i]);
  else chars.splice(i, 1);
  return chars.join('');
}

function messUpWord(w: string, rand: () => number): string {
  const lower = w.toLocaleLowerCase('vi');
  const hasHoiNga = /[̉̃]/.test(w.normalize('NFD'));
  if (hasHoiNga && rand() < RATE.hoiNga) return swapHoiNga(w);
  // -n (không phải -nh) thành -ng; chừa từ ngắn như "con", "lên" cho khỏi khó đọc
  if (/[aeiouy]n$/.test(stripAccents(lower)) && lower.length >= 4 && rand() < RATE.finalN) {
    return w + 'g';
  }
  // -t thành -c (không đụng -ch)
  if (/[^c]t$/.test(lower) && lower.length >= 4 && rand() < RATE.finalT) return w.slice(0, -1) + 'c';
  // v đầu từ thành d
  if (/^v/.test(lower) && rand() < RATE.initialV) return (w[0] === 'V' ? 'D' : 'd') + w.slice(1);
  if (rand() < RATE.wordNoAccent) return stripAccents(w);
  if (rand() < RATE.fatFinger) return fatFinger(w, rand);
  return w;
}

function messUpLine(line: string, rand: () => number): string {
  // AI hay dùng dấu ba chấm, người già nhắn tin thì không: bỏ hết
  let out = line
    .replace(/\s*(\.{2,}|…)\s*(\p{L}?)/gu, (_m, _dots, next: string) => ' ' + next.toLocaleLowerCase('vi'))
    .trim();

  if (rand() < RATE.wholeLineNoAccent) {
    out = stripAccents(out);
  } else {
    // Không đụng vào số, link, STK... để thông tin bà "đọc lại" vẫn đúng như kẻ lừa đưa
    out = out
      .split(/(\s+)/)
      .map((tok) => {
        const m = tok.match(/^(\p{L}+)(\p{P}*)$/u);
        return m ? messUpWord(m[1], rand) + m[2] : tok;
      })
      .join('');
  }

  out = out.replace(/,(\s)/g, (s, sp) => (rand() < RATE.dropComma ? sp : s));
  // Người già hiếm khi chấm câu giữa tin: ". Bà già rồi" thành " bà già rồi"
  out = out.replace(/[.!]\s+(\p{L})/gu, (s, c: string) => (rand() < 0.75 ? ' ' + c.toLocaleLowerCase('vi') : s));
  if (rand() < RATE.dropFinalPunct) out = out.replace(/[.?!]+$/, '');
  if (rand() < RATE.lowercaseStart) out = out.charAt(0).toLocaleLowerCase('vi') + out.slice(1);
  return out.trim();
}

const MAX_MESSAGES = 3;

/** Gom lại còn tối đa 3 tin: AI hay tách mỗi câu một dòng, gửi 7 tin liền nhìn như spam. */
function capMessages(lines: string[]): string[] {
  if (lines.length <= MAX_MESSAGES) return lines;
  const size = Math.ceil(lines.length / MAX_MESSAGES);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size).join(' '));
  return out;
}

/** Mỗi dòng là một tin nhắn riêng; "già hóa" từng dòng. */
export function typeLikeGrandma(text: string, rand: () => number = Math.random): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return capMessages(lines)
    .map((l) => messUpLine(l, rand))
    .filter(Boolean)
    .join('\n');
}
