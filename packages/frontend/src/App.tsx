/**
 * App Component - Main Application Entry
 */

import { MainLayout } from './components/layout';
import { ChatContainer } from './components/chat';

function App() {
  return (
    <MainLayout>
      <ChatContainer />
    </MainLayout>
  );
}

export default App;
