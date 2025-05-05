import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';

export async function GET(request: Request) {
  try {
    // Get the browser ID and session ID from the request headers
    const browserId = request.headers.get('X-Browser-ID');
    const sessionId = request.headers.get('X-Session-ID');

    if (!browserId) {
      return NextResponse.json(
        { error: 'Browser ID is required' },
        { status: 400 }
      );
    }

    const apiPath = API_CONFIG.getApiPath('/all-deals');
    const backendUrl = `http://localhost:8000${apiPath}`;

    // Forward the request to the backend server
    const response = await fetch(
      backendUrl,
      {
        headers: {
          'X-Browser-ID': browserId,
          'X-Session-ID': sessionId || '',
        },
      }
    );

    // Get the response data
    const data = await response.json();
    
    // Log the response for debugging
    console.log('Backend response status:', response.status);
    console.log('Backend response data:', data);
    console.log('Response type:', typeof data);
    if (Array.isArray(data)) {
      console.log('Response is an array with length:', data.length);
    }

    // Create a new response with the data
    const nextResponse = NextResponse.json(data);

    // Forward any session ID from the backend response
    const backendSessionId = response.headers.get('X-Session-ID');
    if (backendSessionId) {
      nextResponse.headers.set('X-Session-ID', backendSessionId);
    }

    return nextResponse;
  } catch (error) {
    console.error('Error in all-deals route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch all deals' },
      { status: 500 }
    );
  }
}