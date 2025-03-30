import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get the browser ID and session ID from the request headers
    const browserId = request.headers.get('X-Browser-ID');
    const sessionId = request.headers.get('X-Session-ID');

    // Forward the request to the backend server
    const response = await fetch('http://localhost:8000/api/hubspot/stages', {
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
    console.error('Error in stages route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stages' },
      { status: 500 }
    );
  }
}