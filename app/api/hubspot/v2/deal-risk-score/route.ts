import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';
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

    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('deal_name');
    
    if (!dealName) {
      return NextResponse.json(
        { error: 'Deal name parameter is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching risk score for deal: ${dealName}`);
    
    const apiPath = API_CONFIG.getApiPath('/deal-risk-score');
    const backendUrl = getBackendUrl(`${apiPath}?deal_name=${encodeURIComponent(dealName)}`);
    
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
    console.error('Error in deal-risk-score route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal risk score' },
      { status: 500 }
    );
  }
} 