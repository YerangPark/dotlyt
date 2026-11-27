/**
 * 고를 수 있는 글씨체. 프리텐다드는 jsDelivr, 그리운·카페24 데코 글씨체는 public/fonts(styles.css 맨 위), 나머지는 Google Fonts(index.html).
 * 그리운 글씨체는 모든 사용 범위에서 무료 (파일 개작·수정·판매 금지).
 */
export type FontKey =
  | 'pretendard'
  | 'nanumpen'
  | 'caveat'
  | 'poorstory'
  | 'gowun'
  | 'plex'
  | 'notosans'
  | 'gowunbatang'
  | 'notoserif'
  | 'bebas'
  | 'intelmono'
  | 'griungowoon'
  | 'myoeun'
  | 'kyobo2025'
  | 'kkakdugi'
  | 'yeongrong'
  | 'jinju'
  | 'decobox'
  | 'decoline'
  | 'decoshadow'

const KO_FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'

export interface FontInfo {
  key: FontKey
  label: string
  group: '손글씨' | '고딕' | '명조' | '제목용' | '고정폭'
  /** 영문 전용 글씨체는 한글이 어울리는 글씨체로 이어지게 */
  family: string
  /** 글씨체마다 눈에 보이는 크기가 달라서, 같은 크기로 보이게 맞추는 배율 */
  scale: number
  /** 불러오기 확인용 이름 */
  load: string
  /** 영문 전용 (한글은 다른 글씨체로 보임) */
  latinOnly?: boolean
  /** 파일이 커서 처음에 미리 불러오지 않는다 (쓰거나 미리보기에 보일 때 불러옴) */
  lazy?: boolean
}

export const FONTS: FontInfo[] = [
  { key: 'nanumpen', label: '나눔펜', group: '손글씨', family: `"Nanum Pen Script", ${KO_FALLBACK}`, scale: 1.32, load: 'Nanum Pen Script' },
  { key: 'caveat', label: 'Caveat', group: '손글씨', family: `"Caveat", "Poor Story", ${KO_FALLBACK}`, scale: 1.18, load: 'Caveat', latinOnly: true },
  { key: 'kyobo2025', label: '교보 손글씨 2025', group: '손글씨', family: `"Kyobo Handwriting 2025 lyb", ${KO_FALLBACK}`, scale: 1.22, load: 'Kyobo Handwriting 2025 lyb', lazy: true },
  { key: 'jinju', label: '진주의일기장', group: '손글씨', family: `"Ownglyph Jinju Diary", ${KO_FALLBACK}`, scale: 1.36, load: 'Ownglyph Jinju Diary', lazy: true },
  { key: 'yeongrong', label: '온글잎 영롱', group: '손글씨', family: `"Ownglyph Yeongrong", ${KO_FALLBACK}`, scale: 1.2, load: 'Ownglyph Yeongrong', lazy: true },
  { key: 'myoeun', label: '묘은또박', group: '손글씨', family: `"Griun Myoeunddobak", ${KO_FALLBACK}`, scale: 1.06, load: 'Griun Myoeunddobak', lazy: true },
  { key: 'griungowoon', label: '그리운 고운', group: '손글씨', family: `"GriunXHangeul Gowoon", ${KO_FALLBACK}`, scale: 1, load: 'GriunXHangeul Gowoon', lazy: true },
  { key: 'poorstory', label: '푸어스토리', group: '손글씨', family: `"Poor Story", ${KO_FALLBACK}`, scale: 1.06, load: 'Poor Story' },
  {
    key: 'pretendard',
    label: '프리텐다드',
    group: '고딕',
    family: `"Pretendard Variable", Pretendard, ${KO_FALLBACK}`,
    scale: 0.96,
    load: 'Pretendard Variable',
  },
  { key: 'gowun', label: '고운돋움', group: '고딕', family: `"Gowun Dodum", ${KO_FALLBACK}`, scale: 1, load: 'Gowun Dodum' },
  { key: 'plex', label: 'IBM Plex', group: '고딕', family: `"IBM Plex Sans KR", ${KO_FALLBACK}`, scale: 0.96, load: 'IBM Plex Sans KR' },
  { key: 'notosans', label: 'Noto Sans', group: '고딕', family: `"Noto Sans KR", ${KO_FALLBACK}`, scale: 0.95, load: 'Noto Sans KR' },
  { key: 'kkakdugi', label: '깍두기 도면체', group: '고딕', family: `"Kkakdugi Drafting", ${KO_FALLBACK}`, scale: 1.05, load: 'Kkakdugi Drafting', lazy: true },
  { key: 'gowunbatang', label: '고운바탕', group: '명조', family: `"Gowun Batang", serif`, scale: 1, load: 'Gowun Batang' },
  { key: 'notoserif', label: 'Noto Serif', group: '명조', family: `"Noto Serif KR", serif`, scale: 0.95, load: 'Noto Serif KR' },
  {
    key: 'intelmono',
    label: 'Intel One Mono',
    group: '고정폭',
    family: `"Intel One Mono", "Pretendard Variable", Pretendard, ${KO_FALLBACK}`,
    scale: 0.92,
    load: 'Intel One Mono',
    latinOnly: true,
  },
  { key: 'decobox', label: '데코박스', group: '제목용', family: `"Cafe24 Decobox", "Pretendard Variable", Pretendard, ${KO_FALLBACK}`, scale: 1, load: 'Cafe24 Decobox', lazy: true, latinOnly: true },
  { key: 'decoline', label: '데코라인', group: '제목용', family: `"Cafe24 Decoline", "Pretendard Variable", Pretendard, ${KO_FALLBACK}`, scale: 1, load: 'Cafe24 Decoline', lazy: true, latinOnly: true },
  { key: 'decoshadow', label: '데코섀도', group: '제목용', family: `"Cafe24 Decoshadow", "Pretendard Variable", Pretendard, ${KO_FALLBACK}`, scale: 1, load: 'Cafe24 Decoshadow', lazy: true, latinOnly: true },
  { key: 'bebas', label: 'Bebas', group: '제목용', family: `"Bebas Neue", "Noto Sans KR", ${KO_FALLBACK}`, scale: 1.08, load: 'Bebas Neue', latinOnly: true },
]

const BY_KEY = Object.fromEntries(FONTS.map((f) => [f.key, f])) as Record<FontKey, FontInfo>

/** 기본 글씨체: 따로 고르지 않은 글자, 앱 화면 */
export const DEFAULT_FONT: FontKey = 'pretendard'

/** 목록에서 빠진 글씨체로 쓴 글자는 기본 글씨체로 보인다 */
export const fontOf = (key?: string) => BY_KEY[(key ?? DEFAULT_FONT) as FontKey] ?? BY_KEY[DEFAULT_FONT]
