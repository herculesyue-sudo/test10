/**
 * 上傳前嘅相片質素檢查（喺瀏覽器行，唔使 API）。
 *
 * 點解值得做：
 *   1. **慳錢** —— 一張太暗 / 太矇嘅相，一樣要收足 API 費用，然後回一份
 *      冇用嘅報告。喺客人部電話度用 canvas 檢查係零成本、零延遲。
 *   2. **即時回饋** —— 影完即刻話「太暗喇」，好過等三十秒之後先話你知。
 *      喺漏斗上，呢一步救返嘅係「影咗相但攞到爛結果就走咗」嗰批人。
 *
 * 刻意唔做嘅：**唔做人臉偵測**。瀏覽器要做到準要拉個模型落嚟（幾 MB），
 * 拖慢首次載入，而個模型對唔同膚色嘅表現差異亦係一個公平性問題。
 * 「相入面有冇人臉」交返俾視覺模型判斷（見 postprocess.ts 嘅
 * usabilityVerdict）—— 佢本來就睇緊張相。
 *
 * 呢度只查三樣純數學、對所有膚色一視同仁嘅嘢：解像度、光暗、清晰度。
 */

export interface PhotoIssue {
  /** blocking = 唔應該俾佢傳上去；warning = 可以繼續但會提提佢 */
  level: 'blocking' | 'warning';
  message: string;
}

export interface PhotoCheckResult {
  ok: boolean;
  issues: PhotoIssue[];
  metrics: { width: number; height: number; brightness: number; sharpness: number };
}

/** 面部分析要睇色斑同毛孔呢類細節，太細張相根本睇唔到。 */
const MIN_EDGE = 480;
const IDEAL_EDGE = 800;

/** 平均亮度（0–255）。 */
const DARK = 55;
const BRIGHT = 218;

/**
 * 清晰度用 Laplacian 方差量度：相片越矇，相鄰像素差異越細，方差越低。
 * 呢個門檻由縮到 256px 之後嘅灰階圖計出嚟，所以同原圖大細無關。
 */
const BLURRY = 60;

/** 取樣邊長。縮細先計，令大相細相嘅數值可以直接比較，亦快好多。 */
const SAMPLE = 256;

export async function checkPhoto(dataUrl: string): Promise<PhotoCheckResult> {
  const img = await loadImage(dataUrl);
  const issues: PhotoIssue[] = [];

  if (Math.min(img.width, img.height) < MIN_EDGE) {
    issues.push({
      level: 'blocking',
      message: `相片太細（${img.width}×${img.height}）。要睇到色斑同毛孔，短邊至少要 ${MIN_EDGE} 像素。`,
    });
  } else if (Math.min(img.width, img.height) < IDEAL_EDGE) {
    issues.push({ level: 'warning', message: '相片解像度偏低，細節判斷會冇咁準。' });
  }

  const { brightness, sharpness } = measure(img);

  if (brightness < DARK) {
    issues.push({ level: 'blocking', message: '相片太暗，睇唔到膚色同色斑。搵個光啲嘅位再影一次。' });
  } else if (brightness > BRIGHT) {
    issues.push({ level: 'blocking', message: '相片過曝，皮膚細節俾光蓋咗。避開直射燈光或者強逆光。' });
  }

  if (sharpness < BLURRY) {
    issues.push({ level: 'blocking', message: '相片太矇。攞穩部電話，等對焦鎖實咗先影。' });
  }

  return {
    ok: !issues.some((i) => i.level === 'blocking'),
    issues,
    metrics: { width: img.width, height: img.height, brightness, sharpness },
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('相片讀取失敗'));
    img.src = src;
  });
}

/**
 * 一次過計亮度同清晰度。
 *
 * 亮度用 Rec. 709 亮度加權（人眼對綠色最敏感），唔係三個通道求其平均。
 * 清晰度用 3×3 Laplacian kernel 嘅輸出方差。
 */
function measure(img: HTMLImageElement): { brightness: number; sharpness: number } {
  const scale = SAMPLE / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { brightness: 128, sharpness: 999 }; // 拎唔到 canvas 就唔好阻住客人

  ctx.drawImage(img, 0, 0, w, h);
  return analysePixels(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * 純數學部分，同 DOM 分開 —— 咁先測試得到。
 * 收 RGBA 像素陣列，回亮度同清晰度。
 */
export function analysePixels(
  data: Uint8ClampedArray | number[],
  w: number,
  h: number,
): { brightness: number; sharpness: number } {
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    const g = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / gray.length;

  // Laplacian：中心 ×4 減四個鄰居。邊緣一圈跳過，唔使特別處理邊界。
  let lapSum = 0;
  let lapSqSum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap;
      lapSqSum += lap * lap;
      n++;
    }
  }
  const mean = n ? lapSum / n : 0;
  const sharpness = n ? lapSqSum / n - mean * mean : 999;

  return { brightness, sharpness };
}

/** 門檻值 export 出嚟，令測試同呢度唔會各寫一套數。 */
export const THRESHOLDS = { MIN_EDGE, IDEAL_EDGE, DARK, BRIGHT, BLURRY };
