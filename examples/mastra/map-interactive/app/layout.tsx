import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Warsaw Interactive Map - Mapbox MCP',
  description: 'Interactive map experience with AI agent control'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css"
          rel="stylesheet"
        />
        <style>{`
          html, body, #__next {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            overflow: hidden;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
