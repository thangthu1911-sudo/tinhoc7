// Hàm serverless của Vercel: nhận câu hỏi từ trang web, gọi Anthropic API bằng khóa lưu ở biến môi trường.
const LV = {
  b: 'Học sinh yếu: giải thích thật chậm, từng ý nhỏ, dùng ví dụ rất gần gũi.',
  n: 'Giải thích rõ ràng, vừa phải.',
  a: 'Học sinh khá giỏi: có thể thêm câu hỏi gợi mở hoặc so sánh số bước giữa các thuật toán.'
};
const SYSTEM = `Bạn là trợ lý học tập thân thiện cho học sinh lớp 7 môn Tin học (sách Kết nối tri thức). Trả lời bằng tiếng Việt, tối đa 120 từ, câu ngắn, từ ngữ đơn giản, có thể dùng ví dụ đời thường (xếp hàng, tra từ điển, đoán số). Chỉ nói về thuật toán sắp xếp và tìm kiếm; nếu em hỏi chuyện khác thì nhẹ nhàng đưa về chủ đề. Nếu em trả lời sai thì động viên và gợi ý, không chê. Khi được yêu cầu ra câu hỏi thì tuyệt đối không nêu đáp án.`;
const clip = (s, n) => String(s ?? '').slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Thiếu ANTHROPIC_API_KEY' });

  // Giới hạn đơn giản: 10 lượt/phút cho mỗi địa chỉ IP (mang tính tương đối trên serverless)
  const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
  const now = Date.now();
  global.__rl = global.__rl || new Map();
  const hits = (global.__rl.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 10) return res.status(429).json({ error: 'rate' });
  hits.push(now); global.__rl.set(ip, hits);

  const b = req.body || {};
  const arr = Array.isArray(b.arr) ? b.arr.slice(0, 12).map(Number).filter(Number.isFinite) : [];
  const history = Array.isArray(b.history) ? b.history.slice(-4).map(h => clip(h, 300)) : [];
  const user =
`Thuật toán: ${clip(b.algo, 60)}. Dãy đang hiển thị: ${arr.join(', ')}.${b.target != null ? ' Số cần tìm: ' + Number(b.target) + '.' : ''} Bước hiện tại: ${clip(b.step, 300)}
${LV[b.level] || LV.n}
Hội thoại trước: ${history.join(' | ') || '(chưa có)'}
Em học sinh nói: ${clip(b.question, 300)}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream' });
    const d = await r.json();
    res.status(200).json({ text: (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('') });
  } catch (e) {
    res.status(502).json({ error: 'upstream' });
  }
};
