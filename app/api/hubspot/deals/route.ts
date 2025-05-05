import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';

export async function GET(request: Request) {
  try {
    // Get the browser ID and session ID from the request headers
    const browserId = request.headers.get('X-Browser-ID');
    const sessionId = request.headers.get('X-Session-ID');

    // Get the stage parameter from the URL
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');

    const apiPath = API_CONFIG.getApiPath('/deals');
    const backendUrl = stage 
      ? `http://localhost:8000${apiPath}?stage=${encodeURIComponent(stage)}`
      : `http://localhost:8000${apiPath}`;

    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId || '',
        'X-Session-ID': sessionId || '',
      },
    });

    // Get the response data
    const data = await response.json();

    // Create a new response with the data
    const nextResponse = NextResponse.json(data);

    // Forward any session ID from the backend response
    const backendSessionId = response.headers.get('X-Session-ID');
    if (backendSessionId) {
      nextResponse.headers.set('X-Session-ID', backendSessionId);
    }

    return nextResponse;
  } catch (error) {
    console.error('Error in deals route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals' },
      { status: 500 }
    );
  }
}