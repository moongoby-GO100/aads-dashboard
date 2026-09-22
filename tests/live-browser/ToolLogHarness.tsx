import { useState } from 'react';
import { useToolLogFollow } from '../../src/features/chat/viewport/useToolLogFollow';

export default function ToolLogHarness() {
  const [count, setCount] = useState(30);
  const viewport = useToolLogFollow('test-message', String(count));
  return <>
    <button onClick={() => setCount(n => n + 1)}>Append log</button>
    <div data-testid="outer-chat" style={{height: 400, overflowY: 'auto'}}>
      <div style={{height: 500}}>Older chat</div>
      <div data-testid="tool-log" ref={viewport.ref} onScroll={viewport.onScroll}
        style={{height: 120, overflowY: 'auto'}}>
        {Array.from({length: count}, (_, i) => <div key={i} style={{height: 30}}>Log {i}</div>)}
      </div>
      <div style={{height: 500}}>Later chat</div>
    </div>
  </>;
}
