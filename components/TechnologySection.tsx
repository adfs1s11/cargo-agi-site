
import React from 'react';
import GeminiInteraction from './GeminiInteraction';

const TechnologySection: React.FC = () => {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-3xl sm:text-4xl font-orbitron font-bold text-brand-accent mb-4">The Intelligence Engine</h2>
        <p className="text-lg sm:text-xl text-brand-text-darker max-w-3xl mx-auto">
          CargoAGI is powered by a sophisticated architecture of cutting-edge technologies, designed for scalability, reliability, and continuous learning.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
        <div className="animate-slide-in-left space-y-6">
          <h3 className="text-2xl text-white font-semibold">Core Components:</h3>
          <ul className="list-disc list-inside text-brand-text space-y-2">
            <li><strong className="text-brand-accent">Artificial General Intelligence Core:</strong> Advanced reasoning, learning, and problem-solving capabilities.</li>
            <li><strong className="text-brand-accent">Predictive Machine Learning Models:</strong> For demand forecasting, route optimization, and risk assessment.</li>
            <li><strong className="text-brand-accent">Real-time Data Ingestion & Processing:</strong> Handling vast streams of information from IoT devices, global networks, and market signals.</li>
            <li><strong className="text-brand-accent">Decentralized Ledger Technology:</strong> Ensuring secure, transparent, and immutable record-keeping for critical transactions. (Conceptual)</li>
            <li><strong className="text-brand-accent">Quantum-Inspired Optimization:</strong> Exploring next-gen algorithms for complex logistical challenges. (Conceptual)</li>
          </ul>
        </div>
        <div className="animate-slide-in-right">
           <img 
            src="https://picsum.photos/seed/aiCore/600/400" 
            alt="AI Core Technology" 
            className="rounded-lg shadow-2xl object-cover w-full h-64 sm:h-80 md:h-96"
          />
        </div>
      </div>
      
      <div className="mt-12 sm:mt-20 p-6 sm:p-8 bg-brand-primary rounded-xl shadow-2xl">
        <h3 className="text-2xl sm:text-3xl font-orbitron font-bold text-brand-accent mb-6 text-center">Interact with CargoAGI</h3>
        <p className="text-brand-text-darker text-center mb-8 max-w-xl mx-auto">
          Ask a question about logistics or supply chain, and get a glimpse of CargoAGI's insights.
          (Demo powered by Gemini API)
        </p>
        <GeminiInteraction />
      </div>
    </div>
  );
};

export default TechnologySection;
