export async function POST() {
  return Response.json(
    { error: 'Voice processing is not yet implemented. This endpoint is planned for a future release.' },
    { status: 501 },
  )
}
