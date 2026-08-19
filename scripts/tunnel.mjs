/**
 * 一句指令，開一條公開 HTTPS 網址出嚟試。
 *
 *   npm run tunnel
 *
 * 點解要有呢樣嘢：用區域網位址（192.168.x）俾手機試，聽落好簡單，
 * 但實際上有一大堆嘢會擋住 —— 電腦防火牆、路由器嘅「用戶端隔離」
 * （好多商用 Wi-Fi 預設開咗）、手機連咗 4G 唔係 Wi-Fi、公司網絡分 VLAN。
 * 每一樣都要逐個查，而且查完可能仲係唔得。
 *
 * 隧道直接繞過晒全部：Cloudflare 俾你一條真 https 網址，手機用 4G
 * 都開得到，唔使同任何網絡設定糾纏。唔使開帳戶，關咗個 terminal 就冇。
 *
 * ⚠️ 呢條網址係臨時嘅，每次開都唔同，而且冇 uptime 保證 ——
 *    純粹用嚟試。正式上線仍然要部署（見 DEPLOY.md）。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PORT = process.env.PORT || '3000';

let cfBin;
try {
  ({ bin: cfBin } = require('cloudflared'));
} catch {
  console.error('搵唔到 cloudflared。行 `npm install` 先。');
  process.exit(1);
}

const children = [];
function cleanup() {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {}
  }
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', cleanup);

console.log(`\n▶ 開緊個 app（port ${PORT}）…`);
const app = spawn('npx', ['next', 'dev', '-p', PORT], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});
children.push(app);
app.on('exit', (code) => {
  if (code) {
    console.error(`\n個 app 熄咗（code ${code}）。`);
    cleanup();
    process.exit(code);
  }
});

console.log('▶ 開緊隧道…（第一次可能要download個 binary，等陣）\n');
const cf = spawn(cfBin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(cf);

let announced = false;
const onData = (buf) => {
  const text = buf.toString();

  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  if (m && !announced) {
    announced = true;
    const url = m[0];
    const line = '─'.repeat(Math.max(46, url.length + 22));
    console.log(`\n┌${line}┐`);
    console.log(`│  ✅ 公開網址開好喇 —— 手機用 4G 都開得到`);
    console.log(`│`);
    console.log(`│  客人版：  ${url}`);
    console.log(`│  派海報：  ${url}/share`);
    console.log(`│`);
    console.log(`│  ⚠️ 開 /share 嗰陣要用上面條網址，唔好用 localhost ——`);
    console.log(`│     個 QR 係跟你開緊嗰條網址嚟砌嘅。`);
    console.log(`│`);
    console.log(`│  呢條係臨時網址，熄咗呢個 terminal 就冇。正式上線見 DEPLOY.md。`);
    console.log(`└${line}┘\n`);
  }

  // Cloudflare 嘅正常運作訊息好嘈，只放行真係要人睇嘅嘢
  if (/ERR|error|failed/i.test(text) && !/Thank you for trying/.test(text)) {
    process.stderr.write(text);
  }
};

cf.stdout.on('data', onData);
cf.stderr.on('data', onData);

cf.on('exit', (code) => {
  if (!announced) {
    console.error(
      `\n隧道開唔到（code ${code}）。\n` +
        '常見原因：公司網絡封鎖咗 cloudflare、或者要行 proxy。\n' +
        '可以改用部署（見 DEPLOY.md），或者行 `npx localtunnel --port ' + PORT + '` 試下。\n',
    );
  }
  cleanup();
  process.exit(code ?? 0);
});
