import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/utils/api';

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
    const backendUrl = getBackendUrl(`/api/hubspot/v2/deal-info?dealName=${encodeURIComponent(dealName)}`);

    console.log('Deal info v2 API call:', {
      dealName,
      backendUrl,
      browserId: browserId ? 'present' : 'missing',
      sessionId: sessionId ? 'present' : 'missing'
    });

    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId || '',
        'X-Session-ID': sessionId || '',
      },
    });

    console.log('Backend response status:', response.status);

    // Check if the backend response is successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error response:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`Backend server error: ${response.status} - ${errorText}`);
    }

    // Get the response data
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse backend response as JSON:', jsonError);
      const responseText = await response.text();
      console.error('Raw response text:', responseText);
      throw new Error('Backend returned invalid JSON response');
    }

    console.log('Backend data received:', {
      hasData: !!data,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : [],
      dealOwner: data?.dealOwner
    });

    // Create a new response with the data
    const nextResponse = NextResponse.json(data);

    // Forward any session ID from the backend response
    const backendSessionId = response.headers.get('X-Session-ID');
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
    
    console.error('Error in deal-info v2 route:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      dealName,
      browserId: browserId ? 'present' : 'missing',
      sessionId: sessionId ? 'present' : 'missing'
    });
    
    // Return more specific error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch deal info: ${errorMessage}` },
      { status: 500 }
    );
  }
}
