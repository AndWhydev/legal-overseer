declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand
    output(target: string): FfmpegCommand
    outputOptions(...options: string[]): FfmpegCommand
    inputOptions(...options: string[]): FfmpegCommand
    audioFilters(...filters: string[]): FfmpegCommand
    videoFilters(...filters: string[]): FfmpegCommand
    seekInput(time: number | string): FfmpegCommand
    duration(time: number | string): FfmpegCommand
    format(format: string): FfmpegCommand
    frames(count: number): FfmpegCommand
    size(size: string): FfmpegCommand
    on(event: string, callback: (...args: any[]) => void): FfmpegCommand
    run(): FfmpegCommand
    save(output: string): FfmpegCommand
    screenshots(options: Record<string, unknown>): FfmpegCommand
    ffprobe(callback: (err: Error | null, metadata: any) => void): void
  }

  interface FfmpegStatic {
    (input?: string): FfmpegCommand
    setFfmpegPath(path: string): void
    setFfprobePath(path: string): void
    ffprobe(file: string, callback: (err: Error | null, metadata: any) => void): void
  }

  const ffmpeg: FfmpegStatic
  export = ffmpeg
}
