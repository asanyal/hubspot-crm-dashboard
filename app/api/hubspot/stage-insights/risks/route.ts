import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/utils/api';

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    if (!stage || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Stage, start_date, and end_date are required' },
        { status: 400 }
      );
    }

    // Construct the backend URL
    const rootUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const backendUrl = `${rootUrl}/api/hubspot/stage-insights/risks?stage=${encodeURIComponent(stage)}&start_date=${start_date}&end_date=${end_date}`;

    console.log('Forwarding to backend:', backendUrl);

    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId,
        'X-Session-ID': sessionId || '',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error response:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

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
    console.error('Error in stage-insights risks route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch risks' },
      { status: 500 }
    );
  }
}
