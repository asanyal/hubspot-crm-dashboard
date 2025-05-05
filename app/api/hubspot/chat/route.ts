import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    const browserId = request.headers.get('X-Browser-ID');

    if (!message) {
      return NextResponse.json(
        { error: 'Missing query parameter' },
        { status: 400 }
      );
    }

    const apiPath = API_CONFIG.getApiPath('/ask-customer');
    const backendUrl = `http://localhost:8000${apiPath}`;

    // Make API call to the ask-customer endpoint
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-ID': browserId || ''
      },
      body: JSON.stringify({
        query: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.detail || 'Failed to process chat message' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ response: data.answer });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
} 