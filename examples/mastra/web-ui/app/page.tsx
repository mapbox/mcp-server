'use client';

/**
 * Warsaw Tour Guide - Chat Interface with MCP-UI Support
 *
 * A chat UI for interacting with the Mapbox MCP agent with support
 * for rendering rich UI resources via MCP-UI
 */

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Dynamically import UIResourceRenderer to avoid SSR issues
const UIResourceRenderer = dynamic(
  () => import('@mcp-ui/client').then((mod) => mod.UIResourceRenderer),
  { ssr: false }
);

type UIResource = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  uiResources?: UIResource[];
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your Warsaw tour guide. Ask me about famous landmarks, directions, or places to visit in Warsaw! 🇵🇱"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      setMessages((prev) => [...prev, data]);
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

  // Example prompts
  const examplePrompts = [
    'Show me a map of the Palace of Culture and Science',
    'Create a static map of Warsaw Old Town',
    'Get directions from Old Town to Royal Castle',
    'Show me a map of Łazienki Park',
    'Find cafes near Lazienki Park',
    'Generate a map with a marker at Royal Castle'
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px'
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h1
          style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}
        >
          🇵🇱 Warsaw Tour Guide
        </h1>
        <p style={{ color: '#666' }}>Powered by Mastra + Mapbox MCP Server</p>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          backgroundColor: '#fafafa'
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
              marginLeft: message.role === 'user' ? 'auto' : '0',
              marginRight: message.role === 'user' ? '0' : 'auto',
              maxWidth: '80%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                fontSize: '12px',
                opacity: 0.8
              }}
            >
              {message.role === 'user' ? 'You' : 'Tour Guide'}
            </div>

            {/* Render text content with markdown support */}
            <div
              style={{
                marginBottom:
                  message.uiResources && message.uiResources.length > 0
                    ? '12px'
                    : '0'
              }}
              className="markdown-content"
            >
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

            {/* Render MCP-UI resources if available */}
            {message.uiResources && message.uiResources.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                {message.uiResources.map((resource, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '12px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      maxWidth: '100%',
                      maxHeight: '400px'
                    }}
                  >
                    <UIResourceRenderer
                      resource={resource}
                      onUIAction={async (action) => {
                        console.log('UI Action:', action);
                        // You can add any async logic here if needed
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ padding: '12px', fontStyle: 'italic', color: '#666' }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Example Prompts */}
      {messages.length === 1 && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            Try asking:
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {examplePrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => setInput(prompt)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '16px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Warsaw landmarks..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '16px'
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            opacity: isLoading || !input.trim() ? 0.5 : 1
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
