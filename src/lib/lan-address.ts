import { networkInterfaces } from 'node:os';

/**
 * 搵部伺服器喺區域網嘅 IP。
 *
 * 用途：喺本機行嘅時候，同一個 Wi-Fi 嘅手機掃唔到 `localhost`，但掃到
 * `192.168.x.x`。冇呢個，診所喺自己部電腦上面**根本冇辦法用手機試**個
 * 流程 —— 要等部署咗先試得，而部署咗先發現問題係最貴嘅次序。
 *
 * ⚠️ 呢個係**測試用**，唔係印海報用。區域網位址出咗診所個 Wi-Fi 就冇效，
 *    所以 /share 只會攞佢做「測試 QR」，正式海報仍然要求公開網址。
 *
 * 相機點解喺 http 都用得：影相係用 `<input type="file" capture="user">`，
 * 即係叫作業系統個相機 app，唔係 getUserMedia。前者唔需要 secure context，
 * 所以區域網用 http 都影到相，成個流程試得足。
 */

/**
 * 真正嘅私有網段，順序 = 家用 / 辦公室 Wi-Fi 最常見嗰啲行先。
 *
 * ⚠️ 一定要**只收呢三個網段**，唔可以「非 loopback 就當區域網」。
 *    機器仲可以有一大堆其他位址：雲端容器嘅內部位址、TEST-NET
 *    （192.0.2.x）、CGNAT（100.64.x）、docker bridge…… 佢哋全部都
 *    唔係「同一個 Wi-Fi 嘅手機掃得到」，攞嚟砌 QR 就係再整多一個
 *    掃到但去唔到嘅網址 —— 即係我哋一開始要修嗰個 bug。
 */
const PRIVATE_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      // Node 18+ 嘅 family 係 'IPv4'，舊版係 4 —— 兩樣都接受
      const isV4 = a.family === 'IPv4' || (a.family as unknown as number) === 4;
      if (!isV4 || a.internal) continue;
      if (!PRIVATE_RANGES.some((re) => re.test(a.address))) continue;
      out.push(a.address);
    }
  }
  return out.sort((x, y) => rank(x) - rank(y));
}

function rank(ip: string): number {
  const i = PRIVATE_RANGES.findIndex((re) => re.test(ip));
  return i === -1 ? PRIVATE_RANGES.length : i;
}

/**
 * 砌一條同一個 Wi-Fi 嘅手機開得到嘅網址。
 * 攞唔到區域網位址（例如喺容器入面行）就回 null，唔好亂猜。
 */
export function lanUrl(port: string): string | null {
  const ip = lanAddresses()[0];
  return ip ? `http://${ip}${port ? ':' + port : ''}` : null;
}
