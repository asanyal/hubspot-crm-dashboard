import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';
import { getBackendUrl } from '@/app/utils/api';

export async function POST(request: Request) {
  try {
    // Get the deal names from the request body
    const dealNames = await request.json();

    if (!Array.isArray(dealNames) || dealNames.length === 0) {
      return NextResponse.json(
        { error: 'An array of deal names is required' },
        { status: 400 }
      );
    }

    const apiPath = API_CONFIG.getApiPath('deal-insights-aggregate');
    const backendUrl = getBackendUrl(apiPath);

    // Forward the request to the backend server
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealNames),
    });

    // Get the response data
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in deal-insights-aggregate route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal insights' },
      { status: 500 }
    );
  }
}