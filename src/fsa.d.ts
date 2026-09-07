/**
 * TS 기본 DOM lib 에 FileSystemDirectoryHandle 과 entries() 는 이미 있지만
 * 피커와 권한 API 는 아직 빠져 있어 그 부분만 보강합니다.
 */
export {}

declare global {
  interface FileSystemPermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission(desc?: FileSystemPermissionDescriptor): Promise<PermissionState>
    requestPermission(desc?: FileSystemPermissionDescriptor): Promise<PermissionState>
  }

  interface DirectoryPickerOptions {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  }

  interface SaveFilePickerOptions {
    id?: string
    suggestedName?: string
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
    types?: { description?: string; accept: Record<string, string[]> }[]
  }

  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  }
}
