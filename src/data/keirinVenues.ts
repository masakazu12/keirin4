export interface VenueInfo {
  code: string;
  name: string;
  kana: string;
  bankLength: number; // 333, 400, 500
  region: string;
}

export const KEIRIN_VENUES: VenueInfo[] = [
  { code: '01', name: '函館', kana: 'はこだて', bankLength: 400, region: '北日本' },
  { code: '02', name: '青森', kana: 'あおもり', bankLength: 400, region: '北日本' },
  { code: '03', name: 'いわき平', kana: 'いわきたいら', bankLength: 400, region: '北日本' },
  { code: '11', name: '弥彦', kana: 'やひこ', bankLength: 400, region: '関東' },
  { code: '12', name: '前橋', kana: 'まえばし', bankLength: 335, region: '関東' },
  { code: '13', name: '取手', kana: 'とりで', bankLength: 400, region: '関東' },
  { code: '14', name: '宇都宮', kana: 'うつのみや', bankLength: 500, region: '関東' },
  { code: '15', name: '大宮', kana: 'おおみや', bankLength: 500, region: '関東' },
  { code: '16', name: '西武園', kana: 'せいぶえん', bankLength: 400, region: '関東' },
  { code: '17', name: '京王閣', kana: 'けいおうかく', bankLength: 400, region: '関東' },
  { code: '18', name: '立川', kana: 'たちかわ', bankLength: 400, region: '関東' },
  { code: '21', name: '松戸', kana: 'まつど', bankLength: 333, region: '南関東' },
  { code: '23', name: '川崎', kana: 'かわさき', bankLength: 400, region: '南関東' },
  { code: '24', name: '平塚', kana: 'ひらつか', bankLength: 400, region: '南関東' },
  { code: '25', name: '小田原', kana: 'おだわら', bankLength: 333, region: '南関東' },
  { code: '26', name: '伊東温泉', kana: 'いとうおんせん', bankLength: 333, region: '南関東' },
  { code: '27', name: '静岡', kana: 'しずおか', bankLength: 400, region: '南関東' },
  { code: '31', name: '名古屋', kana: 'なごや', bankLength: 400, region: '中部' },
  { code: '32', name: '岐阜', kana: 'ぎふ', bankLength: 400, region: '中部' },
  { code: '34', name: '大垣', kana: 'おおがき', bankLength: 400, region: '中部' },
  { code: '35', name: '豊橋', kana: 'とよはし', bankLength: 400, region: '中部' },
  { code: '36', name: '富山', kana: 'とやま', bankLength: 333, region: '中部' },
  { code: '37', name: '松阪', kana: 'まつさか', bankLength: 400, region: '中部' },
  { code: '38', name: '四日市', kana: 'よっかいち', bankLength: 400, region: '中部' },
  { code: '41', name: '福井', kana: 'ふくい', bankLength: 400, region: '近畿' },
  { code: '42', name: '奈良', kana: 'なら', bankLength: 333, region: '近畿' },
  { code: '43', name: '向日町', kana: 'むこうまち', bankLength: 400, region: '近畿' },
  { code: '44', name: '和歌山', kana: 'わかやま', bankLength: 400, region: '近畿' },
  { code: '45', name: '岸和田', kana: 'きしわだ', bankLength: 400, region: '近畿' },
  { code: '51', name: '玉野', kana: 'たまの', bankLength: 400, region: '中国' },
  { code: '53', name: '広島', kana: 'ひろしま', bankLength: 400, region: '中国' },
  { code: '54', name: '防府', kana: 'ほうふ', bankLength: 333, region: '中国' },
  { code: '55', name: '高松', kana: 'たかまつ', bankLength: 400, region: '四国' },
  { code: '56', name: '小松島', kana: 'こまつしま', bankLength: 400, region: '四国' },
  { code: '57', name: '高知', kana: 'こうち', bankLength: 500, region: '四国' },
  { code: '58', name: '松山', kana: 'まつやま', bankLength: 400, region: '四国' },
  { code: '61', name: '小倉', kana: 'こくら', bankLength: 400, region: '九州' },
  { code: '62', name: '久留米', kana: 'くるめ', bankLength: 400, region: '九州' },
  { code: '63', name: '武雄', kana: 'たけお', bankLength: 400, region: '九州' },
  { code: '64', name: '佐世保', kana: 'させぼ', bankLength: 400, region: '九州' },
  { code: '65', name: '別府', kana: 'べっぷ', bankLength: 400, region: '九州' },
  { code: '67', name: '熊本', kana: 'くまもと', bankLength: 400, region: '九州' },
];

export const VENUE_MAP = new Map<string, VenueInfo>(
  KEIRIN_VENUES.map(v => [v.code, v])
);

// Standard Keirin car livery colors (1白, 2黒, 3赤, 4青, 5黄, 6緑, 7橙, 8桃, 9紫)
export const CAR_COLORS: Record<number, { bg: string; text: string; name: string; border: string }> = {
  1: { bg: '#FFFFFF', text: '#111827', name: '白', border: '#D1D5DB' },
  2: { bg: '#1F2937', text: '#F9FAFB', name: '黒', border: '#111827' },
  3: { bg: '#DC2626', text: '#FFFFFF', name: '赤', border: '#B91C1C' },
  4: { bg: '#2563EB', text: '#FFFFFF', name: '青', border: '#1D4ED8' },
  5: { bg: '#FBBF24', text: '#111827', name: '黄', border: '#D97706' },
  6: { bg: '#10B981', text: '#FFFFFF', name: '緑', border: '#059669' },
  7: { bg: '#F97316', text: '#FFFFFF', name: '橙', border: '#EA580C' },
  8: { bg: '#F472B6', text: '#FFFFFF', name: '桃', border: '#DB2777' },
  9: { bg: '#8B5CF6', text: '#FFFFFF', name: '紫', border: '#7C3AED' },
};
