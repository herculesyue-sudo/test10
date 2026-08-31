/**
 * 自我診斷 —— `npm run doctor`
 *
 * 呢個 script 存在嘅原因好直接：QR 掃唔到嘅時候，原因可以係十幾樣嘢
 * （app 冇行、開錯網址、防火牆、隧道連唔通、環境變數未設…），而喺
 * 訊息度一嚟一回逐樣猜，一次只能排除一個可能。
 *
 * 呢度一次過查晒，出一份可以直接複製俾人睇嘅報告。
 */

import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PORT = process.env.PORT || '3000';
const ok = (s) => `  ✅ ${s}`;
const bad = (s) => `  ❌ ${s}`;
const warn = (s) => `  ⚠️  ${s}`;
const info = (s) => `  ·  ${s}`;

const out = [];
const say = (s) => {
  out.push(s);
  console.log(s);
};

say('\n══════════ AI 面診工具 · 自我診斷 ══════════\n');

// ── 1. 環境變數 ──
say('【1】設定');
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const has = (k) => new RegExp(`^\\s*${k}\\s*=\\s*\\S`, 'm').test(env) || Boolean(process.env[k]);

say(has('ANTHROPIC_API_KEY') ? ok('ANTHROPIC_API_KEY 有設') : warn('ANTHROPIC_API_KEY 未設 —— 真實分析會失敗（測試模式唔使）'));
say(has('DEMO_MODE') ? warn('DEMO_MODE 開咗 —— 客人會見到示範假數據，上線前要移除') : ok('DEMO_MODE 冇開'));
say(has('NEXT_PUBLIC_WHATSAPP') ? ok('NEXT_PUBLIC_WHATSAPP 有設') : warn('NEXT_PUBLIC_WHATSAPP 未設 —— 冇預約掣，個工具冇咗轉化出口'));
say(has('NEXT_PUBLIC_SITE_URL') ? ok('NEXT_PUBLIC_SITE_URL 有設') : info('NEXT_PUBLIC_SITE_URL 未設（未部署嘅話正常）'));
say(has('STAFF_TOKEN') ? ok('STAFF_TOKEN 有設') : warn('STAFF_TOKEN 未設 —— 正式環境入唔到 /share 同 /pro（測試模式照入得）'));

// ── 2. 網絡介面 ──
say('\n【2】呢部機嘅網絡位址');
const PRIVATE = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
const all = [];
for (const addrs of Object.values(networkInterfaces())) {
  for (const a of addrs ?? []) {
    const v4 = a.family === 'IPv4' || a.family === 4;
    if (v4 && !a.internal) all.push(a.address);
  }
}
const priv = all.filter((a) => PRIVATE.some((re) => re.test(a)));
if (all.length === 0) say(warn('搵唔到任何對外網絡介面'));
else say(info(`全部：${all.join(', ')}`));
say(
  priv.length
    ? ok(`區域網位址：${priv.join(', ')} —— 同一個 Wi-Fi 嘅手機有機會用 http://${priv[0]}:${PORT} 開到`)
    : warn('冇私有網段位址 —— 區域網測試行唔通，要用隧道或者部署'),
);

// ── 3. app 行緊未 ──
say(`\n【3】app 喺 port ${PORT} 行緊未`);
let appUp = false;
let qrTarget = null;
try {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/qr?path=/&info=1`, {
    signal: AbortSignal.timeout(5000),
  });
  appUp = r.ok;
  if (r.ok) {
    const j = await r.json();
    qrTarget = j.target;
    say(ok(`app 行緊`));
    say(info(`個 QR 而家會編碼：${j.target}`));
    say(
      j.printable
        ? ok('呢個網址係公開嘅，QR 掃得到，海報印得')
        : bad(`呢個網址掃咗都去唔到（分類：${j.reachability}）—— ${j.warning ?? ''}`),
    );
  } else {
    say(bad(`app 有回應但出錯：HTTP ${r.status}`));
  }
} catch (e) {
  say(bad(`連唔到 app —— 未行 \`npm run dev\`？（${e.message}）`));
}

// ── 4. 隧道 ──
say('\n【4】隧道（npm run tunnel）');
let cfBin = null;
try {
  ({ bin: cfBin } = require('cloudflared'));
} catch {
  say(bad('cloudflared 套件未裝 —— 行 `npm install`'));
}
if (cfBin) {
  if (!existsSync(cfBin)) {
    say(warn('cloudflared 套件裝咗但個 binary 未下載（第一次行 tunnel 會自動下載）'));
  } else {
    say(ok('cloudflared binary 有'));
    say(info('測緊連唔連得到 Cloudflare…'));
    const reachable = await new Promise((resolve) => {
      const cf = spawn(cfBin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate']);
      const t = setTimeout(() => {
        cf.kill('SIGTERM');
        resolve({ ok: false, msg: '30 秒內開唔到' });
      }, 30000);
      const onData = (b) => {
        const s = b.toString();
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(s);
        if (m) {
          clearTimeout(t);
          cf.kill('SIGTERM');
          resolve({ ok: true, url: m[0] });
        }
        if (/Host not in allowlist|dial tcp|no such host|403 Forbidden/i.test(s)) {
          clearTimeout(t);
          cf.kill('SIGTERM');
          resolve({ ok: false, msg: s.trim().split('\n').pop() });
        }
      };
      cf.stdout.on('data', onData);
      cf.stderr.on('data', onData);
      cf.on('error', (e) => {
        clearTimeout(t);
        resolve({ ok: false, msg: e.message });
      });
    });
    say(
      reachable.ok
        ? ok(`隧道開得到：${reachable.url}`)
        : bad(`隧道開唔到 —— ${reachable.msg}\n     （公司/診所網絡封鎖咗 Cloudflare？咁就要直接部署）`),
    );
  }
}

// ── 結論 ──
say('\n══════════ 結論 ══════════');
if (qrTarget && /localhost|127\.0\.0\.1/.test(qrTarget)) {
  say(bad('個 QR 而家指住 localhost —— 用手機掃一定開唔到。'));
  say('');
  say('  你可能係喺 http://localhost:3000/share 開緊個頁面。');
  say('  個 QR 係跟「你開緊邊條網址」砌嘅，所以喺 localhost 開就一定係 localhost。');
  say('');
  say('  最穩陣嘅解決方法：部署上網（一撳掣，唔使用 terminal）——');
  say('  睇 DEPLOY.md 最上面嗰個 Deploy 掣。');
} else if (qrTarget) {
  say(ok(`個 QR 指住 ${qrTarget} —— 應該掃得到。`));
} else {
  say(warn('app 未行，所以查唔到個 QR。先 `npm run dev` 再行多次 `npm run doctor`。'));
}

say('\n（將以上全部複製俾人睇，就唔使逐句形容個問題。）\n');
