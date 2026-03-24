/**
 * Welcome Screen Component - HaloSync Design System
 * Displayed when no conversation has started
 */

import { Plane, Armchair, ClipboardList, Sparkles } from 'lucide-react';
import { tf } from '../../i18n';

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
      title: tf('welcome.suggestion.flight.title'),
      description: tf('welcome.suggestion.flight.description'),
      message: tf('welcome.suggestion.flight.message'),
    },
    {
      icon: <Armchair size={20} />,
      title: tf('welcome.suggestion.seat.title'),
      description: tf('welcome.suggestion.seat.description'),
      message: tf('welcome.suggestion.seat.message'),
    },
    {
      icon: <ClipboardList size={20} />,
      title: tf('welcome.suggestion.booking.title'),
      description: tf('welcome.suggestion.booking.description'),
      message: tf('welcome.suggestion.booking.message'),
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
          {tf('welcome.badge')}
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-3">
          {tf('welcome.title')}
        </h1>
        <p className="text-text-secondary text-lg">
          {tf('welcome.description')}
          <br />
          {tf('welcome.description2')}
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
        {tf('welcome.footer1')}
        <br />
        {tf('welcome.footer2')}
      </p>
    </div>
  );
}
