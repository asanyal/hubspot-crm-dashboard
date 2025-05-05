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

    const { searchParams } = new URL(request.url);
    const callTitle = searchParams.get('call_title');
    const callDate = searchParams.get('call_date');
    
    if (!callTitle || !callDate) {
      return NextResponse.json(
        { error: 'Call title and date parameters are required' },
        { status: 400 }
      );
    }

    console.log(`Fetching concerns for call: ${callTitle} on date: ${callDate}`);
    
    const apiPath = API_CONFIG.getApiPath('/get-concerns');
    const backendUrl = `http://localhost:8000${apiPath}?call_title=${encodeURIComponent(callTitle)}&call_date=${encodeURIComponent(callDate)}`;
    
    // Log the actual URL being called
    console.log('Making request to backend URL:', backendUrl);
    
    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId,
        'X-Session-ID': sessionId || '',
      },
    });
    
    console.log(`Backend response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error response:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

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
    console.error('Error fetching concerns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concerns' },
      { status: 500 }
    );
  }
} 