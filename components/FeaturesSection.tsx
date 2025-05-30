
import React from 'react';
import FeatureCard from './FeatureCard';
import { BoltIcon, ChartBarIcon, GlobeAltIcon, ShieldCheckIcon, CpuChipIcon, SparklesIcon } from '@heroicons/react/24/outline'; // Using Heroicons

const features = [
  {
    icon: <ChartBarIcon className="h-8 w-8" />,
    title: 'Predictive Optimization',
    description: 'Leverage AGI to forecast demand, optimize routes, and allocate resources with unparalleled accuracy, minimizing delays and costs.',
    delay: '0.1s',
  },
  {
    icon: <BoltIcon className="h-8 w-8" />,
    title: 'Autonomous Operations',
    description: 'Enable intelligent automation across your supply chain, from warehouse management to last-mile delivery coordination.',
    delay: '0.2s',
  },
  {
    icon: <GlobeAltIcon className="h-8 w-8" />,
    title: 'Global Network Visibility',
    description: 'Gain real-time, end-to-end insights into your cargo movements, with AI-powered anomaly detection and proactive alerts.',
    delay: '0.3s',
  },
  {
    icon: <ShieldCheckIcon className="h-8 w-8" />,
    title: 'AI-Powered Risk Mitigation',
    description: 'Proactively identify and mitigate potential disruptions with sophisticated risk modeling and adaptive response strategies.',
    delay: '0.4s',
  },
  {
    icon: <CpuChipIcon className="h-8 w-8" />,
    title: 'Hyper-Personalized Logistics',
    description: 'Tailor logistics solutions to individual customer needs and evolving market demands with adaptive AGI algorithms.',
    delay: '0.5s',
  },
  {
    icon: <SparklesIcon className="h-8 w-8" />,
    title: 'Sustainable & Efficient',
    description: 'Optimize for fuel efficiency, reduce carbon footprint, and promote circular economy principles through intelligent resource management.',
    delay: '0.6s',
  },
];

const FeaturesSection: React.FC = () => {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-3xl sm:text-4xl font-orbitron font-bold text-brand-accent mb-4">Core Capabilities</h2>
        <p className="text-lg sm:text-xl text-brand-text-darker max-w-2xl mx-auto">
          Discover how CargoAGI's intelligent features are shaping the next generation of logistics.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            delay={feature.delay}
          />
        ))}
      </div>
    </div>
  );
};

export default FeaturesSection;
