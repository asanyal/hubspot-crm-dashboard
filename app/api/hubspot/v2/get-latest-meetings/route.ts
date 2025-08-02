import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/utils/api';
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
    const days = searchParams.get('days') || '3';
    
    const apiPath = API_CONFIG.getApiPath('/get-latest-meetings');
    const backendUrl = getBackendUrl(`${apiPath}?days=${days}`);

    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId || '',
        'X-Session-ID': sessionId || '',
      },
    });

    // Check if the backend response is successful
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend server error: ${response.status} - ${errorText}`);
    }

    // Get the response data
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error('Backend returned invalid JSON response');
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
    return NextResponse.json(
      { error: 'Failed to fetch latest meetings' },
      { status: 500 }
    );
  }
} 