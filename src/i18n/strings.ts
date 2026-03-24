import type { Locale } from './types.js';

interface StringMap {
  errors: {
    parseIntentFailed: string;
    summarizeFailed: string;
    summarizeError: string;
    generateFailed: string;
    generateError: string;
    sessionExpired: string;
    toolCallError: string;
    processingError: string;
    actionFallback: string;
  };
  actions: {
    select: string;
    select_offer: string;
    select_seat: string;
    confirm_booking: string;
    EnterPassengers: string;
    book: string;
    view_booking: string;
    ViewDetails: string;
    cancel_booking: string;
    submit_passenger: string;
    submit_contact: string;
    search_flights: string;
  };
  ui: {
    outbound: string;
    inbound: string;
    summarizerInstruction: string;
  };
  orchestrator: {
    truncationCombo: string;
    truncationOffer: string;
    truncationOfferAlt: string;
  };
}

const ko: StringMap = {
  errors: {
    parseIntentFailed: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
    summarizeFailed: '결과를 요약할 수 없습니다.',
    summarizeError: '결과를 요약하는 중 오류가 발생했습니다.',
    generateFailed: '응답을 생성할 수 없습니다.',
    generateError: '응답을 생성하는 중 오류가 발생했습니다.',
    sessionExpired: '세션이 만료되었습니다. 다시 검색해주세요.',
    toolCallError: '도구 호출 중 오류가 발생했습니다',
    processingError: '요청을 처리하는 중 오류가 발생했습니다',
    actionFallback: '액션을 수행하려 합니다',
  },
  actions: {
    select: '사용자가 검색 결과에서 항공편 오퍼를 선택했습니다',
    select_offer: '사용자가 항공편 오퍼를 선택하여 가격을 확인하려 합니다',
    select_seat: '사용자가 좌석을 선택했습니다',
    confirm_booking: '사용자가 예약을 확정하려 합니다',
    EnterPassengers: '사용자가 승객 정보를 입력하려 합니다. passenger_form 도구를 호출하세요.',
    book: '사용자가 항공편을 예약하려 합니다',
    view_booking: '사용자가 기존 예약 정보를 조회하려 합니다',
    ViewDetails: '사용자가 예약 상세 정보를 조회하려 합니다. order_retrieve 도구를 호출하세요.',
    cancel_booking: '사용자가 예약을 취소하려 합니다',
    submit_passenger: '사용자가 승객 정보를 입력했습니다',
    submit_contact: '사용자가 연락처 정보를 입력했습니다',
    search_flights: '사용자가 항공편을 검색하려 합니다',
  },
  ui: {
    outbound: '가는편',
    inbound: '오는편',
    summarizerInstruction: '위 결과를 사용자에게 친절하고 자세하게 요약해주세요. 가이드라인을 따라 핵심 정보를 모두 포함해주세요.',
  },
  orchestrator: {
    truncationCombo: '처음 5개만 표시',
    truncationOffer: '처음 3개만 표시',
    truncationOfferAlt: '처음 5개만 표시',
  },
};

const en: StringMap = {
  errors: {
    parseIntentFailed: 'Sorry, an error occurred while processing your request. Please try again.',
    summarizeFailed: 'Unable to summarize the result.',
    summarizeError: 'An error occurred while summarizing the result.',
    generateFailed: 'Unable to generate a response.',
    generateError: 'An error occurred while generating a response.',
    sessionExpired: 'Your session has expired. Please search again.',
    toolCallError: 'An error occurred while calling the tool',
    processingError: 'An error occurred while processing your request',
    actionFallback: 'is attempting to perform an action',
  },
  actions: {
    select: 'The user selected a flight offer from the search results',
    select_offer: 'The user selected a flight offer to check the price',
    select_seat: 'The user selected a seat',
    confirm_booking: 'The user wants to confirm the booking',
    EnterPassengers: 'The user wants to enter passenger information. Call the passenger_form tool.',
    book: 'The user wants to book the flight',
    view_booking: 'The user wants to view an existing booking',
    ViewDetails: 'The user wants to view booking details. Call the order_retrieve tool.',
    cancel_booking: 'The user wants to cancel the booking',
    submit_passenger: 'The user has submitted passenger information',
    submit_contact: 'The user has submitted contact information',
    search_flights: 'The user wants to search for flights',
  },
  ui: {
    outbound: 'Outbound',
    inbound: 'Return',
    summarizerInstruction: 'Please summarize the above result in a friendly and detailed manner. Follow the guidelines and include all key information.',
  },
  orchestrator: {
    truncationCombo: 'Showing first 5',
    truncationOffer: 'Showing first 3',
    truncationOfferAlt: 'Showing first 5',
  },
};

const strings: Record<Locale, StringMap> = { ko, en };

/**
 * Get a localized string by dot-notation path.
 */
export function t(locale: Locale, path: string): string {
  const parts = path.split('.');
  let current: unknown = strings[locale];
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path; // fallback to key if not found
    }
  }
  return typeof current === 'string' ? current : path;
}

/**
 * Get the action description for a given action key.
 */
export function getActionDescription(locale: Locale, action: string): string {
  const desc = strings[locale].actions[action as keyof StringMap['actions']];
  if (desc) return desc;
  // Fallback
  const fallback = t(locale, 'errors.actionFallback');
  return `${action} — ${fallback}`;
}
