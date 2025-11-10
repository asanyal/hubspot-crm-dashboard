import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/utils/api';
import axios from 'axios';

export async function GET(request: Request) {
  try {
    // Get the browser ID and session ID from the request headers
    const browserId = request.headers.get('X-Browser-ID');
    const sessionId = request.headers.get('X-Session-ID');

    // Get the dealName parameter from the URL
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');

    if (!dealName) {
      return NextResponse.json(
        { error: 'Deal name parameter is required' },
        { status: 400 }
      );
    }

    // Construct the backend URL directly for v2 endpoint
    const backendUrl = getBackendUrl(`/api/hubspot/v2/deal-timeline?dealName=${encodeURIComponent(dealName)}`);

    console.log('Deal timeline v2 API call:', {
      dealName,
      backendUrl,
      browserId: browserId ? 'present' : 'missing',
      sessionId: sessionId ? 'present' : 'missing'
    });

    const startTime = Date.now();

    // Use axios instead of fetch to bypass Next.js fetch issues
    const response = await axios.get(backendUrl, {
      headers: {
        'X-Browser-ID': browserId || '',
        'X-Session-ID': sessionId || '',
      },
      timeout: 60000, // 60 second timeout
    });

    const duration = Date.now() - startTime;
    console.log(`[deal-timeline-v2] Completed in ${duration}ms with status: ${response.status}`);

    const data = response.data;

    console.log('Backend data received:', {
      hasData: !!data,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : []
    });

    // Create a new response with the data
    const nextResponse = NextResponse.json(data);

    // Forward any session ID from the backend response
    const backendSessionId = response.headers['x-session-id'];
    if (backendSessionId) {
      nextResponse.headers.set('X-Session-ID', backendSessionId);
    }

    return nextResponse;
  } catch (error) {
    // Get the parameters again for error logging
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');
    const browserId = request.headers.get('X-Browser-ID');
    const sessionId = request.headers.get('X-Session-ID');
    
    console.error('Error in deal-timeline v2 route:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      dealName,
      browserId: browserId ? 'present' : 'missing',
      sessionId: sessionId ? 'present' : 'missing'
    });
    
    // Return more specific error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch deal timeline: ${errorMessage}` },
      { status: 500 }
    );
  }
} 