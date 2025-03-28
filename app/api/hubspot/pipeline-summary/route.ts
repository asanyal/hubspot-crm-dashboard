// app/api/hubspot/pipeline-summary/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get all deals to calculate the pipeline summary
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/hubspot/pipeline-summary`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching pipeline summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pipeline summary' },
      { status: 500 }
    );
  }
}