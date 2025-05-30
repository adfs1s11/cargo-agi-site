
import React, { useState, useCallback } from 'react';
import { sendQueryToGemini } from '../services/geminiService';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

const GeminiInteraction: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);

  // Check for API key on component mount
  // This is a simplified check. In a real app, process.env might not be directly accessible in client-side JS
  // without specific build tool configurations (like Vite or Webpack).
  // For this exercise, we assume it might be available or we'll show a message.
  React.useEffect(() => {
    if (!process.env.API_KEY) { // This check relies on build-time env var injection or a global var
        // A more robust way for client-side might be to have a config file or a dedicated API endpoint
        // that checks server-side env vars. For this example, this direct check will often result in true on client.
        // Thus, the service will handle the actual check.
    }
  }, []);


  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError("Please enter a question.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResponse('');
    setApiKeyMissing(false);

    try {
      const result = await sendQueryToGemini(query);
      if (result.startsWith("API Key not configured")) {
        setApiKeyMissing(true);
        setError(result);
      } else {
        setResponse(result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      if (errorMessage.includes("API_KEY")) {
          setApiKeyMissing(true);
          setError("Gemini API Key is not configured or invalid. Please set the API_KEY environment variable.");
      } else {
          setError(`Error: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., How can AI optimize shipping routes?"
          className="flex-grow p-3 bg-brand-secondary border border-brand-accent/30 rounded-lg text-brand-text focus:ring-2 focus:ring-brand-accent focus:border-brand-accent outline-none transition-all"
          disabled={isLoading || apiKeyMissing}
        />
        <button
          type="submit"
          className="bg-brand-accent hover:bg-brand-accent-hover text-white p-3 rounded-lg transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          disabled={isLoading || apiKeyMissing || !query.trim()}
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <PaperAirplaneIcon className="h-5 w-5" />
          )}
        </button>
      </form>

      {apiKeyMissing && (
        <div className="p-4 mb-4 text-sm text-yellow-300 bg-yellow-800/30 rounded-lg" role="alert">
          <span className="font-medium">Demo Limitation:</span> Gemini API Key is not configured. This interactive demo requires a valid API_KEY environment variable to be set up.
        </div>
      )}

      {error && !apiKeyMissing && (
        <div className="p-4 mb-4 text-sm text-red-400 bg-red-800/30 rounded-lg" role="alert">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {response && (
        <div className="p-4 bg-brand-secondary border border-brand-accent/20 rounded-lg">
          <h4 className="font-semibold text-brand-accent mb-2">CargoAGI Responds:</h4>
          <p className="text-brand-text whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </div>
  );
};

export default GeminiInteraction;
