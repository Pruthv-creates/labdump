import { FileType } from '@/types/database';

export function getMimeToType(mime: string): FileType {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/webp':
      return 'image';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'audio/mpeg':
    case 'audio/wav':
    case 'audio/ogg':
    case 'audio/mp4':
      return 'audio';
    default:
      return 'file';
  }
}

export function validateFile(file: File): {
  valid: boolean;
  error: string | null;
  type: FileType | null;
} {
  const maxSizeInBytes = 50 * 1024 * 1024; // 50MB

  if (file.size > maxSizeInBytes) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `This file is ${sizeInMB}MB. LabDump supports up to 50MB.`,
      type: null,
    };
  }

  return {
    valid: true,
    error: null,
    type: getMimeToType(file.type),
  };
}
