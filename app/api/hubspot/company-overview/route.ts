import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';
import { getBackendUrl } from '@/app/utils/api';
import axios from 'axios';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');

    if (!dealName) {
      return NextResponse.json({ error: 'Deal name is required' }, { status: 400 });
    }

    const apiPath = API_CONFIG.getApiPath('/company-overview');
    const backendUrl = getBackendUrl(`${apiPath}?dealName=${encodeURIComponent(dealName)}`);

    console.log('[company-overview] Fetching from:', backendUrl);
    const startTime = Date.now();

    // Use axios instead of fetch
    const response = await axios.get(backendUrl, {
      timeout: 60000, // 60 second timeout
    });

    const duration = Date.now() - startTime;
    console.log(`[company-overview] Completed in ${duration}ms`);

    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error fetching company overview:', error);
    return NextResponse.json({ error: 'Failed to fetch company overview' }, { status: 500 });
  }
} 