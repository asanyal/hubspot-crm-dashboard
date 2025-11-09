import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';
import { getBackendUrl } from '@/app/utils/api';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    console.log('[get-concerns] Route handler started at:', new Date().toISOString());

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
    const dealName = searchParams.get('dealName');

    if (!dealName) {
      return NextResponse.json(
        { error: 'Deal name parameter is required' },
        { status: 400 }
      );
    }

    console.log(`[get-concerns] Fetching concerns for deal: ${dealName}`);

    const apiPath = API_CONFIG.getApiPath('/get-concerns');
    const backendUrl = getBackendUrl(`${apiPath}?dealName=${encodeURIComponent(dealName)}`);

    // Log the actual URL being called
    console.log('[get-concerns] Backend URL:', backendUrl);
    console.log('[get-concerns] Making backend request at:', new Date().toISOString(), `(${Date.now() - startTime}ms elapsed)`);

    const fetchStartTime = Date.now();

    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      headers: {
        'X-Browser-ID': browserId,
        'X-Session-ID': sessionId || '',
      },
    });

    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`[get-concerns] Backend responded in ${fetchDuration}ms with status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[get-concerns] Backend error response:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const jsonStartTime = Date.now();
    const data = await response.json();
    const jsonDuration = Date.now() - jsonStartTime;
    console.log(`[get-concerns] JSON parsing took ${jsonDuration}ms`);

    // Create a new response with the data
    const nextResponse = NextResponse.json(data);

    // Forward any session ID from the backend response
    const backendSessionId = response.headers.get('X-Session-ID');
    if (backendSessionId) {
      nextResponse.headers.set('X-Session-ID', backendSessionId);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[get-concerns] Total route handler duration: ${totalDuration}ms`);

    return nextResponse;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[get-concerns] Error after ${totalDuration}ms:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch concerns' },
      { status: 500 }
    );
  }
} 