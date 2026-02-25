import ChatInterface from './ChatInterface';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gray-50 pt-14">
      {/* Main content - pt-14 accounts for fixed nav */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <ChatInterface />
      </main>
    </div>
  );
}
