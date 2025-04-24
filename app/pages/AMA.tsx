'use client';

import React, { useState } from 'react';
import DealList from '../components/DealList';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant' | 'error';
  timestamp: string;
}

const AMA: React.FC = () => {
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDealSelect = (dealName: string) => {
    setSelectedDeal(dealName);
    setMessages([]); // Clear messages when selecting a new deal
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedDeal) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/hubspot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Browser-ID': localStorage.getItem('browserId') || ''
        },
        body: JSON.stringify({
          message: newMessage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: error instanceof Error ? error.message : 'An error occurred',
        sender: 'error',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel - Deal List */}
      <DealList onDealSelect={handleDealSelect} />

      {/* Middle Panel - Month Range Slider */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="h-full flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Select Date Range</h2>
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="w-full h-2 bg-gray-200 rounded-full mb-4">
              {/* Slider track */}
            </div>
            <div className="flex justify-between w-full text-sm">
              <span>Jan 2023</span>
              <span>Dec 2024</span>
            </div>
            <button 
              className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors"
              disabled={!selectedDeal}
            >
              Load Conversations
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Chat Interface */}
      <div className="flex-1 bg-white p-4">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {selectedDeal ? `Chat with ${selectedDeal}` : 'Select a deal to start chatting'}
            </h2>
          </div>
          
          {/* Chat Messages Area */}
          <div className="flex-1 bg-gray-50 rounded-lg p-4 mb-4 overflow-y-auto">
            {!selectedDeal ? (
              <div className="h-full flex items-center justify-center text-gray-400">
                Select a deal and date range to view conversations
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.sender === 'user'
                          ? 'bg-sky-600 text-white'
                          : message.sender === 'error'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                      <div className={`text-xs mt-1 ${
                        message.sender === 'user' 
                          ? 'text-sky-100' 
                          : message.sender === 'error'
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Type your question..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              disabled={!selectedDeal || isLoading}
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={!selectedDeal || isLoading || !newMessage.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AMA; 