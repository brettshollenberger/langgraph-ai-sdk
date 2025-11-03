import React from 'react';
import { createRoot } from 'react-dom/client';
import { LangGraphChat } from './chat.tsx';
import './tailwind.css';

const App = () => {
  return <LangGraphChat />;
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
