'use client';

/**
 * Warsaw Interactive Map Experience
 *
 * A split-screen interface with an AI agent chat panel that controls
 * an interactive Mapbox GL JS map. The agent can fly to locations,
 * add markers, draw routes, and more.
 */

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Dynamically import the Map component to avoid SSR issues
const MapComponent = dynamic(() => import('./components/MapComponent'), {
  ssr: false
});

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export type MapCommand = {
  type: 'flyTo' | 'addMarker' | 'clearMarkers' | 'drawRoute';
  data: unknown;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your Warsaw guide. I can fly the map to locations, add markers, and show you around Warsaw! Try asking me to show you famous landmarks. 🇵🇱"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapCommands, setMapCommands] = useState<MapCommand[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      });

      const data = await response.json();
      setMessages((prev) => [...prev, data.message]);

      // Apply map commands if any
      if (data.mapCommands && data.mapCommands.length > 0) {
        setMapCommands(data.mapCommands);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const examplePrompts = [
    'Show me the Palace of Culture and Science',
    'Fly to Warsaw Old Town',
    'Take me to Royal Castle',
    'Get directions from Palace of Culture to Lazienki Park'
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Left Panel - Agent Chat */}
      <div
        style={{
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '2px solid #ddd',
          backgroundColor: '#fafafa'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #ddd',
            backgroundColor: '#fff'
          }}
        >
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
            🇵🇱 Warsaw Guide
          </h1>
          <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
            AI-Powered Interactive Map
          </p>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px'
          }}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: message.role === 'user' ? '#007bff' : '#fff',
                color: message.role === 'user' ? '#fff' : '#000',
                marginLeft: message.role === 'user' ? '40px' : '0',
                marginRight: message.role === 'user' ? '0' : '40px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div
                style={{
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  fontSize: '11px',
                  opacity: 0.8,
                  textTransform: 'uppercase'
                }}
              >
                {message.role === 'user' ? 'You' : 'Guide'}
              </div>
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Style images to fit within the message box
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    img: ({ node: _node, ...props }) => (
                      <img
                        {...props}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                          borderRadius: '8px',
                          marginTop: '8px',
                          marginBottom: '8px'
                        }}
                        alt={props.alt || 'Image'}
                      />
                    ),
                    // Style links
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    a: ({ node: _node, ...props }) => (
                      <a
                        {...props}
                        style={{
                          color: message.role === 'user' ? '#fff' : '#007bff',
                          textDecoration: 'underline'
                        }}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    ),
                    // Style paragraphs
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    p: ({ node: _node, ...props }) => (
                      <p
                        {...props}
                        style={{
                          margin: '8px 0',
                          lineHeight: '1.5'
                        }}
                      />
                    ),
                    // Style lists
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    ul: ({ node: _node, ...props }) => (
                      <ul
                        {...props}
                        style={{
                          margin: '8px 0',
                          paddingLeft: '20px'
                        }}
                      />
                    ),
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    ol: ({ node: _node, ...props }) => (
                      <ol
                        {...props}
                        style={{
                          margin: '8px 0',
                          paddingLeft: '20px'
                        }}
                      />
                    )
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isLoading && (
            <div
              style={{ padding: '12px', fontStyle: 'italic', color: '#666' }}
            >
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Example Prompts */}
        {messages.length === 1 && (
          <div style={{ padding: '12px', borderTop: '1px solid #ddd' }}>
            <p
              style={{
                fontSize: '12px',
                color: '#666',
                marginBottom: '8px',
                fontWeight: 'bold'
              }}
            >
              Try asking:
            </p>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              {examplePrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => setInput(prompt)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px',
            borderTop: '1px solid #ddd',
            backgroundColor: '#fff'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Warsaw..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              style={{
                padding: '12px 20px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                opacity: isLoading || !input.trim() ? 0.5 : 1
              }}
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Right Panel - Interactive Map */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          minWidth: 0
        }}
      >
        <MapComponent mapCommands={mapCommands} />
      </div>
    </div>
  );
}
