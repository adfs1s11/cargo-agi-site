
import React from 'react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, delay = '0s' }) => {
  return (
    <div 
      className="bg-brand-secondary p-6 rounded-xl shadow-2xl hover:shadow-brand-accent/30 transition-all duration-300 transform hover:-translate-y-1 flex flex-col items-center text-center animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div className="p-4 bg-brand-primary rounded-full mb-4 text-brand-accent text-3xl">
        {icon}
      </div>
      <h3 className="text-xl font-orbitron font-semibold text-white mb-3">{title}</h3>
      <p className="text-brand-text-darker text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
};

export default FeatureCard;
