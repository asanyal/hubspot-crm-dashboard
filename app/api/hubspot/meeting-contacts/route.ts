import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/utils/config';
import { getBackendUrl } from '@/app/utils/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');

    if (!dealName) {
      return NextResponse.json({ error: 'Deal name is required' }, { status: 400 });
    }

    const apiPath = API_CONFIG.getApiPath('/meeting-contacts');
    const backendUrl = getBackendUrl(`${apiPath}?dealName=${encodeURIComponent(dealName)}`);

    // Forward the request to the backend server
    const response = await fetch(backendUrl);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching meeting contacts:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting contacts' }, { status: 500 });
  }
} 