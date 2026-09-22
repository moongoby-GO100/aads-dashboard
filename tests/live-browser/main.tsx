import React from 'react';
import { createRoot } from 'react-dom/client';
import BrowserArtifactView from '../../src/components/chat/BrowserArtifactView';
createRoot(document.getElementById('root')!).render(<div style={{width:600}}><BrowserArtifactView sessionId="test-session" /></div>);
