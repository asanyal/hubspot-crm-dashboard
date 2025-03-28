// app/api/hubspot/deal-info/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');
    
    if (!dealName) {
      return NextResponse.json(
        { error: 'Deal name parameter is required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hubspot/deal-info?dealName=${encodeURIComponent(dealName)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching deal info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal info' },
      { status: 500 }
    );
  }
}