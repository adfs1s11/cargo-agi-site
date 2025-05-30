
import React from 'react';

const AboutSection: React.FC = () => {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-3xl sm:text-4xl font-orbitron font-bold text-brand-accent mb-4">Redefining Logistics</h2>
        <p className="text-lg sm:text-xl text-brand-text-darker max-w-2xl mx-auto">
          At CargoAGI, we are at the forefront of the next industrial revolution, integrating advanced Artificial General Intelligence into the heart of logistics.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
        <div className="animate-slide-in-left">
          <img 
            src="https://picsum.photos/seed/logisticsAI/600/400" 
            alt="AI in Logistics" 
            className="rounded-lg shadow-2xl object-cover w-full h-64 sm:h-80 md:h-96"
          />
        </div>
        <div className="space-y-6 animate-slide-in-right">
          <h3 className="text-2xl sm:text-3xl font-semibold text-white">Our Mission</h3>
          <p className="text-brand-text leading-relaxed">
            To create a seamlessly intelligent, autonomous, and sustainable global supply chain ecosystem. We believe AGI can unlock unprecedented levels of efficiency, predictability, and resilience in how goods are moved, managed, and delivered worldwide.
          </p>
          <h3 className="text-2xl sm:text-3xl font-semibold text-white">Our Vision</h3>
          <p className="text-brand-text leading-relaxed">
            A future where logistics operates with near-perfect foresight, adapting instantaneously to global changes, minimizing waste, and empowering businesses of all sizes to thrive in a complex, interconnected world. CargoAGI is not just a service; it's the new paradigm for intelligent cargo management.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutSection;
