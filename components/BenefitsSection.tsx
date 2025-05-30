
import React from 'react';
import { ArrowTrendingUpIcon, CurrencyDollarIcon, ShieldExclamationIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';

interface BenefitItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: string;
}

const BenefitItem: React.FC<BenefitItemProps> = ({ icon, title, description, delay }) => (
  <div 
    className="bg-brand-secondary p-6 rounded-lg shadow-xl transform transition-all duration-300 hover:scale-105 hover:shadow-brand-accent/40 animate-fade-in-up"
    style={{ animationDelay: delay }}
  >
    <div className="flex items-center mb-4">
      <span className="p-3 rounded-full bg-brand-accent/10 text-brand-accent mr-4 text-2xl">
        {icon}
      </span>
      <h3 className="text-xl font-orbitron font-semibold text-white">{title}</h3>
    </div>
    <p className="text-brand-text-darker text-sm leading-relaxed">{description}</p>
  </div>
);

const BenefitsSection: React.FC = () => {
  const benefits = [
    {
      icon: <ArrowTrendingUpIcon className="h-7 w-7" />,
      title: 'Unprecedented Efficiency',
      description: 'Streamline operations, reduce transit times, and maximize asset utilization with AI-driven decision-making.',
      delay: '0.1s'
    },
    {
      icon: <CurrencyDollarIcon className="h-7 w-7" />,
      title: 'Significant Cost Reduction',
      description: 'Minimize fuel consumption, labor costs, and operational waste through intelligent automation and optimization.',
      delay: '0.2s'
    },
    {
      icon: <ShieldExclamationIcon className="h-7 w-7" />,
      title: 'Enhanced Resilience',
      description: 'Proactively adapt to disruptions, mitigate risks, and ensure supply chain continuity in a volatile global landscape.',
      delay: '0.3s'
    },
    {
      icon: <CubeTransparentIcon className="h-7 w-7" />,
      title: 'Future-Proof Operations',
      description: 'Embrace the next era of logistics. Stay ahead of the curve with a continuously learning and evolving AGI platform.',
      delay: '0.4s'
    },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-3xl sm:text-4xl font-orbitron font-bold text-brand-accent mb-4">Transform Your Business</h2>
        <p className="text-lg sm:text-xl text-brand-text-darker max-w-2xl mx-auto">
          CargoAGI delivers tangible benefits that translate into a stronger, more agile, and profitable logistics operation.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        {benefits.map((benefit) => (
          <BenefitItem
            key={benefit.title}
            icon={benefit.icon}
            title={benefit.title}
            description={benefit.description}
            delay={benefit.delay}
          />
        ))}
      </div>
    </div>
  );
};

export default BenefitsSection;
