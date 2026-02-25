export async function POST(request: Request) {
  const { query } = await request.json() as { query: string; context?: string };

  await new Promise(r => setTimeout(r, 500));

  return Response.json({
    response: `You asked: "${query}". AI responses will be connected soon.`,
  });
}
