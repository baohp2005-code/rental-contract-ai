/**
 * Kết quả phân tích mẫu cho hợp đồng mẫu trong assets/samples/.
 * Dùng khi chưa nối backend. Vị trí dòng (sample-ocr.json) khớp với ảnh mẫu,
 * nên tính năng tô dòng thử được ngay.
 *
 * `what_is_common` để trống vì data/market_norms.yaml chưa có số liệu khảo sát.
 */
import type { AnalyzeResponse, Flag, OcrLine, PageInfo } from '@rental/shared';

import ocr from './sample-ocr.json';

const flags: Flag[] = [
  {
    id: 'F1',
    rule_id: 'DEP-02',
    category: 'deposit',
    type: 'risky',
    severity: 'high',
    line_ids: ['p1-L12'],
    quote: 'Nếu bên B chuyển đi trước hạn thì không được hoàn lại tiền cọc.',
    title: 'Mất cọc nếu trả phòng sớm, kể cả khi đã báo trước',
    explanation:
      'Theo dòng này, chỉ cần bạn chuyển đi trước 12 tháng là có thể mất cả 7.000.000đ tiền cọc, dù bạn có báo trước hay không. Sinh viên rất hay phải đổi chỗ ở giữa chừng, nên bạn nên hỏi lại điều này.',
    what_is_common: '',
    question_for_landlord:
      'Nếu em báo trước 30 ngày khi cần chuyển đi sớm thì em có được nhận lại tiền cọc không ạ?',
    suggested_clause:
      'Bên B được hoàn lại tiền cọc nếu báo trước cho bên A ít nhất 30 ngày khi chấm dứt hợp đồng trước hạn.',
    confidence: 0.93,
  },
  {
    id: 'F2',
    rule_id: 'UTL-01',
    category: 'utilities',
    type: 'unclear',
    severity: 'high',
    line_ids: ['p1-L13'],
    quote: 'Tiền điện: theo giá chủ nhà quy định.',
    title: 'Giá điện không ghi con số cụ thể',
    explanation:
      'Hợp đồng không ghi giá điện là bao nhiêu một số, chỉ ghi "theo giá chủ nhà quy định". Như vậy giá có thể thay đổi bất kỳ lúc nào và bạn khó phản đối.',
    what_is_common: '',
    question_for_landlord:
      'Giá điện cụ thể là bao nhiêu một số, và mình ghi cố định con số đó vào hợp đồng được không ạ?',
    suggested_clause: 'Giá điện: ... đồng/số, giữ nguyên trong suốt thời hạn hợp đồng.',
    confidence: 0.9,
  },
  {
    id: 'F3',
    rule_id: 'RNT-01',
    category: 'rent',
    type: 'risky',
    severity: 'high',
    line_ids: ['p1-L10'],
    quote: 'Bên A có quyền điều chỉnh giá thuê khi cần thiết.',
    title: 'Chủ nhà được tăng giá thuê bất kỳ lúc nào',
    explanation:
      'Dòng này cho phép chủ nhà đổi mức 3.500.000đ/tháng bất kỳ lúc nào, không cần báo trước và không giới hạn mức tăng. Bạn có thể bị tăng giá ngay giữa kỳ học.',
    what_is_common: '',
    question_for_landlord:
      'Trong 12 tháng hợp đồng giá thuê có giữ nguyên không ạ? Nếu có tăng thì báo trước bao lâu và tăng tối đa bao nhiêu ạ?',
    suggested_clause:
      'Giá thuê giữ nguyên trong suốt thời hạn hợp đồng. Mọi thay đổi phải được hai bên đồng ý bằng văn bản.',
    confidence: 0.88,
  },
  {
    id: 'F4',
    rule_id: 'REP-01',
    category: 'repairs',
    type: 'risky',
    severity: 'high',
    line_ids: ['p2-L01'],
    quote: 'Bên B chịu toàn bộ chi phí sửa chữa mọi hư hỏng trong phòng.',
    title: 'Bạn phải trả mọi chi phí sửa chữa',
    explanation:
      'Theo dòng này, kể cả khi điều hòa hay bình nóng lạnh hỏng vì đã cũ, bạn vẫn phải trả tiền sửa. Những khoản này có thể lên tới vài triệu đồng.',
    what_is_common: '',
    question_for_landlord:
      'Những hư hỏng do thiết bị cũ hoặc hao mòn tự nhiên thì bên nào chịu chi phí sửa ạ?',
    suggested_clause:
      'Bên A chịu chi phí sửa chữa hư hỏng do hao mòn tự nhiên hoặc do thiết bị cũ. Bên B chịu chi phí với hư hỏng do mình gây ra.',
    confidence: 0.86,
  },
  {
    id: 'F5',
    rule_id: 'TRM-01',
    category: 'termination',
    type: 'risky',
    severity: 'high',
    line_ids: ['p2-L03'],
    quote: 'Bên A có quyền chấm dứt hợp đồng và lấy lại phòng khi có nhu cầu.',
    title: 'Chủ nhà được lấy lại phòng bất kỳ lúc nào',
    explanation:
      'Chủ nhà có thể lấy lại phòng mà không cần báo trước, trong khi bạn chuyển đi sớm thì mất cọc. Bạn có thể phải tìm chỗ ở mới rất gấp.',
    what_is_common: '',
    question_for_landlord:
      'Nếu anh/chị cần lấy lại phòng trước hạn thì sẽ báo trước cho em bao lâu, và tiền cọc được hoàn thế nào ạ?',
    suggested_clause:
      'Bên A phải báo trước cho bên B ít nhất 30 ngày khi chấm dứt hợp đồng trước hạn và hoàn lại toàn bộ tiền cọc.',
    confidence: 0.84,
  },
  {
    id: 'F6',
    rule_id: 'OTH-02',
    category: 'other',
    type: 'risky',
    severity: 'medium',
    line_ids: ['p2-L02'],
    quote: 'Bên A được vào kiểm tra phòng bất kỳ lúc nào.',
    title: 'Chủ nhà được vào phòng bất kỳ lúc nào',
    explanation:
      'Điều này ảnh hưởng tới sự riêng tư và an toàn đồ đạc của bạn, nhất là khi bạn đi học cả ngày.',
    what_is_common: '',
    question_for_landlord: 'Khi cần vào phòng, anh/chị có thể báo trước cho em được không ạ?',
    suggested_clause:
      'Bên A báo trước cho bên B ít nhất 24 giờ trước khi vào phòng, trừ trường hợp khẩn cấp.',
    confidence: 0.82,
  },
  {
    id: 'F7',
    rule_id: 'DEP-01',
    category: 'deposit',
    type: 'missing',
    severity: 'high',
    line_ids: [],
    quote: '',
    title: 'Không ghi khi nào và điều kiện nào được trả cọc',
    explanation:
      'Hợp đồng có ghi tiền cọc 7.000.000đ nhưng không nói sau khi hết hợp đồng bao lâu thì bạn nhận lại, và trường hợp nào bị trừ. Thiếu mốc này thì việc đòi cọc rất khó.',
    what_is_common: '',
    question_for_landlord:
      'Khi hết hợp đồng thì sau bao nhiêu ngày em nhận lại cọc, và trong trường hợp nào thì bị trừ cọc ạ?',
    suggested_clause:
      'Bên A hoàn lại tiền cọc cho bên B trong vòng 7 ngày kể từ ngày bàn giao phòng, sau khi trừ các khoản bên B còn nợ (nếu có, kèm chứng từ).',
    confidence: 0.8,
  },
  {
    id: 'F8',
    rule_id: 'TRM-02',
    category: 'termination',
    type: 'missing',
    severity: 'medium',
    line_ids: [],
    quote: '',
    title: 'Không ghi thời hạn báo trước',
    explanation:
      'Hợp đồng không nói mỗi bên phải báo trước bao nhiêu ngày khi muốn chấm dứt. Không có con số này thì dễ bị coi là vi phạm dù bạn đã báo.',
    what_is_common: '',
    question_for_landlord:
      'Khi muốn chấm dứt hợp đồng thì mỗi bên cần báo trước bao nhiêu ngày ạ?',
    suggested_clause:
      'Bên nào muốn chấm dứt hợp đồng trước hạn phải báo cho bên kia trước ít nhất 30 ngày.',
    confidence: 0.78,
  },
  {
    id: 'F9',
    rule_id: 'OTH-01',
    category: 'other',
    type: 'missing',
    severity: 'medium',
    line_ids: [],
    quote: '',
    title: 'Không có danh sách đồ đạc và hiện trạng phòng',
    explanation:
      'Không có biên bản bàn giao thì khi trả phòng, bạn khó chứng minh đồ nào đã hỏng từ trước. Đây là lý do phổ biến khiến sinh viên bị trừ cọc.',
    what_is_common: '',
    question_for_landlord:
      'Mình có thể lập biên bản bàn giao kèm ảnh hiện trạng và danh sách đồ đạc khi em nhận phòng không ạ?',
    suggested_clause:
      'Hai bên lập biên bản bàn giao kèm ảnh hiện trạng phòng và danh sách đồ đạc khi nhận phòng; biên bản là phụ lục của hợp đồng.',
    confidence: 0.75,
  },
  {
    id: 'F10',
    rule_id: 'UTL-02',
    category: 'utilities',
    type: 'unclear',
    severity: 'medium',
    line_ids: ['p1-L14'],
    quote: 'Phí dịch vụ: 150.000 đồng/tháng.',
    title: 'Phí dịch vụ không ghi gồm những gì',
    explanation:
      'Bạn trả 150.000đ/tháng phí dịch vụ nhưng hợp đồng không nói khoản này gồm wifi, vệ sinh, gửi xe hay gì khác. Sau này có thể phát sinh thêm khoản thu ngoài.',
    what_is_common: '',
    question_for_landlord:
      'Phí dịch vụ 150.000 đồng/tháng gồm những khoản nào ạ? Ngoài ra còn khoản thu nào khác không ạ?',
    suggested_clause:
      'Phí dịch vụ 150.000 đồng/tháng gồm: ... Ngoài các khoản ghi trong hợp đồng, bên A không thu thêm khoản nào khác.',
    confidence: 0.55,
  },
  {
    id: 'F11',
    rule_id: 'OTH-04',
    category: 'other',
    type: 'missing',
    severity: 'low',
    line_ids: [],
    quote: '',
    title: 'Không nhắc tới đăng ký tạm trú',
    explanation:
      'Bạn cần đăng ký tạm trú khi ở trọ, và việc này cần chủ nhà hỗ trợ giấy tờ. Nên hỏi trước cho chắc.',
    what_is_common: '',
    question_for_landlord: 'Anh/chị có hỗ trợ em đăng ký tạm trú không ạ?',
    suggested_clause: 'Bên A hỗ trợ bên B giấy tờ cần thiết để đăng ký tạm trú.',
    confidence: 0.7,
  },
];

export const sampleAnalysis: AnalyzeResponse = {
  contract_id: 'mau-001',
  pages: ocr.pages as PageInfo[],
  lines: ocr.lines as OcrLine[],
  key_terms: {
    rent_vnd: {
      value: 3_500_000,
      raw_text: '3.500.000 đồng/tháng',
      line_ids: ['p1-L09'],
      status: 'found',
    },
    deposit_vnd: {
      value: 7_000_000,
      raw_text: '7.000.000 đồng (hai tháng tiền nhà)',
      line_ids: ['p1-L11'],
      status: 'found',
    },
    electricity_vnd_per_kwh: {
      value: null,
      raw_text: 'theo giá chủ nhà quy định',
      line_ids: ['p1-L13'],
      status: 'unclear',
    },
    water_vnd: {
      value: 100_000,
      raw_text: '100.000 đồng/người/tháng',
      line_ids: ['p1-L13'],
      status: 'found',
    },
    water_unit: {
      value: 'per_person',
      raw_text: 'đồng/người/tháng',
      line_ids: ['p1-L13'],
      status: 'found',
    },
    service_fee_vnd: {
      value: 150_000,
      raw_text: '150.000 đồng/tháng',
      line_ids: ['p1-L14'],
      status: 'found',
    },
    term_months: { value: 12, raw_text: '12 tháng', line_ids: ['p1-L08'], status: 'found' },
    notice_days: { value: null, raw_text: '', line_ids: [], status: 'not_found' },
  },
  // Hợp đồng mẫu chỉ ghi phí dịch vụ chung, không tách wifi, gửi xe.
  other_fees: [],
  flags,
};

/** Ảnh các trang hợp đồng mẫu, theo đúng thứ tự trang. */
export const samplePageModules: number[] = [
  require('../../assets/samples/hd-mau-p1.jpg'),
  require('../../assets/samples/hd-mau-p2.jpg'),
];
