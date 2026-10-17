// File System Access API bits missing from lib.dom (Chromium-only today).
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface Window {
  showDirectoryPicker?(o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>;
}
