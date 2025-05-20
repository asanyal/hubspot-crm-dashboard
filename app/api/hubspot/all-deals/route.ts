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

    const apiPath = API_CONFIG.getApiPath('/all-deals');
    console.log('ALL DEALS: API PATH', apiPath);
    const backendUrl = getBackendUrl(apiPath);
    console.log('ALL DEALS: BACKEND URL', backendUrl);

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