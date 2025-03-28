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

    console.log(`Fetching timeline for deal: ${dealName}`);
    
    const backendUrl = `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hubspot/deal-timeline?dealName=${encodeURIComponent(dealName)}`;
    console.log(`Calling backend URL: ${backendUrl}`);
    
    const response = await fetch(backendUrl, {
      headers: {
        'Content-Type': 'application/json',
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
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching deal timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal timeline' },
      { status: 500 }
    );
  }
}