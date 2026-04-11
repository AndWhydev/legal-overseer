export interface Whisper {
  text: string
  score: number
  source: string
  context: Record<string, unknown>
}
