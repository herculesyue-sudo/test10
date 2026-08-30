'use client';

/**
 * 客人紀錄（「商戶後台」）—— 職員版，middleware 用 STAFF_TOKEN 把關。
 *
 * 搜電話 → 逐次分析嘅 8 大範疇評分 → 有兩次以上就出趨勢（sparkline +
 * 對上一次嘅變化）。刪除掣係 PDPO 刪除請求嘅執行位。
 *
 * 趨勢圖用 inline SVG 手畫（本 project 慣例，唔引圖表庫）。
 */

import { useEffect, useState } from 'react';
import CategoryScores from '@/components/CategoryScores';
import { CATEGORIES } from '@/lib/categories';
import { normalizePhone, type VisitRecord } from '@/lib/visits';
import { GOALS } from '@/lib/treatments/types';

/** 一個範疇跨次嘅分數線。y 軸固定 0–100，唔同範疇先可以互相比較。 */
function Sparkline({ values }: { values: number[] }) {
  const W = 140;
  const H = 30;
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',');
        return <circle key={i} cx={x} cy={y} r="2" fill="var(--accent)" />;
      })}
    </svg>
  );
}

const goalLabel = (k: string) => GOALS.find((g) => g.key === k)?.label ?? k;

export default function RecordsPage() {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [phone, setPhone] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [visits, setVisits] = useState<VisitRecord[] | null>(null);
  const [searched, setSearched] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/records')
      .then((r) => r.json())
      .then((d) => setPersistent(d.persistent === true))
      .catch(() => {});
  }, []);

  const valid = normalizePhone(phone) !== null;

  async function search() {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/records?phone=${encodeURIComponent(phone)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '搜尋失敗');
      setVisits(json.visits);
      setSearched(json.phone);
      setConfirmPhone('');
    } catch (e) {
      setError((e as Error).message);
      setVisits(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/records?phone=${encodeURIComponent(searched)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '刪除失敗');
      setMsg(`已刪除 ${json.deleted} 筆紀錄。`);
      setVisits([]);
      setConfirmPhone('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 趨勢：由舊到新排返，每個範疇一條線
  const chrono = visits ? [...visits].reverse() : [];
  const trends =
    chrono.length >= 2
      ? CATEGORIES.map((c) => {
          const series = chrono.map(
            (v) => v.categoryScores.find((s) => s.key === c.key)?.score ?? 100,
          );
          const latest = series[series.length - 1];
          const delta = latest - series[series.length - 2];
          return { key: c.key, label: c.label, series, latest, delta };
        })
      : [];

  return (
    <div className="wrap">
      <header className="site">
        <h1>客人紀錄</h1>
        <p>搜電話，睇 8 大範疇評分嘅變化</p>
      </header>

      {persistent === false && (
        <div className="alert warn">
          ⚠️ 未接駁 D1 資料庫 —— 紀錄而家只存喺記憶體，重啟或者重新部署之後就會消失。
          要長期保存，請照 DEPLOY.md 嘅「客人紀錄資料庫」一節建立 D1 並重新部署。
        </div>
      )}
      {error && <div className="alert danger">{error}</div>}
      {msg && <div className="alert" style={{ background: 'var(--accent-soft)' }}>{msg}</div>}

      <div className="card">
        <h2>搜尋</h2>
        <label className="f" htmlFor="search-phone">客人電話（8 位香港號碼）</label>
        <input
          id="search-phone"
          type="tel"
          inputMode="numeric"
          placeholder="9123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && !busy && search()}
        />
        {phone.trim() !== '' && !valid && (
          <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '5px 0 0' }}>請輸入 8 位香港電話號碼</p>
        )}
        <button className="primary" disabled={!valid || busy} onClick={search}>
          {busy ? '搜尋緊…' : '搜尋'}
        </button>
      </div>

      {visits !== null && visits.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-dim)' }}>呢個號碼冇任何紀錄。</p>
        </div>
      )}

      {trends.length > 0 && (
        <div className="card">
          <h2>趨勢（{chrono.length} 次分析）</h2>
          <p className="sub">每個範疇由舊到新嘅分數變化；箭咀係同上一次比。</p>
          {trends.map((t) => (
            <div className="finding" key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: '0.9rem' }}>{t.label}</b>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  最新 {t.latest}/100{' '}
                  {t.delta !== 0 && (
                    <b style={{ color: t.delta > 0 ? 'var(--ok)' : 'var(--danger)' }}>
                      {t.delta > 0 ? `↑ +${t.delta}` : `↓ ${t.delta}`}
                    </b>
                  )}
                </div>
              </div>
              <Sparkline values={t.series} />
            </div>
          ))}
        </div>
      )}

      {visits !== null &&
        visits.map((v) => (
          <div className="card" key={v.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h2 style={{ marginBottom: 2 }}>{new Date(v.createdAt).toLocaleDateString('zh-HK')}</h2>
              <span className="pill">{v.source === 'pro' ? '職員代做' : '客人自助'}</span>
            </div>
            <p className="sub" style={{ marginBottom: 10 }}>
              {v.ageBand ? `年齡段 ${v.ageBand} · ` : ''}
              {v.goals.length > 0 ? `目標：${v.goals.map(goalLabel).join('、')}` : '冇揀目標'}
            </p>
            {/* 由儲低嘅 findings 用同一條純函數重新計 —— 同客人當日見到嘅一致 */}
            <CategoryScores compact findings={v.findings} />
          </div>
        ))}

      {visits !== null && visits.length > 0 && (
        <div className="card">
          <h2>刪除紀錄（PDPO 請求）</h2>
          <p className="sub">
            客人要求刪除嗰陣用。會刪走 {searched} 嘅全部 {visits.length} 筆紀錄，冇得復原。
            確認請再輸入一次個號碼：
          </p>
          <input
            type="tel"
            inputMode="numeric"
            placeholder={searched}
            value={confirmPhone}
            onChange={(e) => setConfirmPhone(e.target.value)}
          />
          <button
            className="primary"
            style={{ background: 'var(--danger)' }}
            disabled={normalizePhone(confirmPhone) !== searched || busy}
            onClick={remove}
          >
            刪除呢個號碼嘅全部紀錄
          </button>
        </div>
      )}
    </div>
  );
}
