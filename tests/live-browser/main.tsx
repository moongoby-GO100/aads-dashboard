import React from 'react';
import { createRoot } from 'react-dom/client';
import BrowserArtifactView from '../../src/components/chat/BrowserArtifactView';
import ToolLogHarness from './ToolLogHarness';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('tool-log')
  ? <ToolLogHarness />
  : <div style={{width:"100%", maxWidth:600}}><BrowserArtifactView sessionId="test-session" /></div>);
