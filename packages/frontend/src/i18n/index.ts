/**
 * Frontend i18n module
 * Detects browser locale and provides translated strings.
 */

type Locale = 'ko' | 'en';

const strings: Record<Locale, Record<string, string>> = {
  ko: {
    // WelcomeScreen
    'welcome.badge': 'AI-Powered Flight Booking',
    'welcome.title': '무엇을 도와드릴까요?',
    'welcome.description': '자연어로 항공편을 검색하고 예약할 수 있습니다.',
    'welcome.description2': '아래 예시를 클릭하거나 직접 입력해보세요.',
    'welcome.footer1': 'HaloSync Flight Assistant는 NDC 기반 항공 예약 플랫폼과 연동되어 있습니다.',
    'welcome.footer2': '실제 예약은 진행되지 않습니다.',
    'welcome.suggestion.flight.title': '항공편 검색',
    'welcome.suggestion.flight.description': '"서울에서 도쿄로 3월 15일 항공편 검색해줘"',
    'welcome.suggestion.flight.message': '서울에서 도쿄로 3월 15일 성인 1명 항공편 검색해줘',
    'welcome.suggestion.seat.title': '좌석 선택',
    'welcome.suggestion.seat.description': '"창가 좌석으로 선택해줘"',
    'welcome.suggestion.seat.message': '좌석 배치도를 보여줘',
    'welcome.suggestion.booking.title': '예약 조회',
    'welcome.suggestion.booking.description': '"예약번호 ABC123 조회해줘"',
    'welcome.suggestion.booking.message': '예약 내역을 조회하고 싶어',

    // ChatInput
    'chat.placeholder': '메시지를 입력하세요...',
    'chat.attachFile': '파일 첨부 (준비 중)',
    'chat.voiceInput': '음성 입력 (준비 중)',
    'chat.sendHint': 'Enter로 전송, Shift+Enter로 줄바꿈',

    // Header
    'header.connected': '연결됨',
    'header.disconnected': '연결 끊김',
    'header.closeSidebar': '사이드바 닫기',
    'header.openSidebar': '사이드바 열기',

    // Sidebar
    'sidebar.newChat': '새 대화',
    'sidebar.today': '오늘',
    'sidebar.yesterday': '어제',
    'sidebar.thisWeek': '이번 주',
    'sidebar.older': '이전',
    'sidebar.rename': '이름 변경',
    'sidebar.delete': '삭제',
    'sidebar.emptyTitle': '대화 내역이 없습니다',
    'sidebar.emptyDescription': '새 대화를 시작해보세요',

    // chatStore
    'chat.toolCalling': '호출 중...',
    'chat.error': '오류: ',

    // ChatContainer
    'chat.connecting': '서버에 연결 중...',
    'chat.waiting': '응답을 기다리는 중...',

    // conversationStore
    'conversation.new': '새 대화',
  },
  en: {
    // WelcomeScreen
    'welcome.badge': 'AI-Powered Flight Booking',
    'welcome.title': 'How can I help you?',
    'welcome.description': 'Search and book flights using natural language.',
    'welcome.description2': 'Click an example below or type your own.',
    'welcome.footer1': 'HaloSync Flight Assistant is integrated with an NDC-based flight booking platform.',
    'welcome.footer2': 'No real bookings will be made.',
    'welcome.suggestion.flight.title': 'Search Flights',
    'welcome.suggestion.flight.description': '"Find flights from Seoul to Tokyo on March 15"',
    'welcome.suggestion.flight.message': 'Search flights from Seoul to Tokyo on March 15 for 1 adult',
    'welcome.suggestion.seat.title': 'Select Seat',
    'welcome.suggestion.seat.description': '"Select a window seat"',
    'welcome.suggestion.seat.message': 'Show me the seat map',
    'welcome.suggestion.booking.title': 'Check Booking',
    'welcome.suggestion.booking.description': '"Look up booking ABC123"',
    'welcome.suggestion.booking.message': 'I want to check my booking details',

    // ChatInput
    'chat.placeholder': 'Type a message...',
    'chat.attachFile': 'Attach file (coming soon)',
    'chat.voiceInput': 'Voice input (coming soon)',
    'chat.sendHint': 'Enter to send, Shift+Enter for newline',

    // Header
    'header.connected': 'Connected',
    'header.disconnected': 'Disconnected',
    'header.closeSidebar': 'Close sidebar',
    'header.openSidebar': 'Open sidebar',

    // Sidebar
    'sidebar.newChat': 'New Chat',
    'sidebar.today': 'Today',
    'sidebar.yesterday': 'Yesterday',
    'sidebar.thisWeek': 'This Week',
    'sidebar.older': 'Older',
    'sidebar.rename': 'Rename',
    'sidebar.delete': 'Delete',
    'sidebar.emptyTitle': 'No conversations yet',
    'sidebar.emptyDescription': 'Start a new conversation',

    // chatStore
    'chat.toolCalling': 'Calling...',
    'chat.error': 'Error: ',

    // ChatContainer
    'chat.connecting': 'Connecting to server...',
    'chat.waiting': 'Waiting for response...',

    // conversationStore
    'conversation.new': 'New Chat',
  },
};

let detectedLocale: Locale | null = null;

export function getLocale(): Locale {
  if (detectedLocale) return detectedLocale;
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  detectedLocale = lang.startsWith('ko') ? 'ko' : 'en';
  return detectedLocale;
}

export function tf(key: string): string {
  const locale = getLocale();
  return strings[locale][key] ?? strings['en'][key] ?? key;
}
