declare module 'file-type' {
  interface FileTypeResult {
    ext: string
    mime: string
  }
  export function fileTypeFromBuffer(buffer: Uint8Array | ArrayBuffer): Promise<FileTypeResult | undefined>
  export function fileTypeFromFile(path: string): Promise<FileTypeResult | undefined>
}
