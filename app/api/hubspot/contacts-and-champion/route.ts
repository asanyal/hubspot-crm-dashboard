import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealName = searchParams.get('dealName');
    const date = searchParams.get('date');
    
    if (!dealName || !date) {
      return NextResponse.json(
        { error: 'Deal name and date parameters are required' },
        { status: 400 }
      );
    }

    console.log(`Fetching contacts and champions for deal: ${dealName} on date: ${date}`);
    
    const backendUrl = `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hubspot/contacts-and-champion?dealName=${encodeURIComponent(dealName)}&date=${encodeURIComponent(date)}`;
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
    console.error('Error fetching contacts and champions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts and champions' },
      { status: 500 }
    );
  }
} 