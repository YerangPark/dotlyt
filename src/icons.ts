/**
 * 불렛저널에 자주 쓰는 단색 선 아이콘. 24×24 칸에 선(stroke)으로만 그린다.
 * 직접 그린 모양이라 외부 아이콘 라이선스가 필요 없다.
 */

/** 원: 경로(path) 안에 넣을 수 있게 호 두 개로 */
const c = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

/** 점 하나 (둥근 선 끝으로 찍힌다) */
const dot = (x: number, y: number) => `M${x} ${y}h.01`

const cloud = 'M7 15.5h10a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.8 9.6 2.95 2.95 0 0 0 7 15.5z'
const face = c(12, 12, 9)

export const ICONS = [
  // 날씨
  { key: 'sun', label: '맑음', group: '날씨', d: c(12, 12, 4) + 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' },
  { key: 'cloud', label: '흐림', group: '날씨', d: 'M7 18h10a4 4 0 0 0 .6-8A6.2 6.2 0 0 0 5.9 11.5 3.3 3.3 0 0 0 7 18z' },
  { key: 'rain', label: '비', group: '날씨', d: cloud + 'M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5' },
  { key: 'snow', label: '눈', group: '날씨', d: cloud + dot(8, 19) + dot(12, 21) + dot(16, 19) },
  { key: 'moon', label: '달', group: '날씨', d: 'M19.5 14.6A8 8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z' },
  { key: 'star', label: '별', group: '날씨', d: 'M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.35 2.85 1-6L3.3 9.6l6-.9z' },

  // 기분
  { key: 'happy', label: '좋음', group: '기분', d: face + 'M8.5 14a4 4 0 0 0 7 0' + dot(9, 9.8) + dot(15, 9.8) },
  { key: 'soso', label: '보통', group: '기분', d: face + 'M9 15h6' + dot(9, 9.8) + dot(15, 9.8) },
  { key: 'sad', label: '나쁨', group: '기분', d: face + 'M8.5 16.5a4 4 0 0 1 7 0' + dot(9, 9.8) + dot(15, 9.8) },
  { key: 'heart', label: '하트', group: '기분', d: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z' },
  { key: 'fire', label: '불꽃', group: '기분', d: 'M12 21a6 6 0 0 1-6-6c0-4 3-5.5 3-9.5 3 1.5 4.5 4 4.5 6.3.9-.8 1.6-2 1.6-3.3 2 1.6 2.9 4.2 2.9 6.5a6 6 0 0 1-6 6z' },
  { key: 'sparkle', label: '반짝', group: '기분', d: 'M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5zM18.5 15.5c.3 1.8 1 2.5 2.5 2.7-1.5.3-2.2 1-2.5 2.8-.3-1.8-1-2.5-2.5-2.8 1.5-.2 2.2-.9 2.5-2.7z' },

  // 일상
  { key: 'rice', label: '밥', group: '일상', d: 'M3.5 12.5h17a8.5 8.5 0 0 1-17 0zM6.5 12.5a5.5 4.2 0 0 1 11 0M14 2.5l4.5 6.5M17.5 2.5l4 5.5' },
  { key: 'coffee', label: '커피', group: '일상', d: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.3a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5' },
  { key: 'water', label: '물', group: '일상', d: 'M12 3.2s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z' },
  { key: 'wine', label: '술', group: '일상', d: 'M7.5 3h9l-.6 5.5a3.9 3.9 0 0 1-7.8 0zM12 12.5V20M8.5 20.5h7' },
  { key: 'pill', label: '약', group: '일상', d: 'M10.6 20.4a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7zM8 8l8 8' },
  { key: 'sleep', label: '잠', group: '일상', d: 'M3 18.5V7M3 14.5h18v4M21 14.5v-1.8A3.2 3.2 0 0 0 17.8 9.5H11v5' + c(7, 11.8, 1.7) },
  { key: 'cart', label: '장보기', group: '일상', d: 'M3 4h2.2l2.4 11h10.2l2-8H6.3' + dot(9, 19.5) + dot(17, 19.5) },
  { key: 'money', label: '돈', group: '일상', d: 'M4 7.5h15.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18zM4 7.5l11.5-3.5v3.5M16.5 13.5h.01' },

  // 활동
  { key: 'workout', label: '운동', group: '활동', d: 'M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11' },
  { key: 'bike', label: '자전거', group: '활동', d: c(6, 16, 3.5) + c(18, 16, 3.5) + 'M6 16l4-7h5.5L18 16M10 9l2.5 7H6M13.5 6.5h2.5' },
  { key: 'book', label: '독서', group: '활동', d: 'M12 6.5c-2.2-1.6-5.2-2-8-1.5v13c2.8-.5 5.8-.1 8 1.5 2.2-1.6 5.2-2 8-1.5V5c-2.8-.5-5.8-.1-8 1.5zM12 6.5V19.5' },
  { key: 'music', label: '음악', group: '활동', d: 'M9 17.5V6l10-2v11.5' + c(6.5, 17.5, 2.5) + c(16.5, 15.5, 2.5) },
  { key: 'travel', label: '여행', group: '활동', d: 'M21 3L3 10.5l7 2.5 2.5 7zM10 13l5-5' },
  { key: 'camera', label: '사진', group: '활동', d: 'M4 8h3l2-3h6l2 3h3v11H4z' + c(12, 13, 3.4) },
  { key: 'pen', label: '공부', group: '활동', d: 'M15 4.5l4.5 4.5L8.5 20H4v-4.5zM13 6.5l4.5 4.5' },

  // 일·집
  { key: 'work', label: '업무', group: '일·집', d: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' },
  { key: 'mail', label: '메일', group: '일·집', d: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6' },
  { key: 'phone', label: '전화', group: '일·집', d: 'M5.5 4h3l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3.5 6a2 2 0 0 1 2-2z' },
  { key: 'home', label: '집', group: '일·집', d: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5' },
  { key: 'clean', label: '청소', group: '일·집', d: 'M15 3l-3.5 8.5M6.5 11.5h10l1.5 8.5H5zM9 15v5M13 15v5' },
  { key: 'laundry', label: '빨래', group: '일·집', d: 'M8.5 4L3.5 7l2 4 2-1v10h9V10l2 1 2-4-5-3a3.5 3.5 0 0 1-7 0z' },
  { key: 'car', label: '자동차', group: '일·집', d: 'M5 16.5h14V12l-2-5H7l-2 5zM5 16.5v2M19 16.5v2M3.5 12h17' + dot(8, 14) + dot(16, 14) },
  { key: 'hospital', label: '병원', group: '일·집', d: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z' },

  // 기타
  { key: 'gift', label: '선물', group: '기타', d: 'M4 10h16v3.5H4zM5 13.5h14V20H5zM12 10v10M12 10c-2-4-6.5-4-5.2-1.2.6 1.2 5.2 1.2 5.2 1.2zM12 10c2-4 6.5-4 5.2-1.2-.6 1.2-5.2 1.2-5.2 1.2z' },
  { key: 'cake', label: '생일', group: '기타', d: 'M4 20.5h16M5 20.5V13h14v7.5M5 16c2.3 1.5 4.7 1.5 7 0s4.7-1.5 7 0M12 13V9.5' + dot(12, 6.5) },
  { key: 'flower', label: '꽃', group: '기타', d: 'M12 13v8M12 21c-3 0-5-2-6-4.5 3 0 5 1.5 6 4.5zM12 13c-3 0-5-2.2-5-6l2.5 1.6L12 5l2.5 3.6L17 7c0 3.8-2 6-5 6z' },
  { key: 'plant', label: '식물', group: '기타', d: 'M12 21v-8M12 13c0-5 3-8 8-8 0 5-3 8-8 8zM12 15.5c0-3.5-2-6-6-6 0 3.5 2 6 6 6z' },
  { key: 'pet', label: '반려동물', group: '기타', d: c(6.8, 10.5, 1.6) + c(10.3, 6.8, 1.7) + c(14.7, 6.8, 1.7) + c(18.2, 10.5, 1.6) + 'M12 12.2c-3 0-5.5 3.4-5.5 5.6 0 1.5 1.5 2.4 3 1.9 1.6-.5 3.4-.5 5 0 1.5.5 3-.4 3-1.9 0-2.2-2.5-5.6-5.5-5.6z' },
  { key: 'bell', label: '알림', group: '기타', d: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0' },
  { key: 'flag', label: '깃발', group: '기타', d: 'M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11' },
  { key: 'pin', label: '장소', group: '기타', d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z' + c(12, 10, 2.2) },
  { key: 'clock', label: '시간', group: '기타', d: c(12, 12, 9) + 'M12 7v5l3.2 2' },
  { key: 'check', label: '체크', group: '기타', d: 'M5 12.5l4.5 4.5L19 7' },
] as const

export type IconKey = (typeof ICONS)[number]['key']

export const ICON_GROUPS = ['날씨', '기분', '일상', '활동', '일·집', '기타'] as const

const BY_KEY = Object.fromEntries(ICONS.map((i) => [i.key, i])) as Record<string, (typeof ICONS)[number]>

export const iconOf = (key: string) => BY_KEY[key] ?? BY_KEY.star
