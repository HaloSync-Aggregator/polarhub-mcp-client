/**
 * Welcome Screen Component - HaloSync Design System
 * Displayed when no conversation has started
 */

import { Plane, Armchair, ClipboardList, Sparkles } from 'lucide-react';

interface SuggestionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function SuggestionCard({ icon, title, description, onClick }: SuggestionCardProps) {
  return (
    <button
      onClick={onClick}
      className="group bg-white border border-border-light rounded-3xl text-left flex flex-col gap-3 p-5 min-w-[200px] max-w-[280px] shadow-card hover:shadow-card-hover hover:border-halo-purple transition-all duration-300"
    >
      <div className="w-10 h-10 rounded-xl bg-halo-purple-light flex items-center justify-center text-halo-purple group-hover:bg-halo-purple group-hover:text-white transition-all duration-300">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-text-primary group-hover:text-halo-purple transition-colors">
          {title}
        </h3>
        <p className="text-sm text-text-secondary mt-1">{description}</p>
      </div>
    </button>
  );
}

interface WelcomeScreenProps {
  onSuggestionClick: (message: string) => void;
}

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const suggestions = [
    {
      icon: <Plane size={20} />,
      title: '항공편 검색',
      description: '"서울에서 도쿄로 3월 15일 항공편 검색해줘"',
      message: '서울에서 도쿄로 3월 15일 성인 1명 항공편 검색해줘',
    },
    {
      icon: <Armchair size={20} />,
      title: '좌석 선택',
      description: '"창가 좌석으로 선택해줘"',
      message: '좌석 배치도를 보여줘',
    },
    {
      icon: <ClipboardList size={20} />,
      title: '예약 조회',
      description: '"예약번호 ABC123 조회해줘"',
      message: '예약 내역을 조회하고 싶어',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="mb-8">
        <img src="/logo.png" alt="HaloSync" className="h-12" />
      </div>

      {/* Welcome message */}
      <div className="text-center mb-10 max-w-lg">
        <div className="inline-flex items-center gap-2 bg-halo-purple-light text-halo-purple px-4 py-1.5 rounded-full text-sm font-medium mb-4">
          <Sparkles size={14} />
          AI-Powered Flight Booking
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-3">
          무엇을 도와드릴까요?
        </h1>
        <p className="text-text-secondary text-lg">
          자연어로 항공편을 검색하고 예약할 수 있습니다.
          <br />
          아래 예시를 클릭하거나 직접 입력해보세요.
        </p>
      </div>

      {/* Suggestion Cards */}
      <div className="flex flex-wrap justify-center gap-4">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={index}
            icon={suggestion.icon}
            title={suggestion.title}
            description={suggestion.description}
            onClick={() => onSuggestionClick(suggestion.message)}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-10 text-xs text-text-muted text-center max-w-md">
        HaloSync Flight Assistant는 NDC 기반 항공 예약 플랫폼과 연동되어 있습니다.
        <br />
        실제 예약은 진행되지 않습니다.
      </p>
    </div>
  );
}
